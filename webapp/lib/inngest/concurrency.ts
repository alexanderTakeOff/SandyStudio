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
  'exec-edit':  5,
  'exec-copy':  5,
  // Visual generation — strictest. Highest cost, lowest provider tolerance.
  // Legacy single-event path kept for backward-compat (old replay-pilot tests
  // and any in-flight `/generate-shot` events).
  'exec-vgen':  3,
  // Pilot Pass: walk through 1-2 shots sequentially so cost is deterministic.
  'exec-vgen-pilot':   1,
  // Fan-out trigger: one runner per episode, then it fans out via /single-shot.
  'exec-vgen-fanout':  1,
  // Per-shot single-shot generation; this is where Veo 3's per-episode
  // parallelism actually lives. Bump if Vertex AI quota allows.
  'exec-vgen-shot':    3,
  // Music — Suno/Udio rate limits tighter than image/video.
  'exec-mgen':  2,
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
