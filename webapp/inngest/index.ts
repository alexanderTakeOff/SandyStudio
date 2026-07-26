// ──────────────────────────────────────────────────────────────────────────────
// inngest/index.ts
// Function registry. Phase 4 adds 11 production agents + 1 cron fan-out.
// Order is presentational only — Inngest dispatches by event name.
// ──────────────────────────────────────────────────────────────────────────────

import { ping } from './functions/ping';
import { execSwWriteScript } from './functions/exec-sw';
import { execSrevReviewScript } from './functions/exec-srev';
import { execSbCreateStoryboard } from './functions/exec-sb';
import {
  execCreadReviewStoryboard,
  execCreadReviewRefPlan,
  execCreadReviewShotPlan,
} from './functions/exec-cread';
import { execWchkCheckWorld } from './functions/exec-wchk';
import { execErefStart } from './functions/exec-eref';
import { execErefDesignerPlan } from './functions/exec-eref-designer';
import { execEprevReviewPlan } from './functions/exec-eprev';
import { execErefExecuteFromPlan } from './functions/exec-eref-execute-from-plan';
import { execVanimPlan } from './functions/exec-vanim';
import { execVprevReviewPlan } from './functions/exec-vprev';
import { execEditCreateAnimatic } from './functions/exec-edit';
import {
  execVgenLegacyGenerateShot,
  execVgenRun,
  execVgenFanoutTrigger,
} from './functions/exec-vgen';
import { execMgenGenerateMusic } from './functions/exec-mgen';
import { execStitchAssembleEpisode } from './functions/exec-stitch';
import { execCopyWriteMetadata } from './functions/exec-copy';
import { execThumbDesignerPlan } from './functions/exec-thumb-designer';
import { execThumbGenerateThumbnail } from './functions/exec-thumb';
import { execPubPublish } from './functions/exec-pub';
import { execAnalCollect } from './functions/exec-anal';
import { scheduleAnalytics } from './functions/schedule-analytics';
import { execPaReact } from './functions/exec-pa-react';
import { paEscalationTimer } from './functions/pa-escalation-timer';
import { paOrphanedAwaitingSweep } from './functions/pa-orphaned-awaiting-sweep';
import { paBatchStallWatchdog } from './functions/pa-batch-stall-watchdog';
import { jobsStaleReaper } from './functions/jobs-stale-reaper';
import { reconcileEpisodeFn } from './functions/reconcile-episode';
import { reconcileCron } from './functions/reconcile-cron';
import { episodeScorecard } from './functions/episode-scorecard';
import { hogChannelSnapshot } from './functions/hog-channel-snapshot';
import { hogReportPoll } from './functions/hog-report-poll';
import { hogWeeklyRollup } from './functions/hog-weekly-rollup';
import { hogMonthlyRollup } from './functions/hog-monthly-rollup';

export const functions = [
  // Phase 3 smoke
  ping,
  // Phase 4 production agents (11)
  execSwWriteScript,
  execSrevReviewScript,
  execSbCreateStoryboard,
  execCreadReviewStoryboard,
  execCreadReviewRefPlan,
  execCreadReviewShotPlan,
  execWchkCheckWorld,
  execErefStart,
  execErefDesignerPlan,
  execEprevReviewPlan,
  execErefExecuteFromPlan,
  execVanimPlan,
  execVprevReviewPlan,
  execEditCreateAnimatic,
  execVgenLegacyGenerateShot,
  execVgenRun,
  execVgenFanoutTrigger,
  execMgenGenerateMusic,
  execStitchAssembleEpisode,
  execCopyWriteMetadata,
  execThumbDesignerPlan,
  execThumbGenerateThumbnail,
  execPubPublish,
  execAnalCollect,
  // Phase 4 cron fan-out
  scheduleAnalytics,
  // TD-20.B autonomy 2026-05-20
  execPaReact,
  // Step 2 of Supabase recovery sprint (2026-05-22) — replaces the old
  // every-minute exec-pa-watchdog cron with event-driven escalation + a
  // bounded-cost hourly orphan sweep. See ~/.claude/plans/
  // synchronous-petting-waffle.md for the full rationale.
  paEscalationTimer,
  paOrphanedAwaitingSweep,
  // 2026-06-03 — fast scope-aware watchdog for silent mid-batch stalls
  // (FANOUT_RUNNING + idle → nudge Polina to continue). Complements the
  // awaiting-only safety nets above.
  paBatchStallWatchdog,
  // 2026-07-21 — closes job rows whose execution died with an Inngest queue
  // reset. They used to sit RUNNING forever holding the atomic dispatch claim,
  // and only a hand-run script freed them (E30: 57 ghosts, swept by the Director).
  jobsStaleReaper,
  // Фаза 2b — reconciler self-advance (inert unless the episode is armed).
  reconcileEpisodeFn,
  // Failure-spine Slice 4b — 5-min reconciler heartbeat over armed episodes
  // (catches a silently dropped event: a stall has no event of its own).
  reconcileCron,
  // Episode Autonomy Scorecard — snapshot (EXEC-STITCH done) + published.
  episodeScorecard,
  // 2026-07-22 — Head-of-Growth channel observers. The MEASUREMENT layer:
  // #1 a 15-min channel-wide Data-API time series (velocity / plateaus / wave
  // shape); #2 a daily poll of the Reporting API bulk CSVs (the only automated
  // route to impressions/CTR). Both persist to 0045 tables; a failed poll leaves
  // a gap, never a fake zero.
  hogChannelSnapshot,
  hogReportPoll,
  // 2026-07-26 — Phase 4b HoG analytical memory: weekly/monthly rollups over
  // hog_memory (each period reads ONLY the previous rollup + rows since it);
  // confirmed lessons surface as rule_proposal in the Director Inbox.
  hogWeeklyRollup,
  hogMonthlyRollup,
];
