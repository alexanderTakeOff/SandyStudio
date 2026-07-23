// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/analytics-advisor.ts
// The factory's QUALITY sensor, scout mode. Pure engine (no I/O) that turns
// audience metrics into ranked hypothesis-cards — deliberately EXPLORE-first, not
// EXPLOIT. Doctrine: .claude/skills/audience-quality-sensor/SKILL.md.
//
// Invariants encoded here:
//  - Silence threshold: below N* samples (or an empty exposure gate) → FLAGS, never
//    mandates. A fluke is never presented as an instruction.
//  - Metric roles (never averaged): completion (% viewed, length-normalized) = the
//    QUALITY signal; views = the EXPOSURE GATE (below X → confidence null); loops +
//    shares = virality (NOT likes).
//  - Holes axis: the untested space (taxonomy ⊖ shipped) matters more than ranking
//    the shipped. Cards carry a hypothesis to test, not a conclusion.
//  - Advice is a ranked PATTERN hypothesis, never a literal repeat, never a mandate.
//
// Thresholds (N*, X) are injected via config, never hardcoded — directional seeds
// tuned elsewhere, not on thin data.
// ──────────────────────────────────────────────────────────────────────────────

export type AdviceAxis = 'amplify_gag' | 'fix_longform' | 'cadence' | 'holes';

/** Confidence is tied to N. `none` = below the exposure gate (nobody saw it);
 *  `flag` = signal exists but below the mandate threshold → observe, don't act. */
export type Confidence = 'none' | 'flag' | 'low' | 'medium' | 'high';

export interface VideoMetric {
  videoId: string;
  kind: 'short' | 'longform';
  title: string;
  episodeCode?: string | null;
  durationSeconds?: number | null;
  /** YouTube-side state. Only `public` videos have an audience — the rest must never
   *  enter the advisor sample or a ranking. Derived in youtube-stats.ts, never read raw. */
  publicationState?: 'public' | 'unlisted' | 'scheduled' | 'private-draft';
  /** When the audience sees/saw it (`publishAt` for scheduled). Null for a draft. */
  liveAt?: string | null;
  /** LIVE public counter (`statistics.viewCount`) — never the lagging Analytics `views`. */
  views: number;
  /** % of the video watched (0..100). Already length-normalized → the quality signal.
   *  0 means "unreadable / not measured", never "watched nothing" — values >100 are
   *  zeroed upstream because they measure a tab left running, not an audience. */
  avgViewPercentage: number;
  avgViewDurationSeconds: number;
  /** Rewatch signal — the strongest virality driver. Null when the API can't supply it. */
  loops?: number | null;
  shares?: number | null;
  likes: number;
  comments: number;
  /** audienceWatchRatio samples across the video (long-form retention curve). */
  retentionCurve?: number[] | null;
  /** Reach metrics from the archived Reporting CSVs (the only source — Analytics
   *  API has no impression metric). Null = archive has no rows for this video yet;
   *  never coerce that to 0, it means "unmeasured", not "nobody saw it". */
  impressions?: number | null;
  impressionCtr?: number | null;
  subscribersGained?: number | null;
  trafficSources?: Record<string, number> | null;
}

export interface AdvisorConfig {
  /** X — exposure gate. Below this view count, confidence = none regardless of completion. */
  exposureGateViews: number;
  /** N* — minimum sample size (videos past the gate) before the advisor issues mandates. */
  mandateSampleFloor: number;
}

/** Directional seeds — NOT tuned on thin data; the doctrine owns the roles, config owns the numbers. */
export const DEFAULT_ADVISOR_CONFIG: AdvisorConfig = {
  exposureGateViews: 100,
  mandateSampleFloor: 20,
};

export interface AdviceCard {
  axis: AdviceAxis;
  headline: string;
  evidence: string;
  confidence: Confidence;
  /** Next Brief / episode / gag-category the hypothesis targets. */
  target: string;
  /** The experiment this card opens — the scout's forward question. */
  testNext: string;
  rank: number;
}

