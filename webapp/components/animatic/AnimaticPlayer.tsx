// ──────────────────────────────────────────────────────────────────────────────
// components/animatic/AnimaticPlayer.tsx
// Browser-native animatic preview — no mp4 render.
//
// Per Director (2026-05-05): рендерить mp4 для preview бессмысленно. Браузер
// сам умеет — <img> + <audio> + setTimeout, plus можно подвинуть per-shot
// timing live.
//
// What this component does:
//   - Plays the approved IMG-episode_ref shots in order, each held for its
//     `duration_seconds` (with optional Director override).
//   - Syncs to a single uploaded music track (audio element).
//   - Lets Director Play / Pause / Stop / Reset, click on timeline segments
//     to seek, and edit per-shot durations via −1s / +1s / numeric input.
//   - "Save timing" persists director_overrides via PATCH /animatic-timing.
//   - "Upload music track" posts a .mp3 / .wav to /upload-music.
//
// Playback engine:
//   - requestAnimationFrame loop with `Date.now()` baseline; each tick sets
//     the current shot index by walking the cumulative-start array.
//   - Audio is the source of truth for time when present (re-syncs to
//     audio.currentTime on Play). Without audio we use elapsed wall time.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Music2,
  Save,
  Loader2,
  Clapperboard,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  computeTotalDuration,
  computeEffectivePlayback,
  effectiveDurationSeconds,
  getAudioTracks,
  resolveMusicPreviewUrl,
  type AnimaticContract,
  type AnimaticDirectorOverride,
  type AnimaticShot,
  type AudioTrack,
} from '@/lib/api/animatic-shotlist';
import { compareAssetVersionsNewestFirst } from '@/lib/api/asset-ordering';
import {
  resolveTimelineCells,
  type TimelineCell,
  type VidShotAssetRow,
  type ImgRefAssetRow,
} from '@/lib/api/timeline-cell-resolver';
import { workRolePalette, type ShotWork, type WorkRole } from '@/lib/api/pipeline-stages';

const MIN_SHOT_S = 0.5;
const MAX_SHOT_S = 60;
/**
 * Idle time before per-shot timing edits are persisted (Director, 2026-07-18:
 * "3 сек"). Short on purpose — the save is metadata-only and takes ~200ms, so
 * a long window would only widen the loss gap without buying anything.
 * Playback is unaffected either way: it reads local state, not the DB.
 */
const TIMING_AUTOSAVE_MS = 3_000;
// Per Director (2026-06-08): tail trim steps ±0.5s, matching head trim — fine
// pacing control. Previously ±1s, which over-shot on short comedy beats.
const SHOT_STEP = 0.5;

export interface AnimaticPlayerProps {
  assetId: string;
  contract: AnimaticContract;
  /** Called after a successful save / upload — drawer should refetch. */
  onChanged: () => void;
  /**
   * EpisodeTimeline mode: when provided, the player upgrades from "animatic
   * frames only" to a hybrid surface that also plays approved/REVIEW VID-shot
   * mp4s for shot_ids that have them. Per Director's directives 2026-05-06:
   *   - REVIEW VID-shot plays for visual feedback (yellow border, not canonical)
   *   - APPROVED VID-shot replaces the animatic frame canonically (green pill)
   *   - Storyboard order is preserved; one cell per shot_id (directive #1)
   * Pass `[]` (empty) to keep behaviour pure-animatic.
   */
  vidShotAssets?: VidShotAssetRow[];
  /**
   * Called when Director clicks any timeline cell — caller (episode page)
   * opens the per-shot drawer for review. Optional; without it, cells just
   * seek the playhead.
   */
  onCellClick?: (cell: TimelineCell) => void;
  /**
   * Phase A polish: timeline filter chip selection. Cells outside the
   * filter are dimmed in the shot strip but still seek-able. Default 'all'.
   */
  filter?: 'all' | 'review' | 'approved' | 'missing';
  /**
   * TD-80 (2026-05-27): Shot Plan versions per shot_id, surfaced in the
   * hover-popover so Director can open a Plan in the existing PreviewDrawer
   * BEFORE the video burns. Pre-TD-80 the only way to read a Plan was the
   * approvals queue or PA chat — both required leaving the timeline. Pass
   * empty map / undefined to suppress the section (legacy mode).
   */
  shotPlansByShotId?: Map<string, Array<{ id: string; version: number | null; status: string }>>;
  /**
   * Ref Plan (SPC-ref_plan) versions per shot, keyed by the unique SHxx token.
   * The EREF Designer's plan that produced the reference — surfaced in the kebab
   * so the plan is reachable from EVERY shot (open via onOpenAsset). 2026-06-24.
   */
  refPlansByShotId?: Map<string, Array<{ id: string; version: number | null; status: string }>>;
  /**
   * TD-80 (2026-05-27): opens an arbitrary asset id in the parent's
   * PreviewDrawer without entering the «missing VGEN» branch that
   * `onCellClick` uses for image-fallback cells. Plan rows in the popover
   * call this with the Plan's asset_id — drawer reads the markdown body
   * + JSON and surfaces existing approve/reject controls.
   */
  onOpenAsset?: (assetId: string) => void;
  /**
   * Phase A.2 Bug C fix (Director report 2026-05-08): the asset status of
   * the animatic itself, used to hide the footer Approve/Reject row once
   * the animatic is past REVIEW. Without this prop, the footer shows on
   * every render and clicking Approve on an already-APPROVED asset throws
   * the scary "idempotent no-op" red banner; clicking Reject without a
   * note throws "REJECT requires a note". Both useless once VGEN started.
   *
   * When `'REVIEW'` (or undefined for back-compat) — show Approve/Reject.
   * When `'APPROVED'` / `'LOCKED'` / anything else — hide the footer row.
   *
   * UNUSED since 2026-07-09 (animatic-approval ceremony removed). Kept optional
   * so existing call-sites still type-check; safe to drop when they are cleaned.
   */
  animaticStatus?: string;
  /**
   * q4a (2026-06-22) → unified work language (2026-07-02): shot_id → live work
   * { object, roles } for shots whose designer / critic / artist job is RUNNING
   * right now. A matched cell recolours BY ROLE (designer=indigo / critic=amber /
   * both=teal / artist=violet) + pulses (live wins over asset status). Undefined /
   * empty = no live work; cells rest at their asset colour.
   */
  liveWorkByShot?: ReadonlyMap<string, ShotWork>;
  /**
   * D7 persistent trail (2026-07-09): shot_id → completed work { object, roles }
   * for shots whose designer / critic / artist job FINISHED and which have no
   * live job now. Renders a settled, muted, non-pulsing role glow so a finished
   * shot stays visibly marked instead of snapping to neutral. Live wins — a shot
   * in liveWorkByShot is excluded from this map upstream (completedWorkByShot).
   */
  completedWorkByShot?: ReadonlyMap<string, ShotWork>;
  /**
   * Image-version parity (2026-06-24) — live IMG-episode_ref rows for the
   * episode (all statuses). The cell kebab lists each shot's reference versions
   * with the on-screen marker + inline ✓ approve, mirroring the video list. The
   * approve route (/api/assets/[id]/approve) is generic, so this reuses the
   * exact video-version controls.
   */
  imgRefAssets?: ImgRefAssetRow[];
  /**
   * Timeline-as-home (2026-07-02): when true, the player is rendering a
   * SYNTHETIC contract derived live from the approved storyboard (no backing
   * VID-animatic asset exists yet). Ref/video review + variant kebab all work
   * off the live assets, but the timing editor + Save-timing + the animatic
   * Approve/Reject footer are hidden because there is no asset to PATCH or
   * approve. The pacing is read-only until the animatic is materialized on the
   * first real edit (Phase 3). Default false = today's real-asset behaviour.
   */
  synthetic?: boolean;
  /**
   * Timeline-as-home (2026-07-02): manual "generate video" for a shot that has
   * an approved reference but no VID-shot yet. Fires the flow (Video Designer →
   * critic → generator) via the parent (which owns episodeId + the trigger
   * fetch). Shown in the kebab's no-video row only when the shot is eligible
   * (has an APPROVED/LOCKED reference). Without this prop the row is read-only.
   */
  onGenerateVideo?: (shotId: string) => void;
  /** Shot currently kicking off a video flow (button spinner / disabled). */
  generatingVideoShotId?: string | null;
  /**
   * Explicit excluded ("button") shots — episodes.metadata.excluded_shot_ids.
   * Drives the cell strikethrough (alongside the legacy ≤0.5s rule) and the
   * kebab toggle's checked state.
   */
  excludedShotIds?: ReadonlySet<string>;
  /**
   * Toggle a shot's excluded flag (kebab checkbox). The parent owns the
   * episode-level write + refetch (works at any stage, no animatic asset
   * required). When absent the checkbox is hidden.
   */
  onToggleExclusion?: (shotId: string, excluded: boolean) => void;
  /**
   * Kebab repartition (2026-07-05, Director) — Critic lines per track. The
   * reference critic (REV-ref_plan) keyed by the SHxx token (aligned with
   * refPlansByShotId) and the video critic (REV-shot_plan) keyed by
   * metadata.shot_id (aligned with shotPlansByShotId). `verdict` is the
   * critic's PASS/REVISE/FAIL pulled from the REV asset metadata, rendered as
   * a compact chip. Undefined = no critic line (legacy).
   */
  refCriticsByShotId?: Map<string, Array<{ id: string; version: number | null; status: string; verdict?: string | null }>>;
  shotCriticsByShotId?: Map<string, Array<{ id: string; version: number | null; status: string; verdict?: string | null }>>;
  /**
   * Kebab repartition (2026-07-05) — manual "generate / regenerate reference"
   * for a shot, mirroring onGenerateVideo. Fires the reference flow (Designer →
   * critic → artist) via the parent (owns episodeId + trigger fetch). Shown in
   * the Image partition. Without this prop the reference generate button is
   * hidden (S1 layout renders without it).
   */
  onGenerateReference?: (shotId: string) => void;
  /** Shot currently kicking off a reference flow (button spinner / disabled). */
  generatingRefShotId?: string | null;
  /** 👁 Advisory Visual Critic on this shot's rendered ref or video (logs verdict, no gate). */
  onVisualCheck?: (shotId: string, kind: 'ref' | 'video') => void;
  /**
   * "Start Video" latch (2026-07-09, animatic-stage demotion). When provided,
   * the transport shows a ▶ Старт видео button next to Play/Stop/Reset that
   * opens the video stream for the whole episode (POST /start-video via the
   * parent, which owns episodeId). The parent passes this ONLY while the
   * episode is still waiting (pipeline_mode !== 'parallel'); once the stream is
   * open it stops passing it and the button disappears. Absent in drawer mode.
   */
  onStartVideo?: () => void;
  /** True while the Start-Video POST is in flight (button spinner / disabled). */
  startingVideo?: boolean;
  /**
   * Video Pilot Pass fan-out (2026-07-23, E31 storm fix). When provided, the
   * transport shows a "Fan Out (N)" button next to Старт видео that releases
   * the shots stashed in episodes.metadata.video_fanout_pending (POST
   * /video/fanout via the parent). Parent passes this ONLY while the stash is
   * non-empty; the button disappears once the fan-out clears it.
   */
  onVideoFanout?: () => void;
  /** Size of the pending stash (button label) — 0/undefined hides the button. */
  videoFanoutCount?: number;
  /** True while the fan-out POST is in flight. */
  fanningOutVideo?: boolean;
  /**
   * Materialize-on-first-edit (E25 2026-07-10): in synthetic mode there is no
   * backing VID-animatic asset to PATCH timing into. When the Director edits a
   * duration and saves, the parent creates the animatic vessel (POST
   * /animatic/materialize) and returns its id, which Save then PATCHes. Provided
   * only in synthetic mode; absent for a real animatic (assetId already set).
   * Removes the old "approve an empty animatic to unlock duration editing" step.
   */
  onMaterialize?: () => Promise<string | null>;
}

