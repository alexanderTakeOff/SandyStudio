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
      /**
       * TD-74 (2026-05-27) — Director-authorized check waivers. Animator
       * propagates these to its auto-chain to VPREV; Critic treats matching
       * checks as PASS_WITH_UNCERTAINTY instead of REVISE, with the original
       * diagnosis preserved in `warnings[]`. Only mutable by PA tools or
       * Director-trigger routes; Animator's policy_notes self-assertion is
       * NOT authoritative. Empty/absent → no overrides applied.
       */
      directorOverrides?: ReadonlyArray<{ check: string; rationale: string }>;
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
      /**
       * TD-74 (2026-05-27) — same shape as on /exec-vanim/plan, propagated
       * by Animator's nextEvent. Critic uses this to demote matching-check
       * REVISE verdicts to PASS_WITH_UNCERTAINTY.
       */
      directorOverrides?: ReadonlyArray<{ check: string; rationale: string }>;
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
   * EXEC-GAGAD — Gag Assistant Director, Phase «plan» (Sprint «Дизайнер и
   * Аниматор» Day 11+ 2026-05-19). Per-episode Sonnet 4.6 LLM call after
   * REV-script_qa.APPROVED (parallel with EXEC-SB) when isComedyLikeGenre.
   * Reads APPROVED script + skill sandy-gag-library + Bible canon. Outputs
   * `SPC-gag_plan-<episode>` asset (theme + antagonist + per-shot gag intent).
   */
  'sandystudio/exec-gagad/plan': {
    data: BaseEpisodeEvent & {
      scriptAssetId?: string;
      revisionNote?: string;
    };
  };

  /**
   * EXEC-GAGAD Phase «eref_review». Fired by EPREV nextEvent on PASS verdict
   * (when comedy + APPROVED SPC-gag_plan exists). Cross-layer check: does
   * this SPC-ref_plan deliver the gag intent declared for its shot in the
   * gag_plan? Verdict PASS → noop. REVISE → flip SPC-ref_plan to REVISION +
   * re-fire EXEC-EREF-DESIGNER. After 2nd REVISE → HALT + director-attention
   * activity event.
   */
  'sandystudio/exec-gagad/review-ref-plan': {
    data: BaseEpisodeEvent & {
      planAssetId: string;
      shotId: string;
    };
  };

  /**
   * EXEC-GAGAD Phase «vanim_review». Same shape as eref_review but for
   * SPC-shot_plan (Animator output). Fired by VPREV nextEvent on PASS.
   * REVISE chains back to EXEC-VANIM.
   */
  'sandystudio/exec-gagad/review-shot-plan': {
    data: BaseEpisodeEvent & {
      planAssetId: string;
      shotId: string;
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
      /**
       * TD-49 Phase 2 (anchor_chain_enabled): when true, EXEC-EDIT sources
       * the animatic shot_list from APPROVED IMG-anchor_* START frames via
       * `runAnchorAnimaticSlideshow` instead of the EREF builder. Absent /
       * false → legacy EREF animatic path.
       */
      anchor_mode?: boolean;
    };
  };

  /**
   * Legacy per-shot fan-out trigger (pre-Pilot Pass). Kept registered so
   * historical Inngest log entries continue to type-check. New flows fire
   * `sandystudio/exec-vgen/start` (pilot) → `/fanout-trigger` → `/single-shot`.
   *
   * TD-61 (2026-05-27): `planAssetId` added so approve-route auto-chain
   * from SPC-shot_plan APPROVED can carry the Plan id all the way to the
   * runner's plan-driven branch (runner.ts:1807-1906). Without it, Inngest
   * EventSchemas strip the field and the runner's `if (planAssetId)` guard
   * never fires — silently falling back to the legacy `buildShotPromptV2`
   * template path (the «2D animated comedy short...» fallback prompt).
   *
   * @deprecated Remove after one release once no in-flight events remain.
   */
  'sandystudio/exec-vgen/generate-shot': {
    data: AssetTrigger & {
      shotId: string;
      animaticAssetId: string;
      /**
       * TD-61: APPROVED SPC-shot_plan asset id. When present, runner
       * loads the Plan body and uses provider.id / quality_tier /
       * start_anchor / end_image / prompt body as the single source of
       * truth. Absent → legacy template path (replay-pilot, pre-Plan
       * shots).
       */
      planAssetId?: string;
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
   *
   * TD-61 (2026-05-27): `planAssetId` added — Inngest EventSchemas were
   * silently stripping the field from `triggerAgent({agentCode:'EXEC-VGEN',
   * payload:{shotId, planAssetId}})` and `regenerateVideoFromPlan` PA tool
   * payloads. Schema now declares it explicitly so the runner's plan-driven
   * branch (runner.ts:1807-1906) actually engages.
   */
  'sandystudio/exec-vgen/single-shot': {
    data: BaseEpisodeEvent & {
      shotId: string;
      aspect_ratio?: '16:9' | '9:16' | '1:1';
      quality_tier?: 'fast' | 'standard';
      duration_seconds?: number;
      /** TD-61: APPROVED SPC-shot_plan asset id. See generate-shot above. */
      planAssetId?: string;
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

  /**
   * EXEC-THUMB-DESIGNER — Distribution-tail viral thumbnail Plan author
   * (2026-06-01). Fired when SPC-metadata is APPROVED. Reads the script +
   * Bible canon + `viral-thumbnail-design` skill and writes one
   * SPC-thumb_plan asset holding N distinct high-CTR concepts. Director
   * approves the Plan; APPROVED Plan fires `exec-thumb/generate-thumbnail`
   * with the planAssetId so the executor renders the variants.
   */
  'sandystudio/exec-thumb-designer/plan': {
    data: AssetTrigger & {
      /** Optional revision note on a re-fire after REQUEST_REVISION. */
      revisionNote?: string;
    };
  };

  'sandystudio/exec-thumb/generate-thumbnail': {
    data: AssetTrigger & {
      scriptAssetId?: string;
      metadataAssetId?: string;
      /**
       * APPROVED SPC-thumb_plan asset id. When present the executor renders
       * the plan's N variants (1280×720 + overlay). Absent → mock placeholder
       * (replay-pilot / no key).
       */
      planAssetId?: string;
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

  /**
   * TD-20.B autonomy 2026-05-20 — Polina auto-reaction signal. Fired
   * fire-and-forget by `logEvent` (after an actionable `activity_events`
   * row) and by `/api/team-chat/post` (after a claude_message turn). The
   * single consumer `exec-pa-react` throttles 5s per thread, dispatches an
   * internal chat invocation so PA can acknowledge the non-Director event
   * without waiting for the Director to type. Source labels the trigger
   * for telemetry / debugging only.
   */
  'sandystudio/pa/notify-needed': {
    data: {
      /**
       * Concierge thread to react in. Optional — when fired from logEvent
       * we may only know the episode; the consumer resolves the latest
       * open thread the same way migration 0030's Postgres trigger does.
       */
      threadId?: string | null;
      episodeId?: string | null;
      // TD-25 P2 (2026-05-21): `watchdog` source added so exec-pa-react /
      // chat-internal can distinguish a real new event from a watchdog
      // re-ping after open-loop stall. `timer` (2026-05-22) is the
      // replacement for `watchdog` — fired by the event-driven
      // pa-escalation-timer after a deadline expires.
      source: 'ambient' | 'claude_message' | 'watchdog' | 'timer';
      /** Either an activity_events.id or a concierge_turns.id for traceability. */
      triggerId: string;
      /** Echo of the upstream event_type ('agent_completed' etc) when ambient. */
      eventType?: string;
    };
  };

  /**
   * Step 2 of Supabase recovery sprint (2026-05-22). Fired by
   * `persistTurn()` whenever it writes an assistant turn whose metadata
   * contains `awaiting_director_input`. The consumer `pa-escalation-timer`
   * arms a `step.sleep(deadline)` then re-checks state and (optionally)
   * fires `pa/notify-needed` ONCE. Replaces the every-minute
   * `exec-pa-watchdog` cron.
   */
  'sandystudio/pa/awaiting-set': {
    data: {
      threadId: string;
      turnId: string;
      episodeId?: string | null;
      /** Verbatim question — surfaced if the timer escalates. */
      question: string;
      /**
       * Deadline in seconds — if Director doesn't reply within this window,
       * timer escalates ONCE. Clamped to [30, 3600] by markAwaitingDirector
       * already, but defenders re-clamp here too.
       */
      deadlineSec: number;
      /** Provenance: 'tool' (markAwaitingDirector) | 'regex' (deprecated detector). */
      source: 'tool' | 'regex';
    };
  };

  /**
   * Step 2 of Supabase recovery sprint (2026-05-22). Fired by
   * `persistTurn()` on EVERY turn insert. The `pa-escalation-timer`
   * subscribes via `cancelOn`: when a turn with role='director' lands in
   * the same thread, the timer's sleep is cancelled — no Supabase reads
   * triggered, no escalation fires. This is the event-driven replacement
   * for the watchdog's per-minute polling cycle.
   */
  'sandystudio/concierge/turn-inserted': {
    data: {
      threadId: string;
      turnId: string;
      role: 'director' | 'assistant' | 'tool' | 'system';
      /**
       * Mirrors `ConciergeEventType` from `lib/concierge/types.ts`. Kept
       * as a plain string here to avoid a circular import between the
       * inngest client and the concierge types module — consumers should
       * narrow at use-site if they care about specific event_type values.
       */
      eventType: string;
    };
  };
};

export type StudioEventName = keyof Events;

export const inngest = new Inngest({
  id: 'sandystudio',
  schemas: new EventSchemas().fromRecord<Events>(),
});