export interface AdvisorInput {
  metrics: VideoMetric[];
  /** The series' full category space (gag / antagonist / situation), by role — supplied by caller. */
  taxonomy: string[];
  /** Categories already shipped/tracked (empty until per-gag tagging exists → whole space is a hole). */
  shippedCategories: string[];
  config?: AdvisorConfig;
}

export interface AdvisorReport {
  /** Whether the advisor is allowed to issue mandates yet, or is still in scout/silence mode. */
  mode: 'scout' | 'optimize';
  sampleSize: number;       // videos past the exposure gate
  cards: AdviceCard[];
  /** Human-readable one-liner on why the advisor is (or isn't) confident. */
  confidenceNote: string;
}

/** The quality signal: % viewed is already length-normalized, so short clips can't game it. */
export function qualitySignal(m: VideoMetric): number {
  return clamp(m.avgViewPercentage, 0, 100);
}

/** Virality = rewatches + shares (the algorithm amplifies these most). Likes are excluded. */
export function viralitySignal(m: VideoMetric): number {
  return (m.loops ?? 0) + (m.shares ?? 0);
}

/** Confidence from the exposure gate + sample size. Below the gate → `none` (nobody saw it). */
export function confidenceFor(m: VideoMetric, config: AdvisorConfig): Confidence {
  if (m.views < config.exposureGateViews) return 'none';
  if (m.views < config.exposureGateViews * 5) return 'flag';
  if (m.views < config.exposureGateViews * 25) return 'low';
  if (m.views < config.exposureGateViews * 100) return 'medium';
  return 'high';
}

/** Videos that cleared the exposure gate — the only ones whose quality is readable. */
export function pastGate(metrics: VideoMetric[], config: AdvisorConfig): VideoMetric[] {
  return metrics.filter((m) => m.views >= config.exposureGateViews);
}

/**
 * The holes axis: the untested space = taxonomy minus what's shipped. On a young
 * channel this is the scout's most valuable output. Each hole becomes a hypothesis
 * card, ranked ahead of thin leaderboard signal.
 */
export function holeCards(taxonomy: string[], shipped: string[]): AdviceCard[] {
  const shippedSet = new Set(shipped.map((s) => s.toLowerCase().trim()));
  const holes = taxonomy.filter((t) => !shippedSet.has(t.toLowerCase().trim()));
  return holes.map((cat, i) => ({
    axis: 'holes' as const,
    headline: `Untested territory: “${cat}”`,
    evidence: 'Not present in shipped/tracked episodes — no signal either way yet.',
    confidence: 'flag' as const,
    target: `Next Brief — pilot a “${cat}” gag/antagonist`,
    testNext: `Ship one “${cat}” episode; compare its short's completion against the current set.`,
    rank: i,
  }));
}

/**
 * Build the scout report. EXPLORE-first: when sample size is below the mandate
 * floor, the advisor emits the holes map + observation flags ONLY — it will not
 * tell you to "make more of X" on noise.
 */
