// ──────────────────────────────────────────────────────────────────────────────
// lib/inngest/client.ts
// Inngest client singleton — server-side only.
// Local-first per webapp.md §2: in dev, the Inngest dev server (npx inngest-cli
// dev) runs on http://localhost:8288 and signs requests itself; INNGEST_*
// keys are only required for production cloud Inngest.
//
// Event names follow webapp.md §4.1: `sandystudio/<agent-code>/<action>`.
// Once an event is in flight, its name is recorded in the Inngest log
// permanently — renames are destructive, so add new events instead of
// changing existing ones.
// ──────────────────────────────────────────────────────────────────────────────

import { Inngest, EventSchemas } from 'inngest';

// ── Common payload fragments ─────────────────────────────────────────────────

interface BaseEpisodeEvent {
  episodeId: string;
}

interface AssetTrigger {
  episodeId: string;
  /** Upstream asset id that produced this event. Optional for cron triggers. */
  assetId?: string;
}

// ── Studio events ────────────────────────────────────────────────────────────

type Events = {
  // ── Phase 3 smoke test ────────────────────────────────────────────────────
  'sandystudio/ping': {
    data: {
      note?: string;
      episodeId?: string | null;
    };
  };

  // ── Phase 4: 11 production agents ─────────────────────────────────────────
  'sandystudio/exec-sw/write-script': {
    data: AssetTrigger & {
      /** Brief asset that triggered the script. */
      briefAssetId: string;
    };
  };

  'sandystudio/exec-srev/review-script': {
    data: AssetTrigger & {
      scriptAssetId: string;
    };
  };

  'sandystudio/exec-sb/create-storyboard': {
    data: AssetTrigger & {
      scriptAssetId: string;
    };
  };

  'sandystudio/exec-wchk/check-world': {
    data: AssetTrigger & {
      storyboardAssetIds: string[]; // 3 acts
    };
  };

  /**
   * Legacy (pre-v2 Pilot Pass) entry point. Kept registered so historical
   * Inngest log entries continue to type-check. Replaced by
   * `sandystudio/exec-eref/start` (full episode, default pilot_count) and
   * `sandystudio/exec-eref/fanout-trigger` (resume after pilots approved).
   * @deprecated Remove after one release once no in-flight events remain.
   */
  'sandystudio/exec-eref/generate-references': {
    data: AssetTrigger & {
      storyboardAssetId: string;
    };
  };

  /**
   * EREF v2 Pilot Pass entry point. Generates `pilot_count` (default 2)
   * representative shots and stops. Sets `eref_pilot_state=PENDING_REVIEW`.
   */
  'sandystudio/exec-eref/start': {
    data: BaseEpisodeEvent & {
      pilot_count?: number;
    };
  };

  /**
   * EREF v2 Fan-out trigger. Director approved both pilot shots and clicked
   * "Approve Direction & Fan Out" — runner re-enters at start_index and
   * finishes the remaining shots.
   */
  'sandystudio/exec-eref/fanout-trigger': {
    data: BaseEpisodeEvent & {
      start_index: number;
    };
  };

  /**
   * EREF v2 Final upscale. Fired by /api/assets/[id]/approve when Director
   * APPROVES a v2 EREF asset (technology.md §3 — upscale only on Director
   * approve, not AI approve).
   */
  'sandystudio/exec-eref/upscale-final': {
    data: BaseEpisodeEvent & {
      assetId: string;
    };
  };

  /**
   * EXEC-EREF-DESIGNER — Sprint «Дизайнер и Аниматор» 2026-05-18.
   * Per-shot LLM Plan author. Fired N times per episode after REV-world_check
   * approval (gated by DESIGNER_CHAIN_ENABLED flag); each invocation writes
   * one SPC-ref_plan-<shot_id> asset. Plan asset goes through Director (and
   * Day 4 Critic) approval; APPROVED Plan fires `exec-eref/execute-from-plan`.
   */
  'sandystudio/exec-eref-designer/plan': {
    data: BaseEpisodeEvent & {
      shotId: string;
      /** Optional revision note when this is a re-fire after REQUEST_REVISION. */
      revisionNote?: string;
    };
  };

  /**
   * EXEC-EPREV — Designer's Critic. Sprint «Дизайнер и Аниматор» Day 4
   * 2026-05-19. Fired by EXEC-EREF-DESIGNER's nextEvent callback right after
   * a fresh SPC-ref_plan is saved. Critic runs V01-V09 hard checks against
   * the Plan JSON body. PASS → Plan flips REVIEW (Director sees it); REVISE
   * → Plan flips REVISION + Critic emits revisionNote which auto-fires the
   * Designer with hard-contract criteria.
   */
  'sandystudio/exec-eprev/review-plan': {
    data: BaseEpisodeEvent & {
      planAssetId: string;
      shotId: string;
    };
  };

  /**
   * EXEC-VANIM — Animator (Sprint «Дизайнер и Аниматор» Day 6-7 2026-05-19).
   * Per-shot Sonnet 4.6 Plan author for video generation. Fired per shot
   * after VID-animatic.APPROVED (when ANIMATOR_CHAIN_ENABLED is on) or
   * manually via PA. Output: one SPC-shot_plan-<shot_id> asset per shot.
   */
  'sandystudio/exec-vanim/plan': {
    data: BaseEpisodeEvent & {
      shotId: string;
      revisionNote?: string;
    };
  };

  /**
   * EXEC-VPREV — Animator's Critic (Sprint «Дизайнер и Аниматор» Day 8
   * 2026-05-19). Fired by Animator's nextEvent on freshly-saved SPC-shot_plan.
   * Validates V01-V09 hard checks. Same chain shape as EXEC-EPREV.
   */
  'sandystudio/exec-vprev/review-plan': {
    data: BaseEpisodeEvent & {
      planAssetId: string;
      shotId: string;
    };
  };

  /**
   * VGEN Plan-driven executor (Day 6-7 2026-05-19). Fired when Director
   * approves an SPC-shot_plan asset. Executor reads Plan body (provider,
   * aspect, duration, prompt, etc) and dispatches the actual provider call
   * for ONE shot. Coexists with /start /single-shot /generate-shot.
   */
  'sandystudio/exec-vgen/execute-from-plan': {
    data: BaseEpisodeEvent & {
      shotId: string;
      planAssetId: string;
    };
  };

  /**
   * EREF v3 Plan-driven executor — Sprint «Дизайнер и Аниматор» Day 3.2
   * 2026-05-18. Fired when Director approves an SPC-ref_plan asset. The
   * executor reads the Plan's JSON body (provider, size, variants, prompt,
   * negative, continuity_strategy) and generates exactly one IMG-episode_ref
   * for the planned shot. Coexists with legacy `generate-references` and
   * Pilot/fanout entries (q2c soft switch behind DESIGNER_CHAIN_ENABLED).
   */
  'sandystudio/exec-eref/execute-from-plan': {
    data: BaseEpisodeEvent & {
      shotId: string;
      planAssetId: string;
    };
  };

  'sandystudio/exec-edit/create-animatic': {
    data: AssetTrigger & {
      storyboardAssetIds: string[];
      /**
       * Optional: APPROVED AUD-music asset id to bake into the animatic.
       * Phase A.2 PR γ (LT-04, 2026-05-08) — music now generates BEFORE
       * animatic so pacing review hears the real track. Absent → animatic
       * runs silent (legacy fallback for episodes without music yet).
       */
      musicAssetId?: string;
    };
  };

  /**
   * Legacy per-shot fan-out trigger (pre-Pilot Pass). Kept registered so
   * historical Inngest log entries continue to type-check. New flows fire
   * `sandystudio/exec-vgen/start` (pilot) → `/fanout-trigger` → `/single-shot`.
   * @deprecated Remove after one release once no in-flight events remain.
   */
  'sandystudio/exec-vgen/generate-shot': {
    data: AssetTrigger & {
      shotId: string;
      animaticAssetId: string;
    };
  };

  /**
   * VGEN v2 Pilot Pass entry point. Generates 1-2 representative shots and
   * stops. Each shot fires its own `/start` event so the existing concurrency
   * key + Universal Core overrides work uniformly across pilot and fan-out.
   */
  'sandystudio/exec-vgen/start': {
    data: BaseEpisodeEvent & {
      shotId: string;
      /** Universal Core overrides — fall back to series defaults. */
      aspect_ratio?: '16:9' | '9:16' | '1:1';
      quality_tier?: 'fast' | 'standard';
      duration_seconds?: number;
      /** Pilot pass marker for activity feed / runner branching. */
      pilot?: boolean;
    };
  };

  /**
   * VGEN v2 Fan-out trigger. Director approved both pilot shots and clicked
   * "Approve Direction & Fan Out" — runner fans the remaining shots out as
   * `/single-shot` events.
   */
  'sandystudio/exec-vgen/fanout-trigger': {
    data: BaseEpisodeEvent;
  };

  /**
   * VGEN v2 single-shot generation. Fired by the fan-out trigger (per shot)
   * and by the per-shot Re-generate UI button. Concurrency 3 per episode.
   */
  'sandystudio/exec-vgen/single-shot': {
    data: BaseEpisodeEvent & {
      shotId: string;
      aspect_ratio?: '16:9' | '9:16' | '1:1';
      quality_tier?: 'fast' | 'standard';
      duration_seconds?: number;
    };
  };

  'sandystudio/exec-mgen/generate-music': {
    data: AssetTrigger & {
      animaticAssetId: string;
      /** "intro" | "act1" | "act2" | "act3" | "outro" — section per music_brief. */
      section: string;
    };
  };

  /**
   * EXEC-STITCH (Phase A.2 PR β, 2026-05-08): assemble approved per-shot
   * mp4s + music into one final-cut mp4. Fired from approve/route.ts when
   * episode reaches GENERATION_APPROVED (last VID-shot just APPROVED + auto-
   * complete branch flipped the episode status).
   */
  'sandystudio/exec-stitch/assemble-episode': {
    data: BaseEpisodeEvent;
  };

  'sandystudio/exec-thumb/generate-thumbnail': {
    data: AssetTrigger & {
      scriptAssetId: string;
      metadataAssetId: string;
    };
  };

  'sandystudio/exec-copy/write-metadata': {
    data: AssetTrigger & {
      scriptAssetId: string;
    };
  };

  'sandystudio/exec-pub/publish': {
    data: BaseEpisodeEvent & {
      /** REQUIRED in Mode 1/2/3 to bypass governance hard-block. */
      directorConfirm: boolean;
      /** ID of the user/agent that confirmed. */
      confirmedBy?: string;
    };
  };

  /** Emitted by EXEC-PUB after successful publish — triggers analytics scheduling. */
  'sandystudio/exec-pub/published': {
    data: BaseEpisodeEvent & {
      youtubeVideoId: string;
      publishTimestamp: number; // ms epoch
    };
  };

  /** Cron fan-out: schedules 4 future analytics events. */
  'sandystudio/schedule-analytics': {
    data: BaseEpisodeEvent & {
      youtubeVideoId: string;
      publishTimestamp: number;
    };
  };

  'sandystudio/exec-anal/collect': {
    data: BaseEpisodeEvent & {
      youtubeVideoId: string;
      collectionPoint: 'T+1h' | 'T+24h' | 'T+7d' | 'T+30d';
    };
  };
};

export type StudioEventName = keyof Events;

export const inngest = new Inngest({
  id: 'sandystudio',
  schemas: new EventSchemas().fromRecord<Events>(),
});
