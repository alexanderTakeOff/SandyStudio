// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/skip-music/route.ts
//
// Phase A.2 PR γ (LT-04, 2026-05-08) — Director's "skip music" escape hatch.
// In the new pipeline order (MGEN before Animatic), the EXEC-EDIT trigger gates
// on APPROVED AUD-music. For episodes where Director doesn't want music
// (silent comedy short, voice-only, etc.), this route writes a synthetic
// APPROVED AUD-music row with `metadata.skipped: true` and an empty URL —
// flowing through the same downstream chain so EDIT fires immediately.
//
// The Animatic Editor sees `skipped: true` on the upstream AUD-music row and
// renders a silent animatic. No new event types, no enum migrations — the
// asset-driven gating from approve/route.ts does the work.
//
// Body: { directorConfirm: true }
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import {
  GovernanceBlockError,
  NotFoundError,
} from '@/lib/api/errors';
import { enforceMode, type GovernanceEpisode } from '@/lib/governance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  directorConfirm: z.boolean().optional(),
});

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, Body);

  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('id,governance_mode,episode_code')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch: ${epErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${episodeId}`);

  const decision = enforceMode('AGENT_RUN', ep as GovernanceEpisode, {
    directorConfirm: body.directorConfirm ?? true,
    confirmedBy: user.id,
  });
  if (!decision.passed) {
    throw new GovernanceBlockError(decision.reason ?? 'Governance gate refused');
  }

  // Idempotency: if any AUD-music row already exists (REVIEW / APPROVED /
  // skipped), do nothing. Director can revoke the skip by deleting the row
  // manually OR by running EXEC-MGEN explicitly via /trigger.
  const { data: existing } = await supabase
    .from('assets')
    .select('id,status,metadata')
    .eq('episode_id', episodeId)
    .eq('file_type', 'AUD-music')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    return apiOk({
      already_exists: true,
      asset_id: (existing as { id?: string }).id ?? null,
      message: 'AUD-music row already exists; not overwriting.',
    });
  }

  const episodeCode = (ep as { episode_code?: string }).episode_code ?? 'SS-unknown';
  const filename = `${episodeCode}-AUD-music_skipped-v01-APPROVED.mp3`;

  const { data: insertedAsset, error: insErr } = await supabase
    .from('assets')
    .insert({
      episode_id: episodeId,
      agent_id: 'EXEC-MGEN',
      file_type: 'AUD-music',
      filename,
      status: 'APPROVED',
      version: 1,
      description: 'Director skipped music — silent animatic.',
      drive_path: null,
      staging_path: null,
      metadata: {
        agent_id: 'EXEC-MGEN',
        skipped: true,
        skipped_by: user.id,
        skipped_at: new Date().toISOString(),
        section: 'main',
      } as never,
    } as never)
    .select('id')
    .single();
  if (insErr) throw new Error(`asset insert failed: ${insErr.message}`);

  await supabase
    .from('activity_events')
    .insert({
      event_type: 'approval_granted',
      severity: 'info',
      title: `Music skipped for ${episodeCode}`,
      description: `Director ${user.email ?? user.id} skipped music — animatic will render silent.`,
      actor: user.id,
      episode_id: episodeId,
      asset_id: (insertedAsset as { id?: string } | null)?.id ?? null,
      metadata: { kind: 'music_skipped' },
    } as never)
    .then(
      () => undefined,
      () => undefined,
    );

  return apiOk({
    accepted: true,
    asset_id: (insertedAsset as { id?: string } | null)?.id ?? null,
    message: 'AUD-music skipped — downstream chain (EXEC-EDIT) will fire.',
  });
});