export function buildAdvice(input: AdvisorInput): AdvisorReport {
  const config = input.config ?? DEFAULT_ADVISOR_CONFIG;
  const readable = pastGate(input.metrics, config);
  const sampleSize = readable.length;
  const canMandate = sampleSize >= config.mandateSampleFloor;

  const cards: AdviceCard[] = [];

  // 1. Holes first — the scout's core output, valuable even at N=0.
  cards.push(...holeCards(input.taxonomy, input.shippedCategories));

  // 2. Long-form retention → shot: a production-level flag whenever a curve exists.
  for (const m of input.metrics.filter((x) => x.kind === 'longform' && x.retentionCurve?.length)) {
    const drop = biggestDrop(m.retentionCurve!);
    if (drop) {
      cards.push({
        axis: 'fix_longform',
        headline: `Retention drop in ${m.episodeCode ?? m.title}`,
        evidence: `Largest viewer loss around ${(drop.atRatio * 100).toFixed(0)}% of the video.`,
        confidence: confidenceFor(m, config),
        target: `${m.episodeCode ?? m.title} — inspect the shot at ~${(drop.atRatio * 100).toFixed(0)}%`,
        testNext: 'Map this % onto the shot timeline (cumulative playback) and tighten that production decision.',
        rank: 100 + drop.magnitude,
      });
    }
  }

  // 3. Leaderboard signal — ONLY as flags until the sample clears the floor. Ranked
  //    by the quality signal, gated by exposure; never a "make more of this" mandate here.
  if (readable.length > 0) {
    const shorts = readable
      .filter((m) => m.kind === 'short')
      .sort((a, b) => qualitySignal(b) - qualitySignal(a));
    const top = shorts[0];
    if (top) {
      cards.push({
        axis: 'amplify_gag',
        headline: canMandate
          ? `Over-indexing pattern: ${top.episodeCode ?? top.title}`
          : `Early signal (observe): ${top.episodeCode ?? top.title}`,
        evidence: `${qualitySignal(top).toFixed(0)}% completion on ${top.views} views` +
          (viralitySignal(top) ? `, ${viralitySignal(top)} loops+shares.` : '.'),
        confidence: canMandate ? confidenceFor(top, config) : 'flag',
        target: canMandate
          ? 'Next Brief — amplify the underlying PATTERN (not a literal repeat)'
          : 'Watch only — sample too small to steer the series',
        testNext: 'Once N clears the floor, compare this pattern head-to-head against an untested hole.',
        rank: 50,
      });
    }
  }

  cards.sort((a, b) => a.rank - b.rank);

  const confidenceNote = canMandate
    ? `Sample of ${sampleSize} videos past the exposure gate — mandates allowed.`
    : `Only ${sampleSize} video(s) past the exposure gate (need ${config.mandateSampleFloor}). ` +
      `Scout mode: holes map + observation flags, no "make more of X" yet.`;

  return { mode: canMandate ? 'optimize' : 'scout', sampleSize, cards, confidenceNote };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

interface Drop {
  atRatio: number; // 0..1 position of the drop in the video
  magnitude: number; // size of the retention fall
}

export interface DropOptions {
  /** Ignore falls positioned before this ratio — every YouTube curve opens with a
   *  universal sampling bounce that is NOT a per-episode production defect. */
  openingSkipRatio: number;
  /** Falls smaller than this (after smoothing) are noise, not a story problem. */
  minMagnitude: number;
  /** Centered moving-average window. Applied only to curves long enough to
   *  survive it (>= 3× the window) — short/test curves stay raw. */
  smoothWindow: number;
}

/** Directional seeds, injectable like AdvisorConfig — not tuned on thin data. */
export const DEFAULT_DROP_OPTIONS: DropOptions = {
  openingSkipRatio: 0.05,
  minMagnitude: 0.05,
  smoothWindow: 3,
};

function smooth(curve: number[], window: number): number[] {
  if (window <= 1 || curve.length < window * 3) return curve;
  const half = Math.floor(window / 2);
  return curve.map((_, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(curve.length - 1, i + half);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += curve[j];
    return sum / (hi - lo + 1);
  });
}

/**
 * Biggest MEANINGFUL fall in the retention curve → where viewers bail.
 *
 * The naive max-single-fall version false-flagged every video: unsmoothed, it
 * always picked the universal opening-seconds bounce and sent the Storyboarder
 * to "fix" a shot at ~3% that isn't the problem. Now: smooth (long curves only),
 * skip the opening window, and require a minimum effect size — no drop clearing
 * all three gates → null (an honest "no localized story problem detected").
 */
export function biggestDrop(curve: number[], opts: DropOptions = DEFAULT_DROP_OPTIONS): Drop | null {
  if (curve.length < 2) return null;
  const smoothed = smooth(curve, opts.smoothWindow);
  let worst: Drop | null = null;
  for (let i = 1; i < smoothed.length; i++) {
    const atRatio = i / (smoothed.length - 1);
    if (atRatio < opts.openingSkipRatio) continue;
    const fall = smoothed[i - 1] - smoothed[i];
    if (fall >= opts.minMagnitude && (!worst || fall > worst.magnitude)) {
      worst = { atRatio, magnitude: fall };
    }
  }
  return worst;
}
