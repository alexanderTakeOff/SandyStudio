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
import { requireDirector, assertHumanDirector } from '@/lib/api/auth';
import { logEvent } from '@/lib/api/events';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { VIDEO_PROVIDER_CAPS } from '@/lib/api/provider-capabilities';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Episode-authoritative generation config (2026-06-09). Stored at
// `episodes.metadata.generation_config`. FORMAT only — duration + creative stay
// per-shot (q27). Whitelist-strict; the resolver (resolve-generation-params.ts)
// reads it as the precedence authority for every video-gen consumer.
const VideoGenConfig = z
  .object({
    provider_id: z.enum(['seedance-fal-img2vid', 'veo-3-img2vid']).optional(),
    aspect_ratio: z.enum(['16:9', '9:16', '1:1', '21:9', '4:3', '3:4', 'auto']).optional(),
    quality_tier: z.enum(['fast', 'standard']).optional(),
    resolution: z.enum(['480p', '720p', '1080p']).optional(),
    allow_shot_overrides: z.boolean().optional(),
  })
  .strict();
const ImageGenConfig = z
  .object({
    provider_id: z.enum(['openai-edits-multi', 'flux-pro-1.1-ultra']).optional(),
    quality: z.enum(['low', 'medium', 'high', 'auto']).optional(),
  })
  .strict();
const GenerationConfig = z
  .object({
    video: VideoGenConfig.optional(),
    image: ImageGenConfig.optional(),
  })
  .strict();

const Body = z
  .object({
    anchor_chain_enabled: z.boolean().optional(),
    // S-reorder (2026-07-01): per-episode pipeline mode. 'sequential' = today's
    // refs→animatic→video flow (default); 'parallel' = 2 refs→2 video pilots→
    // fanout, per-ref canon-gate, video not gated on an animatic. Metadata (no
    // migration). Not a hard limit → any Director may set it.
    pipeline_mode: z.enum(['sequential', 'parallel']).optional(),
    // F13 (2026-07-01): Director's approval of the episode budget. Lives in
    // metadata (no migration). Category-A hard limit → HUMAN Director only
    // (guarded below). Gate.ts blocks all AGENT_RUN work until this is true.
    budget_approved: z.boolean().optional(),
    // Per-episode hard budget cap in USD (lives in the budget_ceiling COLUMN,
    // not metadata). recordCost throws BudgetExceededError once spend would
    // cross it. `null` clears the cap (no limit). Omit = no change.
    budget_ceiling: z.number().finite().positive().max(10000).nullable().optional(),
    // Per-episode Polina (concierge) cost slice in USD — Director 2026-07-05.
    // Lives in metadata (no migration). A carve-out WITHIN budget_ceiling ("of
    // which Polina"), not additive. `null` clears it (→ falls back to the global
    // env default). Validated ≤ the effective budget_ceiling below.
    concierge_cap_usd: z.number().finite().positive().max(10000).nullable().optional(),
    // Per-episode retry caps (Director 2026-07-06) — attempts before HALT.
    // Metadata (no migration). `null` clears → falls back to env/hard default.
    // prompt-writing default 2, reference-gen default 2, video-gen default 1.
    prompt_revision_cap: z.number().int().positive().max(20).nullable().optional(),
    reference_regen_cap: z.number().int().positive().max(20).nullable().optional(),
    video_regen_cap: z.number().int().positive().max(20).nullable().optional(),
    generation_config: GenerationConfig.optional(),
  })
  .strict();

/**
 * Reject a video config whose format values the chosen provider cannot render
 * (CLAUDE plan §pitfall #7 — server-side caps validation, not just UI gating).
 * Throws ValidationError → 400. Only fields actually present are checked; the
 * resolver applies the same caps at read time, so this is defence-in-depth that
 * keeps the stored config honest.
 */
function assertVideoConfigValid(
  video: z.infer<typeof VideoGenConfig> | undefined,
): void {
  if (!video) return;
  const providerId = video.provider_id ?? 'seedance-fal-img2vid';
  const caps = VIDEO_PROVIDER_CAPS[providerId];
  if (video.aspect_ratio && !caps.supports_aspects.includes(video.aspect_ratio)) {
    throw new ValidationError(
      `aspect_ratio="${video.aspect_ratio}" not supported by provider "${providerId}" (supported: ${caps.supports_aspects.join(', ')})`,
    );
  }
  if (video.quality_tier && !caps.supports_qualities.includes(video.quality_tier)) {
    throw new ValidationError(
      `quality_tier="${video.quality_tier}" not supported by provider "${providerId}"`,
    );
  }
  if (video.resolution && !caps.supports_resolutions.includes(video.resolution)) {
    throw new ValidationError(
      `resolution="${video.resolution}" not supported by provider "${providerId}" (supported: ${caps.supports_resolutions.join(', ') || 'fixed/none'})`,
    );
  }
}

export const PATCH = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const dirCtx = await requireDirector();
  const { user, supabase } = dirCtx;
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
  if (body.pipeline_mode !== undefined) {
    patch.pipeline_mode = body.pipeline_mode;
  }
  // Per-episode retry caps (metadata; no cross-field validation needed).
  if (body.prompt_revision_cap !== undefined) patch.prompt_revision_cap = body.prompt_revision_cap;
  if (body.reference_regen_cap !== undefined) patch.reference_regen_cap = body.reference_regen_cap;
  if (body.video_regen_cap !== undefined) patch.video_regen_cap = body.video_regen_cap;
  // Per-episode Polina cap (metadata). Must not exceed the effective total ceiling
  // — it is a slice of the budget, not an addition on top of it.
  if (body.concierge_cap_usd !== undefined) {
    const effectiveCeiling =
      body.budget_ceiling !== undefined ? body.budget_ceiling : currentCeiling;
    if (
      body.concierge_cap_usd !== null &&
      effectiveCeiling != null &&
      body.concierge_cap_usd > effectiveCeiling
    ) {
      throw new ValidationError(
        `concierge_cap_usd (${body.concierge_cap_usd}) cannot exceed the episode budget ceiling (${effectiveCeiling})`,
      );
    }
    patch.concierge_cap_usd = body.concierge_cap_usd;
  }
  // F13: budget approval is a Category-A hard limit — HUMAN Director only
  // (the EXEC-DIR-AI service token is rejected by assertHumanDirector).
  if (body.budget_approved !== undefined) {
    assertHumanDirector(dirCtx);
    patch.budget_approved = body.budget_approved;
  }
  // generation_config — deep-merge video/image sub-objects so a PATCH touching
  // only the video block preserves a previously-saved image block (and vice
  // versa). Validate the video block against provider caps before persisting.
  if (body.generation_config !== undefined) {
    assertVideoConfigValid(body.generation_config.video);
    const curGen = (currentMeta.generation_config ?? {}) as {
      video?: Record<string, unknown>;
      image?: Record<string, unknown>;
    };
    const mergedGen: Record<string, unknown> = { ...curGen };
    if (body.generation_config.video) {
      mergedGen.video = { ...(curGen.video ?? {}), ...body.generation_config.video };
    }
    if (body.generation_config.image) {
      mergedGen.image = { ...(curGen.image ?? {}), ...body.generation_config.image };
    }
    patch.generation_config = mergedGen;
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
        .map(([k, v]) => `${k}=${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
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
