// ──────────────────────────────────────────────────────────────────────────────
// lib/inngest/concurrency.ts
// Per-agent concurrency caps per specs/system/webapp.md §4.2.1 (MANDATORY).
// Without these, fan-out (e.g. all shots after animatic approval) triggers
// HTTP 429 from upstream providers.
//
// All limits are episode-keyed via `event.data.episodeId` so multiple episodes
// don't starve each other.
// ──────────────────────────────────────────────────────────────────────────────

export const CONCURRENCY_LIMITS = {
  // Anthropic API — moderate parallelism.
  'exec-sw':    5,
  'exec-srev':  5,
  'exec-sb':    5,
  'exec-wchk':  5,
  // Episode reference generator. EREF v2 runner is a single long-running
  // function that walks all 13 shots internally with its own per-shot loop
  // (generate → review → regen ≤2 → upscale). Two parallel runs would race
  // on filename uniqueness AND duplicate every shot's spend. Hard-capped at
  // 1 per episode. Future hybrid-parallelism (Pilot+Fan-out, technology.md §4)
  // will fan out per-shot events and bump this limit per shot, not per run.
  'exec-eref':  1,
  // Sprint «Дизайнер и Аниматор» 2026-05-18 — Designer is a pure-cost Sonnet
  // LLM call per shot. Multiple shots can fan out in parallel since each Plan
  // is independent. 3 is a moderate cap — Anthropic side is fine, but going
  // higher won't help wall-clock much (Sonnet ~6-12s per Plan) and could
  // surface rate-limit edge cases for very large episodes.
  'exec-eref-designer': 3,
  // Designer's Critic (Day 4 2026-05-19) — Sonnet 4.6 validator, very cheap.
  // Higher cap than Designer because Critic runs in parallel per Plan when
  // multiple Plans land at once (e.g. fanned out from a single REV-world_check
  // approval).
  'exec-eprev': 5,
  // Animator (Day 6-7 2026-05-19) — Sonnet 4.6 video Plan author per shot.
  // Same cap as Designer (parallel-friendly LLM call).
  'exec-vanim': 3,
  // Animator's Critic (Day 8 2026-05-19) — same shape as Designer's Critic.
  'exec-vprev': 5,
  // Gag Assistant Director (Day 11+ 2026-05-19) — all 3 phases share this
  // per-episode cap. Phase=plan runs once per episode. Phase=eref_review +
  // vanim_review can run multiple times in parallel (per-shot). 3 is a
  // moderate cap that lets a 22-shot episode chew through reviews in 7-8
  // batches.
  'exec-gagad': 3,
  // Plan-driven executor (Day 3.2 2026-05-18) — single-shot image generation
  // from an APPROVED SPC-ref_plan. Same rate-limit logic as legacy exec-eref
  // (gpt-image-2 fan-out, expensive), but here parallelism is one shot per
  // event so multiple shots can be in flight without colliding on the long
  // internal per-shot loop.
  //
  // 2026-06-03 (Director q20): bumped 2 → 4 to roughly halve wall-time on
  // multi-shot episodes. Safe because the factory runs these with retries:2 +
  // Inngest exponential backoff + per-Plan idempotency, so a transient gpt-image
  // 429 retries rather than dropping the shot. If SUSTAINED 429s appear (OpenAI
  // tier images-per-minute ceiling), roll back to 3 — the previously-tested-safe
  // cap. No single-call batch API exists for gpt-image-2; this fan-out cap is
  // the throughput lever.
  'exec-eref-execute': 4,
  'exec-edit':  5,
  'exec-copy':  5,
  // Visual generation — strictest. Highest cost, lowest provider tolerance.
  // Legacy single-event path kept for backward-compat (old replay-pilot tests
  // and any in-flight `/generate-shot` events).
  'exec-vgen':  3,
  // Fan-out trigger: one runner per episode, then it fans out via /single-shot.
  'exec-vgen-fanout':  1,
  // Per-shot single-shot generation; this is where Veo's per-episode
  // parallelism actually lives.
  //
  // Quota history:
  //   2026-05-06 Veo 3.0 fast: 10 RPM hard cap — concurrency 2-3 tripped 429s.
  //                            Hard-capped to 1, ~20min wall for 13 shots.
  //   2026-05-06 Veo 3.1 preview (Phase 1.5 upgrade): per Director's quota
  //                            investigation, 3.1 ceiling is ~5× higher.
  //                            Bumped to 2 (conservative — q2b decision); a
  //                            future bump to 3 once we observe stable runs
  //                            without 429s.
  //
  // Episode-keyed so multiple episodes don't starve each other.
  'exec-vgen-shot':    2,
  // Music — Suno/Udio rate limits tighter than image/video.
  'exec-mgen':  2,
  // Episode Stitcher (Phase A.2 PR β) — local ffmpeg + Drive I/O serialized
  // per episode. One stitch at a time keeps the staging dir tidy and avoids
  // ffmpeg fighting itself for CPU when multiple episodes are in flight.
  'exec-stitch': 1,
  // LLM thumbnail Plan author — pure Anthropic cost, low fan-out.
  'exec-thumb-designer': 3,
  // Image — Midjourney/fal.ai.
  'exec-thumb': 4,
  // YouTube Data API — sequential to avoid quota burn.
  'exec-pub':   1,
  // YouTube Data API — read-only, slight parallelism.
  'exec-anal':  2,
  // Concierge chat is not an Inngest job (sync route), but keep symmetry.
  'exec-conc':  10,
} as const;

export type AgentConcurrencyId = keyof typeof CONCURRENCY_LIMITS;

/** Helper: return the standard `concurrency` block for an agent's createFunction. */
export function concurrencyFor(agentId: AgentConcurrencyId) {
  return {
    limit: CONCURRENCY_LIMITS[agentId],
    key: 'event.data.episodeId',
  } as const;
}
