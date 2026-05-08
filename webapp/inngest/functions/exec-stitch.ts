// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-stitch.ts
// EXEC-STITCH Episode Stitcher (Phase A.2 PR β, 2026-05-08).
//
// Assembles the per-shot mp4s + music track for an episode into one final-cut
// mp4 via local ffmpeg. Triggered after the last VID-shot APPROVED + the
// VGEN auto-COMPLETE branch in approve/route.ts flips the episode status to
// `GENERATION_APPROVED` and emits this event.
//
// Concurrency: 1 per episode key (system ffmpeg + Drive I/O serialized).
// Per `specs/system/assembly_tool.md` §D-002 (APPROVED) ffmpeg is the chosen
// assembly tool. The runner shells out to system `ffmpeg` (no npm dep).
// Director must have `ffmpeg` on PATH; if missing, runner returns a clear
// "install ffmpeg" error.
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';

export const execStitchAssembleEpisode = createAgentInngestFunction({
  id: 'exec-stitch-assemble-episode',
  name: 'EXEC-STITCH: Assemble Episode',
  agentId: 'EXEC-STITCH',
  concurrencyId: 'exec-stitch',
  eventName: 'sandystudio/exec-stitch/assemble-episode',
  operation: 'episode_assembly',
  resolveRunArgs: () => ({
    section: 'final_cut',
  }),
});