/**
 * Imperative API exposed via ref. Used by EpisodeTimelineSection so post-
 * regenerate the parent can move the playhead to the freshly-created shot
 * (Phase A.1 directive — "new candidate must appear and be focused").
 */
export interface AnimaticPlayerHandle {
  seekToShot: (shotId: string) => void;
}

interface ShotTime {
  shot: AnimaticShot;
  duration: number;       // effective (override applied, clamped to clip length)
  /** Cell position in the strip layout (visualSpan denominator). */
  cumStart: number;
  /** True when this shot is excluded from the final cut (effective <= 0.5s). */
  excluded: boolean;
  /**
   * 2026-06-06 — playback offset (excludes skipped shots). The master clock
   * advances through this coord-space, so an excluded cell is silently jumped
   * over in the preview the same way EXEC-STITCH skips it in the final cut.
   * For excluded cells this equals the NEXT non-excluded cell's playStart
   * (so seeking to an excluded cell just lands on the next playable one).
   */
  playStart: number;
}

/**
 * 2026-06-06 — accepts `clipLengths` (shot_id → real VID-shot duration). When
 * passed, each per-shot duration is clamped to `min(override, clipLength)` so
 * the timeline reports the HONEST final-cut layout instead of an unreachable
 * animatic-declared length (closes Director's "animatic 1:40 vs final cut
 * 1:12" confusion). Shots whose effective duration is ≤ 0.5s are still placed
 * in `times` (so the cell count stays stable in the UI) but flagged
 * `excluded` and contribute zero to the total — same threshold EXEC-STITCH
 * uses to skip from the final cut.
 */
function buildTimeline(
  shotList: AnimaticShot[],
  overrides: Record<string, AnimaticDirectorOverride> | undefined,
  clipLengths?: ReadonlyMap<string, number>,
  excludedShotIds?: ReadonlySet<string>,
): { times: ShotTime[]; total: number; visualSpan: number } {
  const times: ShotTime[] = [];
  // Visual cumulative — used to lay out cells in the strip. Includes a
  // minimum width for excluded cells so they remain clickable (the cell
  // count must stay stable in the UI even when shots are skipped from the
  // final cut). `total` (returned + used for progress) counts ONLY included
  // shots so the progress bar matches what EXEC-STITCH will actually emit.
  const EXCLUDED_VISUAL_SECONDS = 1.5; // ~enough to dim + click in the strip
  let visualCum = 0;
  let playCum = 0;
  for (const shot of shotList) {
    // 2026-06-06 — playable = effective duration after head trim and clip
    // length clamp. This is what ffmpeg actually emits for the shot, so the
    // preview timeline matches the final cut frame-for-frame.
    const clamped = computeEffectivePlayback(shot, overrides, clipLengths);
    // Excluded = the explicit "button" flag OR the legacy ≤0.5s duration gesture.
    const excluded = excludedShotIds?.has(shot.shot_id) === true || clamped <= 0.5;
    const visualDuration = excluded ? EXCLUDED_VISUAL_SECONDS : clamped;
    times.push({
      shot,
      duration: visualDuration,
      cumStart: visualCum,
      excluded,
      // Excluded cells share their playStart with the NEXT non-excluded shot,
      // so clicking an excluded cell or having the playhead reach one jumps
      // forward instead of stalling on a 0.5s frame.
      playStart: playCum,
    });
    visualCum += visualDuration;
    if (!excluded) playCum += clamped;
  }
  // total = honest playback / final-cut length (for progress display); visualSpan
  // = sum of strip cell widths (for per-cell left/width %). Most of the time
  // the two are identical — they diverge only when some shots are excluded.
  return {
    times,
    total: Math.round(playCum * 100) / 100,
    visualSpan: Math.round(visualCum * 100) / 100,
  };
}

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Cell colour palette (Phase A.1, "improve non-approved colorization") ────
// Each non-final status gets its own colour so Director can scan the strip and
// see the spread of states at a glance. `--accent-orange/--accent-purple/
// --accent-info` may not be defined in every theme — fall back to literal
// hex/oklch in the CSS var default.
function cellPalette(
  status: string | undefined,
  kind: string | undefined,
  liveWork?: ShotWork,
  completedWork?: ShotWork,
): { color: string; weight: number; glow?: string; pulse?: boolean } {
  // Unified work language (2026-07-02) — live work ALWAYS wins: a job RUNNING on
  // this shot recolours the cell (even an APPROVED/green one) BY ROLE and pulses
  // until the job finishes, then it settles back to the asset-derived colour
  // below. Colour = who is working (designer/critic/both/artist); node-safe
  // workRolePalette owns the token mapping (no inline hex).
  if (liveWork && liveWork.roles.length > 0) {
    const rp = workRolePalette(liveWork.roles);
    return { color: rp.color, weight: 700, glow: rp.glow, pulse: true };
  }
  // D7 persistent trail (2026-07-09) — no live job, but this shot's designer/
  // critic/artist work has finished: keep a SETTLED, muted, NON-pulsing role
  // glow so the completed shot stays visibly marked instead of snapping back to
  // neutral the instant its job leaves RUNNING. Reuses workRolePalette's colour
  // at a dimmer mix (35% vs live 60%); sits above asset-status, below live.
  if (completedWork && completedWork.roles.length > 0) {
    const rp = workRolePalette(completedWork.roles);
    return {
      color: rp.color,
      weight: 700,
      glow: `0 0 5px color-mix(in oklab, ${rp.color} 35%, transparent)`,
      pulse: false,
    };
  }
  switch (status) {
    case 'APPROVED':
    case 'LOCKED':
      // 2026-05-13 — Director: "approved циферки тускло горят, верните как
      // было". Bump weight to 700 and add a green text-shadow glow so the
      // canonical state reads at a glance again across all theme variants
      // (the underlying --accent-success var can be muted by some themes).
      return {
        color: 'var(--accent-success, #22c55e)',
        weight: 700,
        glow: '0 0 6px color-mix(in oklab, var(--accent-success, #22c55e) 65%, transparent)',
      };
    case 'REVIEW':
      return {
        color: 'var(--accent-warning, #f59e0b)',
        weight: 700,
        glow: '0 0 6px color-mix(in oklab, var(--accent-warning, #f59e0b) 55%, transparent)',
      };
    case 'REVISION':
      return { color: 'var(--accent-orange, #f97316)', weight: 600 };
    case 'REJECTED':
      return { color: 'var(--accent-danger, #ef4444)', weight: 600 };
    case 'NEEDS_HUMAN_TWEAK':
      return { color: 'var(--accent-purple, #a855f7)', weight: 600 };
    case 'DRAFT':
      return { color: 'var(--accent-info, #38bdf8)', weight: 500 };
    default:
      // NONE / unknown — animatic image fallback or placeholder.
      void kind; // reserved for future kind-specific tweaks
      return { color: 'var(--text-muted)', weight: 400 };
  }
}

