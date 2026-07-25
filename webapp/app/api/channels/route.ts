// ──────────────────────────────────────────────────────────────────────────────
// app/api/channels/route.ts
// Channel passport CRUD (list + create) — multi-channel.md §2, Phase 2.
//
// The channel row is the PASSPORT only: the actual credential lives in env as
// YOUTUBE_REFRESH_TOKEN_<CREDENTIAL_KEY> and is provisioned by the CLI
// (`npx tsx scripts/youtube-consent.ts --key <KEY>`), never through the UI.
// Creating a channel here therefore never touches secrets — the response
// carries the env var name + consent command the Director must run next.
// Write access for the Director session comes from RLS policies in 0050.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk, apiCreated } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { ConflictError } from '@/lib/api/errors';
import { resolveChannelRefreshToken } from '@/lib/agents/providers/google-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateBody = z.object({
  name: z.string().min(1).max(80),
  // UC + 22 id chars — the shape YouTube has used for years; keep strict so a
  // pasted handle/URL fails loudly here instead of at the identity guard.
  youtube_channel_id: z
    .string()
    .regex(/^UC[0-9A-Za-z_-]{22}$/, 'Expected a YouTube channel id (UC…, 24 chars total)'),
  // Mirrors the DB CHECK (0046): ^[A-Z][A-Z0-9_]*$.
  credential_key: z
    .string()
    .max(32)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Key must be UPPER_SNAKE starting with a letter (e.g. SANDY2)'),
  ntfy_topic: z.string().min(1).max(120).optional(),
});

export const GET = withApiHandler(async () => {
  const { supabase } = await requireDirector();
  const { data, error } = await supabase
    .from('channels')
    .select('id, name, youtube_channel_id, credential_key, ntfy_topic, status, metadata, created_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`channels list failed: ${error.message}`);
  // has_token = the named env credential exists for this passport (never the
  // token itself). Lets the UI show "authorize me" state honestly.
  const rows = (data ?? []).map((c) => {
    let hasToken = true;
    try {
      resolveChannelRefreshToken((c as { credential_key: string }).credential_key);
    } catch {
      hasToken = false;
    }
    return { ...(c as Record<string, unknown>), has_token: hasToken };
  });
  return apiOk(rows, { total: rows.length });
});

export const POST = withApiHandler(async (req) => {
  const { supabase } = await requireDirector();
  const body = await parseJson(req, CreateBody);

  const { data: row, error } = await supabase
    .from('channels')
    .insert({
      name: body.name,
      youtube_channel_id: body.youtube_channel_id,
      credential_key: body.credential_key,
      ntfy_topic: body.ntfy_topic ?? null,
    } as never)
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      throw new ConflictError(
        `A channel with this YouTube id or credential key already exists`,
      );
    }
    throw new Error(`channel insert failed: ${error.message}`);
  }

  return apiCreated({
    ...(row as Record<string, unknown>),
    // Next-step hint surfaced in the UI: the passport is useless until the
    // named env token exists (resolveChannelRefreshToken HALTs otherwise).
    env_var: `YOUTUBE_REFRESH_TOKEN_${body.credential_key}`,
    consent_command: `npx tsx scripts/youtube-consent.ts --key ${body.credential_key}`,
  });
});
