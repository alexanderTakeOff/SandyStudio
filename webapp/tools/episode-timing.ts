// ──────────────────────────────────────────────────────────────────────────────
// tools/episode-timing.ts
//
// Per-episode time accounting — answers "how many episodes can we make per
// working day?" by separating the three kinds of time an episode consumes:
//
//   1. Compute (machine)   — Σ over jobs of (completed_at − started_at).
//                            How long the computer actually worked. Parallelises
//                            across episodes, so rarely the throughput limiter.
//   2. Hands-on (Director)  — Σ of "asset ready (REVIEW) → approved" gaps, with
//                            long idle/overnight gaps clipped out. ROUGH proxy:
//                            timestamps can't tell thinking from coffee. This is
//                            the real throughput limiter (one human, many gates).
//   3. Wall-clock          — first job start → cut point, on the calendar.
//                            Includes nights + away time; NOT a work measure.
//
// Lives under tools/ (not scripts/) so the SS-naming governance hook leaves it
// alone — it is code, not a studio content asset.
//
// Usage (npm needs `--` before flags so it forwards them to the script):
//   npm run episode-timing SS-S15-E02
//   npm run episode-timing SS-S15-E01 -- --to-shot 5   # stop at the 5th shot
//   npm run episode-timing SS-S15-E02 -- --gap 30      # active-gap threshold = 30 min
//
// Read-only: a service-role SELECT analytic, no writes.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const DEFAULT_ACTIVE_GAP_MIN = 20; // gaps longer than this = away/overnight, not active work
const SHOT_REF_PREFIXES = ['IMG-episode_ref', 'IMG-anchor'];
const WORKING_DAY_SECONDS = 10 * 3600;

interface Args {
  episodeCode: string;
  toShot: number | null;
  activeGapMin: number;
}

function parseArgs(argv: string[]): Args {
  const rest = argv.slice(2);
  let episodeCode = '';
  let toShot: number | null = null;
  let activeGapMin = DEFAULT_ACTIVE_GAP_MIN;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === '--to-shot') {
      toShot = Number(rest[++i]);
    } else if (a === '--gap') {
      activeGapMin = Number(rest[++i]);
    } else if (!a.startsWith('--')) {
      episodeCode = a.toUpperCase();
    }
  }
  if (!episodeCode) {
    throw new Error('Usage: npm run episode-timing <EPISODE_CODE> [--to-shot N] [--gap MINUTES]');
  }
  return { episodeCode, toShot, activeGapMin };
}

