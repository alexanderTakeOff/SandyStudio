// ──────────────────────────────────────────────────────────────────────────────
// inngest/index.ts
// Function registry. Phase 4 adds 11 production agents + 1 cron fan-out.
// Order is presentational only — Inngest dispatches by event name.
// ──────────────────────────────────────────────────────────────────────────────

import { ping } from './functions/ping';
import { execSwWriteScript } from './functions/exec-sw';
import { execSrevReviewScript } from './functions/exec-srev';
import { execSbCreateStoryboard } from './functions/exec-sb';
import { execWchkCheckWorld } from './functions/exec-wchk';
import { execEditCreateAnimatic } from './functions/exec-edit';
import { execVgenGenerateShot } from './functions/exec-vgen';
import { execMgenGenerateMusic } from './functions/exec-mgen';
import { execCopyWriteMetadata } from './functions/exec-copy';
import { execThumbGenerateThumbnail } from './functions/exec-thumb';
import { execPubPublish } from './functions/exec-pub';
import { execAnalCollect } from './functions/exec-anal';
import { scheduleAnalytics } from './functions/schedule-analytics';

export const functions = [
  // Phase 3 smoke
  ping,
  // Phase 4 production agents (11)
  execSwWriteScript,
  execSrevReviewScript,
  execSbCreateStoryboard,
  execWchkCheckWorld,
  execEditCreateAnimatic,
  execVgenGenerateShot,
  execMgenGenerateMusic,
  execCopyWriteMetadata,
  execThumbGenerateThumbnail,
  execPubPublish,
  execAnalCollect,
  // Phase 4 cron fan-out
  scheduleAnalytics,
];