export const AnimaticPlayer = forwardRef<AnimaticPlayerHandle, AnimaticPlayerProps>(function AnimaticPlayer(
  {
    assetId,
    contract,
    onChanged,
    vidShotAssets,
    onCellClick,
    filter = 'all',
    shotPlansByShotId,
    refPlansByShotId,
    onOpenAsset,
    liveWorkByShot,
    completedWorkByShot,
    imgRefAssets,
    synthetic = false,
    onGenerateVideo,
    generatingVideoShotId,
    excludedShotIds,
    onToggleExclusion,
    refCriticsByShotId,
    shotCriticsByShotId,
    onGenerateReference,
    generatingRefShotId,
    onVisualCheck,
    onStartVideo,
    startingVideo,
    onVideoFanout,
    videoFanoutCount,
    fanningOutVideo,
    onMaterialize,
  },
  ref,
) {
  // Hybrid mode: resolver maps each shot_id to its current canonical cell
  // (mp4-canonical / mp4-review / image fallback / placeholder).
  const timelineCells: TimelineCell[] = useMemo(
    () => resolveTimelineCells(contract, vidShotAssets ?? [], imgRefAssets ?? []),
    [contract, vidShotAssets, imgRefAssets],
  );

  // TD-43.C (2026-05-24): version-picker popover on timeline cell hover.
  // Groups VID-shot rows by metadata.shot_id so the popover can show ALL
  // versions for that shot (legacy v01 + plan-driven v02 etc), with click
  // to switch preview + inline approve action. Director's q50 / TD-43
  // original intent.
  const vidShotsByShotId = useMemo(() => {
    const map = new Map<string, VidShotAssetRow[]>();
    for (const row of vidShotAssets ?? []) {
      const sid = (row.metadata as { shot_id?: unknown } | null)?.shot_id;
      if (typeof sid !== 'string') continue;
      const existing = map.get(sid);
      if (existing) existing.push(row);
      else map.set(sid, [row]);
    }
    // Newest version first — shared comparator so this popover, the drawer and
    // the preview strips agree even on equal-version rows (they are fed by
    // queries with opposite created_at order, so a stable sort alone left them
    // rendering the same two rows in opposite order). Status is deliberately
    // NOT part of the order: never reposition, mark. See lib/api/asset-ordering.
    for (const rows of map.values()) {
      rows.sort(compareAssetVersionsNewestFirst);
    }
    return map;
  }, [vidShotAssets]);

  // Image-version parity — group IMG-episode_ref rows by their storyboard shot
  // id (metadata.shot_reference.shot_id — a DIFFERENT shape than VID-shot's
  // metadata.shot_id), newest version first. Mirrors vidShotsByShotId so the
  // kebab can list ref versions exactly like video versions.
  const imgRefsByShotId = useMemo(() => {
    const map = new Map<string, ImgRefAssetRow[]>();
    for (const row of imgRefAssets ?? []) {
      const sid = (row.metadata as { shot_reference?: { shot_id?: unknown } } | null)
        ?.shot_reference?.shot_id;
      if (typeof sid !== 'string') continue;
      const existing = map.get(sid);
      if (existing) existing.push(row);
      else map.set(sid, [row]);
    }
    for (const rows of map.values()) {
      rows.sort(compareAssetVersionsNewestFirst);
    }
    return map;
  }, [imgRefAssets]);

  // 2026-07-02 (Director): the per-cell kebab now opens on CLICK, not hover —
  // hover popovers were visual noise and felt unpredictable. Clicking a cell
  // toggles its kebab; clicking again (or another cell) closes it.
  const [openCellIdx, setOpenCellIdx] = useState<number | null>(null);
  const [approveBusyId, setApproveBusyId] = useState<string | null>(null);

  async function approveVersion(assetId: string): Promise<void> {
    setApproveBusyId(assetId);
    try {
      const res = await fetch(`/api/assets/${assetId}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // preview_acknowledged: harmless for text/plan rows, satisfies the
        // visual-asset gate for IMG/VID without opening the drawer first.
        body: JSON.stringify({
          decision: 'APPROVE',
          directorConfirm: true,
          preview_acknowledged: true,
        }),
      });
      if (!res.ok) throw new Error('approve failed');
      // Trigger parent refresh — SWR will refetch episode and timeline cell.
      if (onChanged) onChanged();
    } catch {
      // Surface failure as a brief visual signal; full UX in drawer.
    } finally {
      setApproveBusyId(null);
    }
  }

  // Un-approve (2026-07-05, Director "кнопки должны работать в обратную сторону")
  // — demote an APPROVED asset back to REVISION via the same generic approve
  // route. The FSM allows APPROVED→REVISION (revoke a too-eager approval); for a
  // ref/shot plan this also re-fires the producing agent (approve route's
  // REQUEST_REVISION auto-chain). LOCKED is terminal and gets no revoke.
  async function unapproveVersion(assetId: string): Promise<void> {
    setApproveBusyId(assetId);
    try {
      const res = await fetch(`/api/assets/${assetId}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decision: 'REQUEST_REVISION',
          note: 'Director revoked approval from the timeline kebab',
          directorConfirm: true,
        }),
      });
      if (!res.ok) throw new Error('unapprove failed');
      if (onChanged) onChanged();
    } catch {
      // Best-effort; full UX in drawer.
    } finally {
      setApproveBusyId(null);
    }
  }

  // Two-directional approve tick (2026-07-05). Compact per-row control that
  // works BOTH ways (Director q10a):
  //   REVIEW | INVALIDATED → outline ✓  = click to APPROVE (INVALIDATED re-pick).
  //   APPROVED             → amber   ↩  = click to UN-APPROVE (→ REVISION).
  //   LOCKED               → solid   ✓  = terminal state indicator (no action).
  //   anything else                     = no tick.
  function approveTick(status: string, assetId: string) {
    const isBusy = approveBusyId === assetId;
    if (status === 'LOCKED') {
      return (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded font-semibold select-none"
          style={{ background: 'var(--accent-success)', color: 'black' }}
          title="Locked"
          aria-label="Locked"
        >
          ✓
        </span>
      );
    }
    if (status === 'APPROVED') {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void unapproveVersion(assetId);
          }}
          disabled={isBusy}
          className="text-[10px] px-1.5 py-0.5 rounded font-semibold group/tick"
          style={{
            background: 'var(--accent-success)',
            color: 'black',
            opacity: isBusy ? 0.4 : 1,
          }}
          title="Снять утверждение (→ revision)"
          aria-label="Un-approve"
        >
          {isBusy ? '…' : '✓'}
        </button>
      );
    }
    if (status !== 'REVIEW' && status !== 'INVALIDATED') return null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void approveVersion(assetId);
        }}
        disabled={isBusy}
        className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
        style={{
          background: 'transparent',
          border: '1px solid color-mix(in oklab, var(--accent-success) 45%, transparent)',
          color: 'var(--accent-success)',
          opacity: isBusy ? 0.4 : 0.7,
        }}
        title="Approve"
      >
        {isBusy ? '…' : '✓'}
      </button>
    );
  }

  // Compact critic verdict chip for the Critic partition (VerdictPill is a
  // heavyweight card — too big for the dense kebab). PASS green / REVISE amber /
  // FAIL red / else muted.
  function verdictChip(verdict: string | null | undefined) {
    if (!verdict) return null;
    const v = verdict.toUpperCase();
    const tone =
      v === 'PASS'
        ? 'var(--accent-success)'
        : v === 'REVISE' || v === 'PASS_WITH_UNCERTAINTY'
          ? 'var(--accent-warning)'
          : v === 'FAIL'
            ? 'var(--accent-danger)'
            : 'var(--text-muted)';
    return (
      <span
        className="text-[9px] px-1 py-0.5 rounded font-semibold uppercase tracking-wider select-none"
        style={{
          color: tone,
          background: `color-mix(in oklab, ${tone} 14%, transparent)`,
          border: `1px solid color-mix(in oklab, ${tone} 35%, transparent)`,
        }}
        title={`Critic verdict: ${v}`}
      >
        {v === 'PASS_WITH_UNCERTAINTY' ? 'PASS?' : v}
      </span>
    );
  }

  // Per-line "generating…" badge (2026-07-05, Director: badges live INSIDE their
  // field's sub-line). Object-aware: the IMAGE field only lights up for
  // reference work (object !== 'animate'), the VIDEO field only for animate
  // work — so the same designer/critic role shows in the right field. Returns
  // null when no matching live work.
  function partitionBadge(
    liveWork: ShotWork | undefined,
    field: 'image' | 'video',
    role: WorkRole,
  ) {
    if (!liveWork || liveWork.roles.length === 0) return null;
    const objectMatches =
      field === 'video' ? liveWork.object === 'animate' : liveWork.object !== 'animate';
    if (!objectMatches || !liveWork.roles.includes(role)) return null;
    const rp = workRolePalette(liveWork.roles);
    const label = role === 'designer' ? 'writing…' : role === 'critic' ? 'reviewing…' : 'generating…';
    return (
      <span
        className="text-[9px] px-1 py-0.5 rounded font-semibold inline-flex items-center gap-1 cell-stage-pulse"
        style={{
          color: rp.color,
          background: `color-mix(in oklab, ${rp.color} 14%, transparent)`,
          border: `1px solid color-mix(in oklab, ${rp.color} 40%, transparent)`,
          ['--stage-glow' as string]: rp.color,
        }}
      >
        {label}
      </span>
    );
  }

  // One compact version row (2026-07-05 two-field kebab) — open button (tag +
  // vNN + optional verdict chip + status + on-screen marker) plus the
  // two-directional approve/снять tick. Shared by every sub-line (plan / critic
  // / image / video) in both fields.
  function versionRow(opts: {
    id: string;
    version: number | null;
    status: string;
    tag?: string;
    onScreen?: boolean;
    verdict?: string | null;
    paletteKind: 'plan' | 'image' | 'video-review';
    onOpen: () => void;
  }) {
    return (
      <div
        key={opts.id}
        className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-[color-mix(in_oklab,_white_8%,_transparent)]"
        style={
          opts.onScreen
            ? { background: 'color-mix(in oklab, var(--accent-primary, #6EC6E8) 20%, transparent)' }
            : undefined
        }
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            opts.onOpen();
          }}
          className="flex-1 text-left font-mono text-[11px] cursor-pointer inline-flex items-center gap-1.5"
        >
          {opts.onScreen ? '▶' : ''}
          {opts.tag && <span className="opacity-40">{opts.tag}</span>}
          <span>v{String(opts.version ?? 1).padStart(2, '0')}</span>
          {opts.verdict !== undefined && verdictChip(opts.verdict)}
          <span
            className="opacity-70"
            style={{ color: cellPalette(opts.status as never, opts.paletteKind).color }}
          >
            {opts.status}
          </span>
          {opts.onScreen && (
            <span className="opacity-60 text-[9px] uppercase tracking-wider">on screen</span>
          )}
        </button>
        {approveTick(opts.status, opts.id)}
      </div>
    );
  }
  // Local copy of overrides so Director can edit live without round-tripping
  // to DB on every click. Persisted by the 3s-debounced autosave below —
  // playback always reads THIS state (buildTimeline), so an edit is audible
  // immediately regardless of when it reaches the DB.
  const [overrides, setOverrides] = useState<Record<string, AnimaticDirectorOverride>>(
    () => ({ ...(contract.director_overrides ?? {}) }),
  );
  // 2026-07-18 — timing and audio dirt are tracked SEPARATELY. The timing
  // autosave sends only `overrides`; audio goes through its own explicit
  // button. Two guarantees fall out of the split: a frequent timing save can
  // never clobber an audio edit made elsewhere, and it can never trigger the
  // (slow) server-side ffmpeg music re-encode.
  const [timingDirty, setTimingDirty] = useState(false);
  const [audioDirty, setAudioDirty] = useState(false);
  // Music block collapsed by default (Director 2026-07-25): it now lives at the
  // BOTTOM of the player (order-last) and starts folded to declutter. The master
  // <audio> stays MOUNTED while collapsed (content hidden, not unmounted) so it
  // remains the playback clock and still plays sound.
  const [musicCollapsed, setMusicCollapsed] = useState(true);

  // 2026-06-06 — local copy of audio tracks. Director can tweak fade-in/out
  // + trim on the music row; the same /animatic-timing PATCH persists both
  // shot overrides and full audio_tracks[] (anti-additive — one save path).
  // Forward-compat per directive #4: reads `audio_tracks[]` when present,
  // falls back to legacy `music_url` single track for v1 assets.
  const [audioTracksLocal, setAudioTracksLocal] = useState<AudioTrack[]>(
    () => getAudioTracks(contract),
  );
  const audioTracks: AudioTrack[] = audioTracksLocal;

  // Shot ids the Director has edited but which are not confirmed saved yet, and
  // the same flag for the audio row. Refs (not state) so the re-seed effect
  // below can consult them without taking them as dependencies.
  const touchedShotIdsRef = useRef<Set<string>>(new Set());
  const audioTouchedRef = useRef(false);
  // Bumped on every timing edit. Serves two purposes: it re-arms the autosave
  // debounce (as STATE, so the effect actually re-runs) and it lets an
  // in-flight save detect that the Director edited again while it was away.
  //
  // Deliberately NOT keyed off the `overrides` object: the re-seed effect above
  // hands back a fresh object on every Realtime push, which would reset the
  // debounce timer continuously while jobs run and starve the autosave.
  const [editSeq, setEditSeq] = useState(0);
  const editSeqRef = useRef(0);
  editSeqRef.current = editSeq;

  // Re-seed overrides whenever the asset row changes (e.g. parent SWR refetch).
  //
  // 2026-07-18 — this used to blow away local state wholesale and reset
  // `dirty` to false. Since c4d35d4b made Realtime push the primary freshness
  // path, `mutate()` fires on EVERY activity_event for the episode — so with a
  // job running, a Director's fresh edit was wiped ~a second later and the Save
  // button fell back to "Saved" having saved nothing. That is the "кнопка не
  // срабатывает" report. Unsaved edits now win over the server copy; everything
  // untouched still refreshes normally.
  useEffect(() => {
    const serverOverrides = { ...(contract.director_overrides ?? {}) };
    setOverrides((prev) => {
      const touched = touchedShotIdsRef.current;
      if (touched.size === 0) return serverOverrides;
      const merged = { ...serverOverrides };
      for (const shotId of touched) {
        // Absent locally = Director cleared the override; keep it cleared.
        if (prev[shotId]) merged[shotId] = prev[shotId];
        else delete merged[shotId];
      }
      return merged;
    });
    setAudioTracksLocal((prev) => (audioTouchedRef.current ? prev : getAudioTracks(contract)));
  }, [contract]);

  // 2026-06-06 — build a shot_id → real VID-shot duration map from the
  // already-fetched vidShotsByShotId (no extra fetch). Used by buildTimeline
  // to clamp each per-shot duration to the actual clip length so the
  // timeline reflects the honest final-cut layout, not the unreachable
  // animatic-declared one.
  const clipLengths = useMemo(() => {
    const map = new Map<string, number>();
    for (const [shotId, rows] of vidShotsByShotId) {
      const latest = rows[0];
      const meta = latest?.metadata as { duration_seconds?: unknown } | null;
      const dur = meta?.duration_seconds;
      if (typeof dur === 'number' && dur > 0) map.set(shotId, dur);
    }
    return map;
  }, [vidShotsByShotId]);

  const { times, total, visualSpan } = useMemo(
    () => buildTimeline(contract.shot_list, overrides, clipLengths, excludedShotIds),
    [contract.shot_list, overrides, clipLengths, excludedShotIds],
  );

  // Playback state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentT, setCurrentT] = useState(0); // seconds elapsed
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Inline preview <video> — explicit ref so useEffect can play/pause/seek it
  // in lockstep with the master clock (Phase A.1 fix for two playback bugs:
  // selected-cell + Play starts NEXT cell, and Pause/Resume jumps cells).
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(0);
  const startTOffsetRef = useRef<number>(0); // where we resumed from
  // Mirror the master clock in a ref so the inline-video sync effect can read
  // currentT without re-running on every tick (state changes 60×/s during play).
  const currentTRef = useRef<number>(0);
  useEffect(() => {
    currentTRef.current = currentT;
  }, [currentT]);

  // ── Playback engine ──────────────────────────────────────────────────────
  // 2026-06-06 — `t` is in PLAYBACK coords (excluded shots consume 0 time).
  // Walk backwards through non-excluded entries by their `playStart`; an
  // excluded cell shares its playStart with the next non-excluded one, so
  // looking at playStart alone gives us the right "currently-playing" index
  // without ever landing on an excluded cell.
  const computeIndex = useCallback(
    (t: number): number => {
      for (let i = times.length - 1; i >= 0; i--) {
        const entry = times[i]!;
        if (entry.excluded) continue;
        if (t >= entry.playStart) return i;
      }
      return 0;
    },
    [times],
  );

  const tick = useCallback(() => {
    const audio = audioRef.current;
    let t: number;
    if (audio && !audio.paused) {
      t = audio.currentTime;
    } else {
      const elapsed = (Date.now() - startTsRef.current) / 1000;
      t = startTOffsetRef.current + elapsed;
    }
    if (t >= total) {
      // Reached end — pause.
      setCurrentT(total);
      setCurrentIndex(times.length - 1);
      setIsPlaying(false);
      if (audio) audio.pause();
      rafRef.current = null;
      return;
    }
    setCurrentT(t);
    setCurrentIndex(computeIndex(t));
    rafRef.current = requestAnimationFrame(tick);
  }, [computeIndex, times.length, total]);

  // Stop the RAF loop when component unmounts or when isPlaying flips off.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handlePlay = useCallback(() => {
    if (isPlaying) return;
    // Read latest start position from the mutable ref so click-on-cell
    // immediately followed by Play starts at the clicked cell, not at the
    // stale React-state currentT (Phase A.1 fix #1).
    const startFrom = startTOffsetRef.current;
    if (startFrom >= total) {
      // Auto-reset on play after end.
      startTOffsetRef.current = 0;
      setCurrentT(0);
      setCurrentIndex(0);
      const audio = audioRef.current;
      if (audio) audio.currentTime = 0;
    }
    startTsRef.current = Date.now();
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = startTOffsetRef.current;
      void audio.play().catch(() => {
        /* user gesture might be needed — ignore */
      });
    }
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [isPlaying, tick, total]);

  const handlePause = useCallback(() => {
    if (!isPlaying) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const audio = audioRef.current;
    if (audio) audio.pause();
    setIsPlaying(false);
  }, [isPlaying]);

  const handleStop = useCallback(() => {
    handlePause();
    // Stop = pause without rewinding (cursor stays).
  }, [handlePause]);

  const handleReset = useCallback(() => {
    handlePause();
    startTOffsetRef.current = 0;
    setCurrentT(0);
    setCurrentIndex(0);
    const audio = audioRef.current;
    if (audio) audio.currentTime = 0;
  }, [handlePause]);

  const seekTo = useCallback(
    (t: number) => {
      const clamped = Math.max(0, Math.min(t, total));
      startTOffsetRef.current = clamped;
      startTsRef.current = Date.now();
      currentTRef.current = clamped; // keep ref in sync for video-sync effect
      setCurrentT(clamped);
      setCurrentIndex(computeIndex(clamped));
      const audio = audioRef.current;
      if (audio) audio.currentTime = clamped;
    },
    [computeIndex, total],
  );

  // ── Imperative API: seekToShot — caller (EpisodeTimelineSection) jumps
  // playhead to a specific shot_id after a regenerate completes (Phase A.1
  // directive — "new candidate must appear and focused").
  useImperativeHandle(
    ref,
    () => ({
      seekToShot: (shotId: string) => {
        const idx = contract.shot_list.findIndex((s) => s.shot_id === shotId);
        if (idx < 0) return;
        // 2026-06-06 — seek in PLAYBACK coords (excluded shots consume 0
        // time); for excluded targets this lands on the next playable shot.
        const time = times[idx]?.playStart ?? 0;
        seekTo(time);
      },
    }),
    [contract.shot_list, seekTo, times],
  );

  // ── Duration editing ─────────────────────────────────────────────────────

  const setDuration = useCallback(
    (shotId: string, value: number) => {
      const safe = Math.max(MIN_SHOT_S, Math.min(MAX_SHOT_S, Math.round(value * 10) / 10));
      setOverrides((prev) => ({
        ...prev,
        [shotId]: {
          ...(prev[shotId] ?? {}),
          duration_seconds: safe,
          edited_at: new Date().toISOString(),
        },
      }));
      touchedShotIdsRef.current.add(shotId);
      setEditSeq((n) => n + 1);
      setTimingDirty(true);
    },
    [],
  );

  // 2026-06-06 — head trim handler. Mirrors setDuration; clamped to [0, 30]s
  // (anything beyond half a minute on a single shot is almost certainly a
  // typo). Setting 0 explicitly clears the override.
  const setTrimStart = useCallback(
    (shotId: string, value: number) => {
      const safe = Math.max(0, Math.min(30, Math.round(value * 10) / 10));
      setOverrides((prev) => {
        // 2026-06-08 — seed duration_seconds from the shot's DECLARED duration
        // (override or storyboard), never 0. Previously `?? 0` poisoned the
        // override with duration_seconds: 0 when Director adjusted head trim on
        // a shot without a prior duration override — the route's
        // `z.number().positive()` rejected it, breaking every subsequent Save
        // ("Request body failed validation") until reload.
        const shot = contract.shot_list.find((s) => s.shot_id === shotId);
        const baseDuration = shot
          ? effectiveDurationSeconds(shot, prev)
          : (prev[shotId]?.duration_seconds ?? 0);
        return {
          ...prev,
          [shotId]: {
            duration_seconds: baseDuration,
            ...(safe > 0 ? { trim_start_seconds: safe } : {}),
            edited_at: new Date().toISOString(),
          },
        };
      });
      touchedShotIdsRef.current.add(shotId);
      setEditSeq((n) => n + 1);
      setTimingDirty(true);
    },
    [contract.shot_list],
  );

  // ── Saving ───────────────────────────────────────────────────────────────

  const [savingTiming, setSavingTiming] = useState(false);
  const [savingAudio, setSavingAudio] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Freshest values for the flush handlers (unmount / tab hide), which fire
  // outside React's render cycle and would otherwise close over stale state.
  const latestRef = useRef({ overrides, audioTracksLocal, timingDirty });
  latestRef.current = { overrides, audioTracksLocal, timingDirty };

  // Serialises saves — a second PATCH never overlaps the first (except the
  // forced flush on unload, where losing the edit is the worse outcome).
  const savingRef = useRef(false);

  // Materialize-on-first-edit: in synthetic mode there is no backing asset.
  // Create the animatic vessel from the storyboard skeleton (parent owns the
  // POST) and PATCH the returned id — so the Director never has to approve an
  // empty animatic to unlock timing editing.
  const resolveTargetId = useCallback(async (): Promise<string> => {
    if (assetId) return assetId;
    if (onMaterialize) {
      const created = await onMaterialize();
      if (!created) {
        throw new Error('Could not materialize the animatic — is the storyboard approved?');
      }
      return created;
    }
    throw new Error('No animatic asset to save timing into.');
  }, [assetId, onMaterialize]);

  // `saveTimingNow` must be referentially STABLE — it is the dependency of both
  // the debounce effect and the flush effect (whose cleanup fires a save). The
  // parent re-creates `onMaterialize` on every render, so depending on it
  // directly would re-arm the debounce forever and fire a keepalive PATCH on
  // every render. Reach the current implementation through a ref instead.
  const resolveTargetIdRef = useRef(resolveTargetId);
  resolveTargetIdRef.current = resolveTargetId;

  /**
   * Persist per-shot durations. Deliberately does NOT send `audio_tracks`:
   * that keeps the request metadata-only on the server (no ffmpeg music
   * re-encode — the reason this save used to take tens of seconds) and makes
   * it impossible for a timing autosave to clobber an audio edit.
   */
  const saveTimingNow = useCallback(
    async (opts?: { force?: boolean; keepalive?: boolean }) => {
      if (savingRef.current && !opts?.force) return;
      savingRef.current = true;
      setSavingTiming(true);
      setError(null);
      // Edits landing while this request is in flight must not be marked clean
      // when it resolves; the sequence number detects that.
      const seqAtStart = editSeqRef.current;
      try {
        const targetId = await resolveTargetIdRef.current();
        const overridesPayload: Record<
          string,
          { duration_seconds: number; trim_start_seconds?: number }
        > = {};
        for (const [k, v] of Object.entries(latestRef.current.overrides)) {
          overridesPayload[k] = {
            duration_seconds: v.duration_seconds,
            // 2026-06-06 — forward head trim when set; the route accepts it
            // as an optional field in the per-shot override schema.
            ...(typeof v.trim_start_seconds === 'number' && v.trim_start_seconds > 0
              ? { trim_start_seconds: v.trim_start_seconds }
              : {}),
          };
        }
        const res = await fetch(`/api/assets/${targetId}/animatic-timing`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          ...(opts?.keepalive ? { keepalive: true } : {}),
          body: JSON.stringify({ overrides: overridesPayload, directorConfirm: true }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error ?? 'Save timing failed');
        }
        if (editSeqRef.current === seqAtStart) {
          touchedShotIdsRef.current.clear();
          setTimingDirty(false);
        }
        setSavedAt(new Date());
      } catch (e) {
        setError((e as Error).message);
      } finally {
        savingRef.current = false;
        setSavingTiming(false);
      }
    },
    [],
  );

  // Autosave: 3s after the last edit. `editSeq` bumps on each edit and re-arms
  // the timer — that is what makes this a debounce rather than an interval.
  // Playback never waits on this — buildTimeline reads local state.
  useEffect(() => {
    if (!timingDirty) return;
    const timer = setTimeout(() => void saveTimingNow(), TIMING_AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [timingDirty, editSeq, saveTimingNow]);

  // Never lose an edit to a closing tab, a background tab, or navigation away
  // mid-debounce. `force` bypasses the serialisation guard and `keepalive`
  // lets the request outlive the document.
  useEffect(() => {
    const flush = () => {
      if (!latestRef.current.timingDirty) return;
      void saveTimingNow({ force: true, keepalive: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [saveTimingNow]);

  /**
   * Persist Director's audio shaping. Explicit button, not autosaved: this is
   * the request that runs ffmpeg server-side (`process_audio`), so it is slow
   * by nature — and music is edited rarely, unlike shot durations.
   */
  const handleSaveAudio = useCallback(async () => {
    setSavingAudio(true);
    setError(null);
    try {
      const targetId = await resolveTargetId();
      const res = await fetch(`/api/assets/${targetId}/animatic-timing`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          audio_tracks: latestRef.current.audioTracksLocal,
          process_audio: true,
          directorConfirm: true,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Save music failed');
      }
      audioTouchedRef.current = false;
      setAudioDirty(false);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingAudio(false);
    }
  }, [onChanged, resolveTargetId]);

  // 2026-06-06 — mutate a single audio track in-place. 2026-07-18: marks the
  // AUDIO dirty flag only, so it is picked up by the music button and never by
  // the timing autosave.
  const updateAudioTrack = useCallback(
    (index: number, patch: Partial<AudioTrack>) => {
      setAudioTracksLocal((prev) => {
        const next = [...prev];
        if (next[index]) next[index] = { ...next[index], ...patch };
        return next;
      });
      audioTouchedRef.current = true;
      setAudioDirty(true);
    },
    [],
  );

  // Animatic Approve/Reject ceremony REMOVED (2026-07-09, animatic-stage
  // demotion). Pacing review lives on the timeline; the video stream opens via
  // the "Start Video" latch (transport button → parent's /start-video), not by
  // approving a whole-episode animatic.

  // Music upload lives ONLY in the Composer now (2026-07-11, Director): the
  // timeline's "Replace"/"Upload music" buttons + their handler were removed so
  // there is one place to add a track. Approving it in the Composer bakes it
  // onto this timeline automatically (computeNextEvents AUD-music branch).

  // ── Render ───────────────────────────────────────────────────────────────

  const currentShot = times[currentIndex]?.shot;
  // 2026-07-18 — the duration editor acts on the SELECTED cell (the one whose
  // kebab is open), falling back to the playhead when nothing is selected.
  //
  // It used to read `currentIndex` directly, which made excluded shots
  // impossible to edit — and editing them is exactly how you un-exclude one.
  // `computeIndex` skips excluded entries by design, and an excluded cell
  // shares its playStart with the next playable shot, so clicking cell 28 put
  // the playhead (and the editor) on 29: the Director raised 29's duration
  // while 28 stayed collapsed and dimmed. That is the "increase the timing but
  // the opacity never comes back" report.
  const editIdx = openCellIdx ?? currentIndex;
  const editShot = times[editIdx]?.shot;
  const editTailDuration = editShot ? effectiveDurationSeconds(editShot, overrides) : 0;
  const editNetDuration = editShot
    ? computeEffectivePlayback(editShot, overrides, clipLengths)
    : 0;
  // 2026-06-08 — the editor must read the TRUE override value, NOT the visual
  // cell duration. buildTimeline inflates excluded shots (≤0.5s) to
  // EXCLUDED_VISUAL_SECONDS (1.5) for clickability, which made the −/+ buttons
  // jump 1 → 1.5 instead of 1 → 0.5. Two honest values:
  //   tail = Director's declared length (override or storyboard), drives −/+
  //   net  = what actually plays in the final cut (after head trim + clip clamp)
  const currentNetDuration = currentShot
    ? computeEffectivePlayback(currentShot, overrides, clipLengths)
    : 0;
  // 2026-06-06 — pass clipLengths so the displayed total reflects the
  // HONEST final-cut duration (clamped to actual VID-shot lengths) instead
  // of unreachable animatic-declared durations.
  const newTotal = computeTotalDuration(contract.shot_list, overrides, clipLengths);

  // In hybrid mode, the cell index corresponds 1:1 with shot index — fetch the
  // resolved cell for the current frame so we can decide between <img> / <video>
  // and color-code the status pill.
  const currentCell = timelineCells[currentIndex];
  const isHybridMode = (vidShotAssets?.length ?? 0) > 0;
  // 2026-06-06 — in PLAYBACK coords (excluded shots consume 0 time), so the
  // in-cell offset for the inline-video sync below is `currentT - playStart`.
  const currentCellStart = times[currentIndex]?.playStart ?? 0;

  // ── Inline-video sync (Phase A.1 fix for bugs 1+2) ──────────────────────
  // The inline <video> only takes its `autoPlay` prop into account at MOUNT.
  // Toggling isPlaying later does nothing — that was the playback bug. Drive
  // it explicitly via ref. Also keep video.currentTime in lockstep with the
  // master clock when isPlaying flips on, so resume after pause stays at the
  // exact in-cell offset.
  // 2026-06-06 — read the active head-trim override for the current shot,
  // so the <video> element starts (and resumes) at the trimmed-in offset.
  // Without this the preview plays the slow lead-in that EXEC-STITCH will
  // skip — Director couldn't see what the final cut would look like.
  const currentTrimStart = currentShot
    ? overrides[currentShot.shot_id]?.trim_start_seconds ?? 0
    : 0;

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const isVideoCell =
      currentCell?.kind === 'video-canonical' ||
      currentCell?.kind === 'video-review';
    if (!isVideoCell) return;
    // 2026-06-06 — seek to trim_start + in-cell offset so the preview matches
    // what ffmpeg's `inpoint` directive will read from the source clip.
    const inCellOffset = Math.max(0, currentTRef.current - currentCellStart);
    const seekTarget = currentTrimStart + inCellOffset;
    try {
      vid.currentTime = seekTarget;
    } catch {
      /* seeking before metadata loaded — browser will seek when ready */
    }
    if (isPlaying) {
      void vid.play().catch(() => {
        /* autoplay rejected by browser policy — fall back to user gesture */
      });
    } else {
      vid.pause();
    }
    // Re-run when isPlaying changes, when currentCell switches to a new mp4
    // (key change rebuilds the ref), or when Director edits trim_start so
    // the preview re-anchors to the new in-point immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentCell?.url, currentTrimStart]);

  return (
    // flex-col + gap so `order-last` on the music block relocates it to the bottom
    // (Director 2026-07-25) without physically moving 160 lines of JSX. gap-3
    // matches the old space-y-3 rhythm; order works in flex, not in space-y.
    <div className="flex flex-col gap-3">
      {/* 2026-06-08 — episode duration INFO moved down into the Timeline header
          row (Director: reading it above the preview was inconvenient). */}

      {/* Preview area — hybrid: <video> for VID-shot cells (canonical/review),
          <img> for animatic image fallback. Cell border color reflects status:
          green = canonical APPROVED/LOCKED, yellow = REVIEW (tentative per
          directive #2), no border = animatic image fallback. */}
      <div
        className="relative rounded-lg overflow-hidden border-2 bg-black"
        style={{
          aspectRatio: '16 / 9',
          borderColor:
            currentCell?.kind === 'video-canonical'
              ? 'var(--accent-success, #22c55e)'
              : currentCell?.kind === 'video-review'
                ? 'var(--accent-warning, #f59e0b)'
                : 'var(--panel-glass-border, rgba(255,255,255,0.1))',
        }}
      >
        {currentCell?.kind === 'video-canonical' || currentCell?.kind === 'video-review' ? (
          <video
            ref={videoRef}
            key={currentCell.url ?? currentShot?.shot_id}
            src={currentCell.url ?? undefined}
            className="absolute inset-0 w-full h-full object-contain"
            // Playback driven explicitly by the videoRef sync useEffect above.
            // We don't set autoPlay here because the effect handles play/pause
            // in lockstep with the master clock (bugs 1+2 fix).
            muted
            playsInline
            preload="auto"
          />
        ) : currentCell?.kind === 'image' && currentCell.url ? (
          // 2026-06-24 — render the RESOLVED cell url (live newest ref), NOT the
          // frozen contract's currentShot.image_url. The frozen url is null for a
          // ref approved after the last animatic rebuild, so the preview was blank
          // for most shots even though the tint/kebab (live) showed the ref. key
          // forces a re-render when the url changes between shots.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={currentCell.url}
            src={currentCell.url}
            alt={currentShot?.shot_id ?? 'frame'}
            className="absolute inset-0 w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted text-xs">
            No shots yet
          </div>
        )}
        {/* Status pill (top-right) — visible only in hybrid mode. */}
        {isHybridMode && currentCell && currentCell.status !== 'NONE' && (
          <div
            className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
            style={{
              // 2026-05-13 — Director: "approved pills были ярко-зелёные,
              // стали тускло-зелёные, верните как было". 75% over transparent
              // was the Phase A.1 "non-approved colorization" pass and
              // accidentally muted the canonical APPROVED state too. Bring
              // canonical green back to solid + boost REVIEW so the timeline
              // reads at a glance again.
              background:
                currentCell.kind === 'video-canonical'
                  ? 'var(--accent-success, #22c55e)'
                  : currentCell.kind === 'video-review'
                    ? 'var(--accent-warning, #f59e0b)'
                    : 'rgba(0,0,0,0.55)',
              color: 'white',
              boxShadow:
                currentCell.kind === 'video-canonical'
                  ? '0 0 6px color-mix(in oklab, var(--accent-success, #22c55e) 55%, transparent)'
                  : currentCell.kind === 'video-review'
                    ? '0 0 6px color-mix(in oklab, var(--accent-warning, #f59e0b) 55%, transparent)'
                    : undefined,
            }}
          >
            {currentCell.status}
          </div>
        )}
        {currentShot && (
          <div
            className="absolute bottom-2 left-2 right-2 text-xs text-white px-2 py-1 rounded"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
          >
            <span className="font-mono">{currentShot.shot_id}</span>
            {/* 2026-06-06 — surface "which version is on screen right now".
                Director Issue B: caption used to say only shot_id, so "is this
                v01 or v03?" required opening the popover.

                2026-07-18 — this read `vidShotsByShotId[0]` on the assumption
                that "first by version desc" is what plays. It is not: the cell
                resolver picks by STATUS TIER first (canonical APPROVED/LOCKED,
                else REVIEW) and only then by version, so with v01 APPROVED +
                v03 DRAFT the badge announced "v03 DRAFT" while the APPROVED v01
                was on screen. Read the resolved cell instead — one source of
                truth for what is playing. */}
            {(() => {
              const rows = vidShotsByShotId.get(currentShot.shot_id);
              const winner = currentCell?.asset_id
                ? rows?.find((r) => r.id === currentCell.asset_id)
                : undefined;
              if (!winner) return null;
              return (
                <span
                  className="ml-2 px-1.5 rounded font-mono text-[10px] tabular-nums"
                  style={{
                    background:
                      winner.status === 'APPROVED' || winner.status === 'LOCKED'
                        ? 'color-mix(in oklab, var(--accent-success, #22c55e) 30%, transparent)'
                        : 'color-mix(in oklab, var(--accent-warning, #f59e0b) 30%, transparent)',
                  }}
                  title="Playing this version (as picked by the timeline cell resolver)"
                >
                  v{String(winner.version ?? 1).padStart(2, '0')} {winner.status}
                </span>
              );
            })()}
            {currentShot.shot_role && <span className="ml-2 opacity-80">· {currentShot.shot_role}</span>}
            <span className="ml-2 opacity-80">· {currentNetDuration.toFixed(1)}s</span>
            {isHybridMode && currentCell && (
              <button
                type="button"
                onClick={() => onCellClick?.(currentCell)}
                disabled={!onCellClick || !currentCell.asset_id}
                className="ml-2 underline opacity-90 hover:opacity-100 disabled:opacity-50 disabled:no-underline"
                title="Open this shot in drawer for review"
              >
                Open shot →
              </button>
            )}
            {currentShot.caption && (
              <div className="opacity-75 truncate mt-0.5">{currentShot.caption}</div>
            )}
          </div>
        )}
      </div>

      {/* Audio bar — supports multi-track (music / voice / sfx / ambience).
          Collapsible + moved to the BOTTOM via order-last (Director 2026-07-25):
          the master <audio> stays MOUNTED even when collapsed (content hidden via
          `hidden`, not unmounted) so it remains the playback clock and still plays
          sound. Default collapsed to declutter — expand for the shaping controls.
          For animatic v1 with only `music_url`, getAudioTracks fabricates a single
          'music' track; EXEC-MGEN voice / sfx tracks land here without UI rewrite. */}
      <div className="rounded-lg border border-glass order-last">
        <button
          type="button"
          onClick={() => setMusicCollapsed((v) => !v)}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-left select-none"
          aria-expanded={!musicCollapsed}
        >
          <Music2 size={13} className="text-[var(--accent-primary)]" />
          <span className="text-xs font-medium text-text-primary">Music</span>
          {musicCollapsed && audioTracks[0]?.filename && (
            <span className="text-[11px] text-text-muted truncate font-mono">
              {audioTracks[0].filename}
            </span>
          )}
          <span className="flex-1" />
          {audioDirty && (
            <span className="text-[10px]" style={{ color: 'var(--accent-warning)' }}>
              не сохранено
            </span>
          )}
          {musicCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <div className={musicCollapsed ? 'hidden' : 'px-2.5 pb-2.5 pt-0 space-y-1.5'}>
        {audioTracks.length > 0 ? (
          audioTracks.map((track, i) => {
            const isMaster = i === 0;
            return (
              <div key={`${track.layer}-${track.url}`} className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Music2
                    size={13}
                    className={isMaster ? 'text-[var(--accent-primary)]' : 'text-text-muted'}
                  />
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider"
                    style={{
                      background: 'color-mix(in oklab, var(--accent-primary) 15%, transparent)',
                      color: 'var(--accent-primary)',
                    }}
                  >
                    {track.layer}
                  </span>
                  <span className="truncate flex-1 font-mono text-text-primary">
                    {track.filename}
                  </span>
                </div>
                <audio
                  ref={isMaster ? audioRef : undefined}
                  src={resolveMusicPreviewUrl(track)}
                  preload="auto"
                  controls
                  className="w-full"
                  style={{ height: 32 }}
                />
                {/* 2026-06-06 — Director audio shaping (music track only).
                    Inline fade-in / fade-out + trim controls. Persist via
                    the same "Save timing" button (sets dirty on edit). */}
                {track.layer === 'music' && (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-text-secondary px-1 pt-1">
                    <label className="flex items-center gap-1.5">
                      <span className="opacity-70">Fade in</span>
                      <input
                        key={`${track.url}-fadeIn-${track.fade_in_seconds ?? 0}`}
                        type="number"
                        min={0}
                        max={30}
                        step={0.1}
                        defaultValue={(track.fade_in_seconds ?? 0).toFixed(1)}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          const safe = Number.isFinite(v) && v >= 0 ? Math.min(v, 30) : 0;
                          updateAudioTrack(i, { fade_in_seconds: safe > 0 ? safe : undefined });
                        }}
                        className="w-14 px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-glass text-right font-mono"
                      />
                      <span className="opacity-50">s</span>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <span className="opacity-70">Fade out</span>
                      <input
                        key={`${track.url}-fadeOut-${track.fade_out_seconds ?? 0}`}
                        type="number"
                        min={0}
                        max={30}
                        step={0.1}
                        defaultValue={(track.fade_out_seconds ?? 0).toFixed(1)}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          const safe = Number.isFinite(v) && v >= 0 ? Math.min(v, 30) : 0;
                          updateAudioTrack(i, { fade_out_seconds: safe > 0 ? safe : undefined });
                        }}
                        className="w-14 px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-glass text-right font-mono"
                      />
                      <span className="opacity-50">s</span>
                    </label>
                    <label
                      className="flex items-center gap-1.5"
                      title="Skip the first N seconds of the music source. e.g. set 5 to drop a 5-second intro/silence at the start of the file."
                    >
                      <span className="opacity-70">Skip from start</span>
                      <input
                        key={`${track.url}-trimIn-${track.trim_in_seconds ?? 0}`}
                        type="number"
                        min={0}
                        step={0.1}
                        defaultValue={(track.trim_in_seconds ?? 0).toFixed(1)}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          const safe = Number.isFinite(v) && v >= 0 ? v : 0;
                          updateAudioTrack(i, { trim_in_seconds: safe > 0 ? safe : undefined });
                        }}
                        className="w-16 px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-glass text-right font-mono"
                      />
                      <span className="opacity-50">s</span>
                    </label>
                    <label
                      className="flex items-center gap-1.5"
                      title="Stop reading the music source at this absolute timestamp. e.g. set 90 to use only the first 90 seconds of a 2:23 track. Empty = use the entire remaining track."
                    >
                      <span className="opacity-70">Use until</span>
                      <input
                        key={`${track.url}-trimOut-${track.trim_out_seconds ?? ''}`}
                        type="number"
                        min={0}
                        step={0.1}
                        placeholder="full"
                        defaultValue={typeof track.trim_out_seconds === 'number' ? track.trim_out_seconds.toFixed(1) : ''}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          if (raw === '') {
                            updateAudioTrack(i, { trim_out_seconds: undefined });
                            return;
                          }
                          const v = parseFloat(raw);
                          const safe = Number.isFinite(v) && v > 0 ? v : undefined;
                          updateAudioTrack(i, { trim_out_seconds: safe });
                        }}
                        className="w-16 px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-glass text-right font-mono"
                      />
                      <span className="opacity-50">s in source</span>
                    </label>
                  </div>
                )}
                {/* 2026-07-18 — music shaping keeps an EXPLICIT save. It is the
                    only request that runs ffmpeg server-side, so it is slow by
                    nature; music is edited rarely, unlike shot durations (which
                    autosave). Applying re-bakes the preview derivative. */}
                {track.layer === 'music' && (
                  <div className="flex items-center gap-2 px-1 pt-1">
                    <Button
                      variant={audioDirty ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={handleSaveAudio}
                      disabled={savingAudio || !audioDirty}
                      title={
                        audioDirty
                          ? 'Сохранить обрезку и фейды — пересоберёт превью (займёт время)'
                          : 'Правок музыки нет'
                      }
                    >
                      {savingAudio ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Save size={13} />
                      )}{' '}
                      {savingAudio ? 'Применяю…' : 'Применить музыку'}
                    </Button>
                    {audioDirty && !savingAudio && (
                      <span className="text-[11px]" style={{ color: 'var(--accent-warning)' }}>
                        не сохранено
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <Music2 size={13} className="text-text-muted" />
            <span className="text-text-muted flex-1">
              No audio yet — add a track in the Composer and approve it; it appears here automatically.
            </span>
          </div>
        )}
        </div>
      </div>

      {/* Timeline strip — Phase A.1: numbers ~2× bigger, expanded color palette,
          hover bubble tooltip showing shot_id · duration · status. Strip height
          bumped 36→44 for the larger numbers; per-cell bubble shows on hover. */}
      <div className="space-y-1.5">
        {/* 2026-06-08 — episode duration INFO lives here now (was above preview). */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Timeline</span>
          <span className="text-xs text-text-secondary font-mono">
            {contract.shot_list.length} shots · {fmt(currentT)} / {fmt(newTotal)}
            {timingDirty && (
              <span className="ml-1" style={{ color: 'var(--accent-warning)' }}>· unsaved</span>
            )}
          </span>
        </div>
        <div
          className="relative rounded-md border border-glass"
          style={{ height: 44, background: 'var(--bg-elevated)' }}
        >
          {times.map((t, i) => {
            // Layout uses visualSpan (includes a minimum width for excluded
            // cells); progress cursor (below) uses `total` (honest playback).
            const widthPct = visualSpan > 0 ? (t.duration / visualSpan) * 100 : 0;
            const leftPct = visualSpan > 0 ? (t.cumStart / visualSpan) * 100 : 0;
            const isCurrent = i === currentIndex;
            // 2026-07-18 — "selected" (what the editor below acts on) is a
            // DIFFERENT thing from "playing". They diverge on excluded shots:
            // the playhead can never land on one, so clicking cell 28 used to
            // highlight 29. Mark the selection explicitly.
            const isSelected = openCellIdx === i;
            const cell = timelineCells[i];
            const cellMatchesFilter =
              filter === 'all'
                ? true
                : filter === 'review'
                  ? cell?.status === 'REVIEW'
                  : filter === 'approved'
                    ? cell?.status === 'APPROVED' || cell?.status === 'LOCKED'
                    : filter === 'missing'
                      ? cell?.status === 'NONE'
                      : true;
            // Phase A.1 colour palette — every non-final state is visually
            // distinct. Bold weight when there's a real mp4 row; lighter for
            // missing / draft.
            // q4a — per-shot live overlay: if a designer/video-artist job is
            // RUNNING for THIS shot, it recolours + pulses (live wins).
            const liveWork = liveWorkByShot?.get(t.shot.shot_id);
            // D7 — settled trail for shots done but not currently running.
            const completedWork = completedWorkByShot?.get(t.shot.shot_id);
            const palette = cellPalette(cell?.status, cell?.kind, liveWork, completedWork);
            // TD-43.C: versions of THIS shot — popover lists each.
            const versions = vidShotsByShotId.get(t.shot.shot_id) ?? [];
            const showPopover = openCellIdx === i;
            // 2026-06-24 — edge-aware popover anchor. Centering (`left-1/2
            // -translate-x-1/2`) overflows the content-frame's left/right edge
            // for the first/last cells, and the frame's `overflow-y-auto`
            // (which forces overflow-x:auto) CLIPS the overflowing half — so the
            // SH01 popover's version rows + approve ✓ were cut off. Anchor the
            // popover inward at the extremes so it always stays inside the strip.
            const popoverAnchor =
              leftPct < 25
                ? 'left-0'
                : leftPct > 75
                  ? 'right-0'
                  : 'left-1/2 -translate-x-1/2';
            // 2026-06-24 — "this shot HAS a reference image" signal, on a channel
            // orthogonal to the number colour (which carries video/live status):
            // a faint --asset-image (theme) background tint when a ref exists at
            // all, a more saturated one once a ref is APPROVED. Empty cells stay
            // clear, so the Director can scan which shots have art at a glance.
            const cellRefs = imgRefsByShotId.get(t.shot.shot_id) ?? [];
            // Ref-plan rows for this shot — keyed by the unique SHxx token so a
            // ref_plan saved with the short "SH16" shot_id still matches.
            const shotToken = (t.shot.shot_id.match(/sh\d+/i)?.[0] ?? t.shot.shot_id).toUpperCase();
            const refPlanRows = refPlansByShotId?.get(shotToken) ?? [];
            const shotPlanRows = shotPlansByShotId?.get(t.shot.shot_id) ?? [];
            // Critic lines (2026-07-05) — ref critic keyed by SHxx token (aligned
            // with ref plan), video critic by metadata.shot_id (aligned with shot
            // plan). Both may be empty (legacy / critic not run yet).
            const refCriticRows = refCriticsByShotId?.get(shotToken) ?? [];
            const shotCriticRows = shotCriticsByShotId?.get(t.shot.shot_id) ?? [];
            const hasApprovedRef = cellRefs.some(
              (r) => r.status === 'APPROVED' || r.status === 'LOCKED',
            );
            const refTint = hasApprovedRef
              ? 'color-mix(in oklab, var(--asset-image) 22%, transparent)'
              : cellRefs.length > 0
                ? 'color-mix(in oklab, var(--asset-image) 9%, transparent)'
                : 'transparent';
            return (
              <div
                key={t.shot.shot_id}
                className="absolute top-0 h-full"
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  // 2026-06-06 — excluded cells (effective ≤ 0.5s, skipped by
                  // EXEC-STITCH) are dimmed AND get a strikethrough so Director
                  // sees they won't appear in the final cut, but the cell stays
                  // clickable and the numbering is stable.
                  opacity: t.excluded ? 0.35 : cellMatchesFilter ? 1 : 0.25,
                  textDecoration: t.excluded ? 'line-through' : undefined,
                }}
                title={t.excluded ? `${t.shot.shot_id} — excluded from final cut (≤0.5s)` : undefined}
              >
                <button
                  // 2026-06-06 — seek in PLAYBACK coords.
                  // 2026-07-02 — also toggles this cell's kebab (click, not hover).
                  // 2026-07-18 — do NOT seek for an excluded cell. It shares its
                  // playStart with the next playable shot, so seeking moved the
                  // playhead (and with it the whole "current shot" context) onto
                  // the NEXT shot: clicking 28 lit up 29 and the −/+ buttons
                  // edited 29's duration. Selection is enough here; there is
                  // nothing to play in an excluded cell anyway.
                  onClick={() => {
                    if (!t.excluded) seekTo(t.playStart);
                    setOpenCellIdx((v) => (v === i ? null : i));
                  }}
                  className="w-full h-full transition-opacity"
                  style={{
                    background: isSelected
                      ? 'color-mix(in oklab, var(--accent-primary) 45%, transparent)'
                      : isCurrent
                        ? 'color-mix(in oklab, var(--accent-primary) 35%, transparent)'
                        : refTint,
                    outline: isSelected ? '1px solid var(--accent-primary)' : undefined,
                    outlineOffset: '-1px',
                    borderRight: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                  }}
                >
                  <div
                    className={`truncate px-0.5 leading-[44px] tabular-nums text-center${palette.pulse ? ' cell-stage-pulse' : ''}`}
                    style={{
                      color: palette.color,
                      // Object dimension (Director 2026-07-02): References = thin,
                      // Video = bold — same colours, so weight tells you WHICH
                      // object at a glance. Colour still carries role/status.
                      fontWeight:
                        cell?.kind === 'video-canonical' || cell?.kind === 'video-review'
                          ? 700
                          : 400,
                      // Scale the number DOWN as the shot count grows — at ~38
                      // shots the old fixed 18px was unreadable (cells too narrow).
                      fontSize: `${Math.max(7, Math.min(16, Math.round(400 / Math.max(1, times.length))))}px`,
                      textShadow: palette.glow,
                      // Drive the breathe glow with the live stage colour.
                      ...(palette.pulse
                        ? { ['--stage-glow' as string]: palette.color }
                        : {}),
                    }}
                  >
                    {i + 1}
                  </div>
                </button>
                {/* TD-43.C: hover-popover with version picker + inline approve.
                    Renders only when this cell is hovered AND has ≥1 version.
                    Falls back to a simple tooltip when no versions yet.
                    Bridge fix 2026-05-24: top-0 (no gap) so cursor moves
                    from cell to popover without crossing the wrapper boundary —
                    mouseLeave used to fire on the 8px gap and hide popover. */}
                {showPopover && (
                  <div
                    className={`absolute z-50 ${popoverAnchor} top-0 -translate-y-full whitespace-nowrap rounded-md text-[11px]`}
                    style={{
                      background: 'var(--panel-glass-strong-bg, rgba(20,20,20,0.95))',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-glass)',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
                      backdropFilter: 'blur(6px)',
                      minWidth: '200px',
                      padding: versions.length > 0 ? '6px' : '4px 8px',
                    }}
                    role="dialog"
                  >
                    <div className="px-1 pb-1 font-mono opacity-70 text-[10px]">
                      {t.shot.shot_id} · {t.duration.toFixed(1)}s
                    </div>
                    {/* Exclude ("button") toggle — the explicit, stage-independent
                        replacement for the ≤0.5s duration hack. Writes
                        episodes.metadata.excluded_shot_ids via the parent, so it
                        works at any stage (incl. synthetic/parallel with no
                        animatic asset). Excluded shots are skipped by stitch AND
                        never generated. */}
                    {onToggleExclusion && (
                      <label
                        className="mx-1 mb-1 flex items-center gap-1.5 px-1 py-0.5 rounded cursor-pointer select-none hover:bg-[color-mix(in_oklab,_white_8%,_transparent)]"
                        onClick={(e) => e.stopPropagation()}
                        title="Exclude this shot from the final cut (a 'button' shot). Works at any stage; no video needed. Excluded shots are not generated and not stitched."
                      >
                        <input
                          type="checkbox"
                          checked={excludedShotIds?.has(t.shot.shot_id) ?? false}
                          onChange={(e) => {
                            e.stopPropagation();
                            onToggleExclusion(t.shot.shot_id, e.target.checked);
                          }}
                          className="accent-[var(--accent-danger,#ef4444)]"
                        />
                        <span className="text-[10px] text-text-secondary">
                          Exclude from final cut{' '}
                          <span className="opacity-50">(button)</span>
                        </span>
                      </label>
                    )}
                    {/* ── Two fields (2026-07-05, Director revision after live
                        review): IMAGE and VIDEO, each with its OWN designer →
                        critic → artifact sub-chain. Divider ONLY between the two
                        fields (Image first → no top border; Video → border-t).
                        Per-line "generating…" badge is object-aware (Image lights
                        for reference work, Video for animate). ── */}
                    {/* IMAGE field */}
                    <div className="px-1 pt-0.5 pb-1">
                      <div
                        className="px-1 py-0.5 mb-1 rounded text-[9px] font-semibold uppercase tracking-[0.12em]"
                        style={{
                          color: 'var(--asset-image)',
                          background: 'color-mix(in oklab, var(--asset-image) 12%, transparent)',
                        }}
                      >
                        Image
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono opacity-40 text-[9px] uppercase tracking-wider">plan</span>
                        {partitionBadge(liveWork, 'image', 'designer')}
                      </div>
                      {refPlanRows.length > 0 ? (
                        <div className="flex flex-col gap-0.5 mb-1">
                          {refPlanRows.map((p) =>
                            versionRow({
                              id: p.id,
                              version: p.version,
                              status: p.status,
                              paletteKind: 'plan',
                              onOpen: () => onOpenAsset?.(p.id),
                            }),
                          )}
                        </div>
                      ) : (
                        <div className="font-mono opacity-30 text-[10px] px-1 mb-1">—</div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono opacity-40 text-[9px] uppercase tracking-wider">critic</span>
                        {partitionBadge(liveWork, 'image', 'critic')}
                      </div>
                      {refCriticRows.length > 0 ? (
                        <div className="flex flex-col gap-0.5 mb-1">
                          {refCriticRows.map((c) =>
                            versionRow({
                              id: c.id,
                              version: c.version,
                              status: c.status,
                              verdict: c.verdict ?? null,
                              paletteKind: 'plan',
                              onOpen: () => onOpenAsset?.(c.id),
                            }),
                          )}
                        </div>
                      ) : (
                        <div className="font-mono opacity-30 text-[10px] px-1 mb-1">—</div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono opacity-40 text-[9px] uppercase tracking-wider">image</span>
                        {partitionBadge(liveWork, 'image', 'artist')}
                      </div>
                      {cellRefs.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {cellRefs.map((r) =>
                            versionRow({
                              id: r.id,
                              version: r.version,
                              status: r.status,
                              onScreen: cell?.kind === 'image' && r.id === cell?.asset_id,
                              paletteKind: 'image',
                              onOpen: () => onOpenAsset?.(r.id),
                            }),
                          )}
                        </div>
                      ) : (
                        <div className="font-mono opacity-30 text-[10px] px-1">—</div>
                      )}
                      {onGenerateReference && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (generatingRefShotId !== t.shot.shot_id) {
                              onGenerateReference(t.shot.shot_id);
                            }
                          }}
                          disabled={generatingRefShotId === t.shot.shot_id}
                          className="mt-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-colors disabled:opacity-50"
                          style={{
                            background: 'color-mix(in oklab, var(--asset-image) 14%, transparent)',
                            color: 'var(--asset-image)',
                            borderColor: 'color-mix(in oklab, var(--asset-image) 35%, transparent)',
                          }}
                          title="Reference flow for this shot: Designer → critic → artist"
                        >
                          {generatingRefShotId === t.shot.shot_id
                            ? 'Starting…'
                            : cellRefs.length > 0
                              ? '🎨 Regenerate reference'
                              : '🎨 Generate reference'}
                        </button>
                      )}
                      {onVisualCheck && cellRefs.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onVisualCheck(t.shot.shot_id, 'ref');
                          }}
                          className="mt-1 ml-1 px-2 py-0.5 rounded text-[10px] font-medium border border-glass text-text-secondary hover:text-text-primary transition-colors"
                          title="Advisory Visual Critic — check this rendered REF against the storyboard + style. Logs a verdict; never changes status."
                        >
                          👁 Check ref
                        </button>
                      )}
                    </div>
                    {/* VIDEO field — divider above (only between the two fields). */}
                    <div className="px-1 pt-1 pb-1 border-t border-[var(--border-glass)]">
                      <div
                        className="px-1 py-0.5 mb-1 rounded text-[9px] font-semibold uppercase tracking-[0.12em]"
                        style={{
                          color: 'var(--accent-primary)',
                          background: 'color-mix(in oklab, var(--accent-primary) 12%, transparent)',
                        }}
                      >
                        Video
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono opacity-40 text-[9px] uppercase tracking-wider">plan</span>
                        {partitionBadge(liveWork, 'video', 'designer')}
                      </div>
                      {shotPlanRows.length > 0 ? (
                        <div className="flex flex-col gap-0.5 mb-1">
                          {shotPlanRows.map((p) =>
                            versionRow({
                              id: p.id,
                              version: p.version,
                              status: p.status,
                              paletteKind: 'plan',
                              onOpen: () => onOpenAsset?.(p.id),
                            }),
                          )}
                        </div>
                      ) : (
                        <div className="font-mono opacity-30 text-[10px] px-1 mb-1">—</div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono opacity-40 text-[9px] uppercase tracking-wider">critic</span>
                        {partitionBadge(liveWork, 'video', 'critic')}
                      </div>
                      {shotCriticRows.length > 0 ? (
                        <div className="flex flex-col gap-0.5 mb-1">
                          {shotCriticRows.map((c) =>
                            versionRow({
                              id: c.id,
                              version: c.version,
                              status: c.status,
                              verdict: c.verdict ?? null,
                              paletteKind: 'plan',
                              onOpen: () => onOpenAsset?.(c.id),
                            }),
                          )}
                        </div>
                      ) : (
                        <div className="font-mono opacity-30 text-[10px] px-1 mb-1">—</div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono opacity-40 text-[9px] uppercase tracking-wider">video</span>
                        {partitionBadge(liveWork, 'video', 'artist')}
                      </div>
                      {versions.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {versions.map((v) =>
                            versionRow({
                              id: v.id,
                              version: v.version,
                              status: v.status,
                              onScreen: v.id === cell?.asset_id,
                              paletteKind: 'video-review',
                              onOpen: () => {
                                if (onCellClick) {
                                  onCellClick({ ...(cell as TimelineCell), asset_id: v.id });
                                }
                              },
                            }),
                          )}
                        </div>
                      ) : (
                        <div className="font-mono opacity-30 text-[10px] px-1">—</div>
                      )}
                      {versions.length === 0 &&
                        onGenerateVideo &&
                        cellRefs.some(
                          (r) => r.status === 'APPROVED' || r.status === 'LOCKED',
                        ) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (generatingVideoShotId !== t.shot.shot_id) {
                                onGenerateVideo(t.shot.shot_id);
                              }
                            }}
                            disabled={generatingVideoShotId === t.shot.shot_id}
                            className="mt-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-colors disabled:opacity-50"
                            style={{
                              background: 'color-mix(in oklab, var(--accent-primary) 14%, transparent)',
                              color: 'var(--accent-primary)',
                              borderColor: 'color-mix(in oklab, var(--accent-primary) 35%, transparent)',
                            }}
                            title="Start the video flow for this shot: Designer → critic → generator"
                          >
                            {generatingVideoShotId === t.shot.shot_id
                              ? 'Starting…'
                              : '🎬 Generate video'}
                          </button>
                        )}
                      {onVisualCheck && versions.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onVisualCheck(t.shot.shot_id, 'video');
                          }}
                          className="mt-1 ml-1 px-2 py-0.5 rounded text-[10px] font-medium border border-glass text-text-secondary hover:text-text-primary transition-colors"
                          title="Advisory Visual Critic — check this rendered VIDEO (limbs, readability, matches storyboard). Logs a verdict; never changes status."
                        >
                          👁 Check video
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {/* Cursor — positioned on the visual strip. currentT is in PLAYBACK
              coords (excluded shots consume 0 time); convert to visual coords
              by finding the current shot via playStart and interpolating its
              cumStart + offset-within-shot. Without this conversion the
              cursor would slide too fast over excluded cells. */}
          <div
            className="absolute top-0 h-full pointer-events-none"
            style={{
              left: (() => {
                if (visualSpan <= 0) return '0%';
                const idx = computeIndex(currentT);
                const cur = times[idx];
                if (!cur) return '0%';
                const inShot = Math.max(0, currentT - cur.playStart);
                const visualX = cur.cumStart + Math.min(inShot, cur.duration);
                return `${(visualX / visualSpan) * 100}%`;
              })(),
              width: 2,
              background: 'var(--accent-primary)',
              boxShadow: '0 0 8px var(--accent-primary)',
            }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {isPlaying ? (
          <Button variant="primary" size="sm" onClick={handlePause}>
            <Pause size={13} /> Pause
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={handlePlay}>
            <Play size={13} /> Play
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={handleStop} disabled={!isPlaying}>
          <Square size={13} /> Stop
        </Button>
        <Button variant="ghost" size="sm" onClick={handleReset}>
          <RotateCcw size={13} /> Reset
        </Button>
        {/* "Start Video" latch (2026-07-09): opens the video stream for the whole
            episode — every APPROVED reference (already-approved AND future) flows
            to video from here. Shown only while waiting; parent stops passing
            onStartVideo once the stream is open. */}
        {onStartVideo && (
          <Button
            variant="primary"
            size="sm"
            onClick={onStartVideo}
            disabled={startingVideo}
            title="Разрешить генерацию видео по одобренным рефам — текущим и будущим"
          >
            {startingVideo ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Clapperboard size={13} />
            )}{' '}
            Старт видео
          </Button>
        )}
        {/* Video Pilot Pass fan-out (2026-07-23): Старт видео fires only the
            2 pilot shots; the rest wait in video_fanout_pending until the
            Director approves the direction and presses this. */}
        {onVideoFanout && (videoFanoutCount ?? 0) > 0 && (
          <Button
            variant="primary"
            size="sm"
            onClick={onVideoFanout}
            disabled={fanningOutVideo}
            title="Пилоты отсмотрены — запустить остальные шоты в видео-поток"
          >
            {fanningOutVideo ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Clapperboard size={13} />
            )}{' '}
            Video fan out ({videoFanoutCount})
          </Button>
        )}
        {/* Inline shot-edit cluster (Director 2026-07-25): the old standalone
            "Editing selected shot" block folded onto the transport row — shot id
            + cut start (head/inpoint) ∓ + cut end (tail/outpoint) ∓ + the net
            duration field, all compact. Acts on the SELECTED cell, else the
            playhead shot (editShot = openCellIdx ?? currentIndex). */}
        {(!synthetic || onMaterialize) && editShot && (
          <div className="flex items-center gap-1 flex-wrap pl-2 ml-1 border-l border-glass">
            <span
              className="font-mono text-[11px] text-text-secondary"
              title={editShot.shot_role ? `${editShot.shot_id} · ${editShot.shot_role}` : editShot.shot_id}
            >
              {editShot.shot_id.match(/sh\d+/i)?.[0]?.toUpperCase() ?? editShot.shot_id}
            </span>
            <span
              className="text-[9px] uppercase tracking-wider text-text-muted ml-1"
              title="Trim seconds off the START of the shot (ffmpeg inpoint)"
            >
              cut start
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setTrimStart(
                  editShot.shot_id,
                  (overrides[editShot.shot_id]?.trim_start_seconds ?? 0) - SHOT_STEP,
                )
              }
              disabled={(overrides[editShot.shot_id]?.trim_start_seconds ?? 0) <= 0}
            >
              −0.5s
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setTrimStart(
                  editShot.shot_id,
                  (overrides[editShot.shot_id]?.trim_start_seconds ?? 0) + SHOT_STEP,
                )
              }
            >
              +0.5s
            </Button>
            <span
              className="text-[9px] uppercase tracking-wider text-text-muted ml-1"
              title="Trim seconds off the END of the shot (ffmpeg outpoint)"
            >
              cut end
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDuration(editShot.shot_id, editTailDuration - SHOT_STEP)}
              disabled={editTailDuration <= MIN_SHOT_S}
            >
              −0.5s
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDuration(editShot.shot_id, editTailDuration + SHOT_STEP)}
              disabled={editTailDuration >= MAX_SHOT_S}
            >
              +0.5s
            </Button>
            <span
              className="text-[9px] uppercase tracking-wider text-text-muted ml-1"
              title="Net length that plays in the final cut (after cut start + cut end)"
            >
              duration
            </span>
            <input
              key={`${editShot.shot_id}-dur-${editNetDuration}`}
              type="number"
              min={MIN_SHOT_S}
              max={MAX_SHOT_S}
              step={0.1}
              defaultValue={editNetDuration.toFixed(1)}
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v > 0 && Math.abs(v - editNetDuration) > 0.01) {
                  setDuration(editShot.shot_id, v);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              className="w-14 px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-glass text-xs text-text-primary text-right font-mono focus:outline-none focus:border-[var(--accent-primary)]"
            />
            <span className="text-[10px] text-text-muted">s</span>
            {editNetDuration <= MIN_SHOT_S && (
              <span className="text-[10px] font-medium" style={{ color: 'var(--accent-warning)' }}>
                excluded
              </span>
            )}
          </div>
        )}
        <div className="flex-1" />
        {/* 2026-07-18 — the "Save timing" button is gone; timing autosaves 3s
            after the last edit. What remains is a passive status chip, plus a
            Retry button that appears ONLY when a save actually failed (the one
            case where the Director has something to act on).
            Still gated on (!synthetic || onMaterialize): with no onMaterialize
            wired there is nowhere to persist, so we show nothing. */}
        {(!synthetic || onMaterialize) && (
          error ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void saveTimingNow({ force: true })}
              disabled={savingTiming}
              title={error}
            >
              {savingTiming ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}{' '}
              Повторить
            </Button>
          ) : (
            <span
              className="text-[11px] text-text-muted inline-flex items-center gap-1.5"
              title="Тайминги сохраняются автоматически через 3 секунды после правки"
            >
              {savingTiming ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Сохранение…
                </>
              ) : timingDirty ? (
                'Черновик'
              ) : savedAt ? (
                `Сохранено ${savedAt.toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              ) : null}
            </span>
          )
        )}
      </div>

      {/* Inline trim editor folded onto the transport row above (Director
          2026-07-25) — shot id + cut start / cut end / duration now sit on the
          same line as Play / Stop / Reset. The old standalone block was removed. */}

      {/* Error banner */}
      {error && (
        <div
          className="rounded-md p-2 text-xs"
          style={{
            background: 'color-mix(in oklab, var(--accent-danger) 10%, transparent)',
            border: '1px solid color-mix(in oklab, var(--accent-danger) 35%, transparent)',
            color: 'var(--accent-danger)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
});
AnimaticPlayer.displayName = 'AnimaticPlayer';
