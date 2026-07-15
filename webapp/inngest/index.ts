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
import { reconcileEpisodeFn } from './functions/reconcile-episode';
import { episodeScorecard } from './functions/episode-scorecard';

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
  // Фаза 2b — reconciler self-advance (inert unless the episode is armed).
  reconcileEpisodeFn,
  // Episode Autonomy Scorecard — snapshot (EXEC-STITCH done) + published.
  episodeScorecard,
];