function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function shotTokenOf(fileType: string): string | null {
  return fileType.match(/sh\d+/i)?.[0]?.toUpperCase() ?? null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: epRows, error: epErr } = await sb
    .from('episodes')
    .select('id,episode_code,title_working')
    .eq('episode_code', args.episodeCode)
    .limit(1);
  if (epErr) {
    throw new Error(`episodes lookup failed: ${epErr.message}`);
  }
  const episode = epRows?.[0];
  if (!episode) {
    throw new Error(`Episode ${args.episodeCode} not found`);
  }
  const epId = episode.id as string;

  // ── jobs (machine compute) ───────────────────────────────────────────────
  const { data: jobsRaw } = await sb
    .from('jobs')
    .select('agent_id,started_at,completed_at,status')
    .eq('episode_id', epId)
    .not('started_at', 'is', null)
    .not('completed_at', 'is', null);
  const jobs = (jobsRaw ?? []) as Array<{
    agent_id: string | null;
    started_at: string;
    completed_at: string;
  }>;
  if (jobs.length === 0) {
    console.log(`\n${args.episodeCode}: no completed jobs yet — nothing to measure.\n`);
    return;
  }

  // ── cut point: full episode, or the moment the Nth shot first had a ref ────
  let cut: Date;
  let cutLabel: string;
  if (args.toShot && args.toShot > 0) {
    const { data: refRows } = await sb
      .from('assets')
      .select('file_type,created_at')
      .eq('episode_id', epId)
      .or(SHOT_REF_PREFIXES.map((p) => `file_type.ilike.${p}%`).join(','))
      .order('created_at', { ascending: true });
    const firstByShot = new Map<string, string>();
    for (const r of (refRows ?? []) as Array<{ file_type: string; created_at: string }>) {
      const tok = shotTokenOf(r.file_type);
      if (tok && !firstByShot.has(tok)) firstByShot.set(tok, r.created_at);
    }
    const ordered = [...firstByShot.entries()].sort(
      (a, b) => new Date(a[1]).getTime() - new Date(b[1]).getTime(),
    );
    if (ordered.length === 0) {
      throw new Error('No per-shot reference/anchor assets found — cannot resolve --to-shot.');
    }
    const idx = Math.min(args.toShot, ordered.length) - 1;
    const picked = ordered[idx]!;
    cut = new Date(picked[1]);
    cutLabel =
      ordered.length >= args.toShot
        ? `shot #${args.toShot} (${picked[0]}) first reference`
        : `shot #${ordered.length} (${picked[0]}) — only ${ordered.length} shots exist, capped`;
  } else {
    cut = new Date(Math.max(...jobs.map((j) => new Date(j.completed_at).getTime())));
    cutLabel = 'last completed job (full episode)';
  }
  const cutMs = cut.getTime();

  // ── compute (machine) + per-stage breakdown ───────────────────────────────
  const inWindow = jobs.filter((j) => new Date(j.completed_at).getTime() <= cutMs);
  let computeSec = 0;
  const byStage = new Map<string, { sec: number; n: number }>();
  for (const j of inWindow) {
    const dur = (new Date(j.completed_at).getTime() - new Date(j.started_at).getTime()) / 1000;
    computeSec += dur;
    const key = j.agent_id ?? 'unknown';
    const s = byStage.get(key) ?? { sec: 0, n: 0 };
    s.sec += dur;
    s.n += 1;
    byStage.set(key, s);
  }
  const epStartMs = Math.min(...inWindow.map((j) => new Date(j.started_at).getTime()));
  const wallSec = (cutMs - epStartMs) / 1000;

  // ── hands-on (Director) — clipped approval-gap sum ─────────────────────────
  const { data: apprRaw } = await sb
    .from('activity_events')
    .select('event_type,created_at')
    .eq('episode_id', epId)
    .in('event_type', ['approval_granted', 'approval_revision', 'approval_rejected']);
  const apprTimes = ((apprRaw ?? []) as Array<{ created_at: string }>)
    .map((e) => new Date(e.created_at).getTime())
    .filter((t) => t <= cutMs)
    .sort((a, b) => a - b);
  const gapCapMs = args.activeGapMin * 60_000;
  let handsOnSec = 0;
  for (let i = 1; i < apprTimes.length; i++) {
    const gap = apprTimes[i]! - apprTimes[i - 1]!;
    if (gap <= gapCapMs) handsOnSec += gap / 1000;
  }

  // ── report ─────────────────────────────────────────────────────────────────
  console.log(`\n  EPISODE TIMING — ${episode.episode_code}  «${episode.title_working ?? ''}»`);
  console.log(`  cut: ${cutLabel}`);
  console.log(`  ${'─'.repeat(58)}`);
  console.log(`  Compute (machine, parallelisable)   ${fmtDuration(computeSec).padStart(10)}   ${inWindow.length} jobs`);
  console.log(`  Hands-on (Director, the limiter)    ${fmtDuration(handsOnSec).padStart(10)}   ${apprTimes.length} gates, gaps ≤${args.activeGapMin}m`);
  console.log(`  Wall-clock (calendar)               ${fmtDuration(wallSec).padStart(10)}   incl. nights + away`);
  console.log(`  ${'─'.repeat(58)}`);

  console.log(`\n  Compute by stage (top):`);
  const stages = [...byStage.entries()].sort((a, b) => b[1].sec - a[1].sec).slice(0, 10);
  for (const [agent, s] of stages) {
    const pct = computeSec > 0 ? Math.round((s.sec / computeSec) * 100) : 0;
    console.log(`    ${agent.padEnd(22)} ${fmtDuration(s.sec).padStart(9)}  ${String(pct).padStart(3)}%  (${s.n})`);
  }

  const epPerDay = handsOnSec > 0 ? (WORKING_DAY_SECONDS / handsOnSec).toFixed(1) : '∞';
  console.log(
    `\n  → Throughput (10h day ÷ hands-on): ~${epPerDay} episodes/day at this gate load.`,
  );
  console.log(
    `  NOTE: Hands-on is a proxy (clipped gaps); Compute & Wall-clock are exact.\n`,
  );
}

main().catch((err: unknown) => {
  console.error(`episode-timing failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
