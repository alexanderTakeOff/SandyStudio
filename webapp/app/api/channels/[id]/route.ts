// ──────────────────────────────────────────────────────────────────────────────
// app/api/channels/[id]/route.ts
// PATCH the channel passport (multi-channel Phase 4c). Until now the passport
// was write-once at POST — branding had NO product writer (only migration
// seeds), and ntfy_topic/status could never be changed from the UI.
//
// Secrets are NOT touched here (consent flow owns them); youtube_channel_id and
// credential_key stay immutable — changing identity means a new passport.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError } from '@/lib/api/errors';
import { mergeBrandingPatch } from '@/lib/api/metadata-merge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Branding keys read by lib/agents/branding.ts (series → channel → neutral).
const BrandingPatch = z.object({
  short_overlay_text: z.string().min(1).max(80).nullable().optional(),
  short_description: z.string().min(1).max(5000).nullable().optional(),
  short_tags: z.array(z.string().min(1).max(30)).max(30).nullable().optional(),
  subscribe_cta: z.string().min(1).max(200).nullable().optional(),
  long_description_boilerplate: z.string().min(1).max(1000).nullable().optional(),
});

const PatchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  ntfy_topic: z.string().min(1).max(120).nullable().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  branding: BrandingPatch.optional(),
});

export const PATCH = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Channel');

  const { supabase } = await requireDirector();
  const body = await parseJson(req, PatchBody);

  const { data: current, error: readErr } = await supabase
    .from('channels')
    .select('id, metadata')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new Error(`channel read failed: ${readErr.message}`);
  if (!current) throw new NotFoundError(`Channel ${id}`);

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.ntfy_topic !== undefined) update.ntfy_topic = body.ntfy_topic;
  if (body.status !== undefined) update.status = body.status;
  if (body.branding !== undefined) {
    update.metadata = mergeBrandingPatch((current as { metadata: unknown }).metadata, body.branding);
  }

  const { data: updated, error } = await supabase
    .from('channels')
    .update(update as never)
    .eq('id', id)
    .select('id, name, youtube_channel_id, credential_key, ntfy_topic, status, metadata, created_at')
    .maybeSingle();
  if (error) throw new Error(`channel update failed: ${error.message}`);
  if (!updated) throw new NotFoundError(`Channel ${id}`);

  return apiOk(updated as Record<string, unknown>);
});
