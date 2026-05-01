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
  // Episode reference generator (backbone v2). Per-episode limit will be
  // higher once Step 5 fans out N images per storyboard shot — for now mock
  // produces one ref so 5 is plenty.
  'exec-eref':  3,
  'exec-edit':  5,
  'exec-copy':  5,
  // Visual generation — strictest. Highest cost, lowest provider tolerance.
  'exec-vgen':  3,
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
