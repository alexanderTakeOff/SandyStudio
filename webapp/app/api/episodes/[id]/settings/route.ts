// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/settings/route.ts
// TD-49 Phase 2 P2.3 (2026-05-25) — Director-only PATCH endpoint for
// per-episode toggles that live in `episodes.metadata`. Whitelist-only:
// unknown keys are rejected with 400 to avoid metadata pollution.
//
// v1 surface (Director directive 2026-05-25 q5): `anchor_chain_enabled` —
// opt episode into TD-49 anchor pair pipeline. When `true`, the EREF Designer
// authors anchor_pair blocks, the EREF Artist generates IMG-anchor_<shot>_*
// assets, and the approve-route batch flow (P2.6) fans out VANIM after
// 2 × shotCount Director approvals.
//
// Pattern mirrors app/api/episodes/[id]/archive/route.ts: requireDirector,
// Zod-validated body, idempotent merge into existing metadata, audit event.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { logEvent } from '@/lib/api/events';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z
  .object({
    anchor_chain_enabled: z.boolean().optional(),
    // Per-episode hard budget cap in USD (lives in the budget_ceiling COLUMN,
    // not metadata). recordCost throws BudgetExceededError once spend would
    // cross it. `null` clears the cap (no limit). Omit = no change.
    budget_ceiling: z.number().positive().max(10000).nullable().optional(),
  })
  .strict();

export const PATCH = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, Body);

  // 1. Load current episode + metadata + budget cap.
  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('id,episode_code,metadata,budget_ceiling')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch: ${epErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${episodeId}`);

  const currentMeta = (ep.metadata ?? {}) as Record<string, unknown>;
  const currentCeiling = (ep as { budget_ceiling?: number | null }).budget_ceiling ?? null;

  // 2. Compute patch — only fields explicitly present in the body, so a
  //    caller sending `{}` is a no-op (returns current state unchanged).
  //    Metadata toggles merge into the JSON column; budget_ceiling is its
  //    own top-level column.
  const patch: Record<string, unknown> = {};
  if (body.anchor_chain_enabled !== undefined) {
    patch.anchor_chain_enabled = body.anchor_chain_enabled;
  }
  const newMeta = { ...currentMeta, ...patch };
  const nextCeiling = body.budget_ceiling !== undefined ? body.budget_ceiling : currentCeiling;

  // 3. Write back only on real change. Idempotent — skip no-op UPDATEs.
  let updated = false;
  const metaChanged = Object.entries(patch).some(([k, v]) => currentMeta[k] !== v);
  const ceilingChanged = body.budget_ceiling !== undefined && body.budget_ceiling !== currentCeiling;
  if (metaChanged || ceilingChanged) {
    const updateObj: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (metaChanged) updateObj.metadata = newMeta;
    if (ceilingChanged) updateObj.budget_ceiling = body.budget_ceiling;
    const { error: upErr } = await supabase
      .from('episodes')
      .update(updateObj as never)
      .eq('id', episodeId);
    if (upErr) throw new Error(`episode update: ${upErr.message}`);
    updated = true;

    // 4. Audit event — only when something actually changed.
    const auditPatch: Record<string, unknown> = { ...patch };
    if (ceilingChanged) auditPatch.budget_ceiling = body.budget_ceiling;
    await logEvent(supabase, {
      event_type: 'episode_settings_changed',
      severity: 'info',
      title: `Episode ${ep.episode_code} settings updated`,
      description: `Director set: ${Object.entries(auditPatch)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(', ')}`,
      actor: user.email ?? user.id,
      episode_id: episodeId,
      metadata: { kind: 'episode_settings_changed', patch: auditPatch },
    });
  }

  return apiOk({
    episode_id: episodeId,
    metadata: newMeta,
    budget_ceiling: nextCeiling,
    updated,
  });
});

// GET — convenience read so the UI can hydrate the toggle without joining
// the full episode payload. Same auth requirement (Director-only) to keep
// the access surface consistent with PATCH.
export const GET = withApiHandler(async (_req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { supabase } = await requireDirector();
  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('id,episode_code,metadata,budget_ceiling')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch: ${epErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${episodeId}`);

  return apiOk({
    episode_id: episodeId,
    metadata: (ep.metadata ?? {}) as Record<string, unknown>,
    budget_ceiling: (ep as { budget_ceiling?: number | null }).budget_ceiling ?? null,
  });
});
