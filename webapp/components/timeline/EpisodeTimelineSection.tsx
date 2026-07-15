// ──────────────────────────────────────────────────────────────────────────────
// components/timeline/EpisodeTimelineSection.tsx
//
// EpisodeTimeline Phase A entry point — wraps the AnimaticPlayer in hybrid
// mode for the episode page. Fetches the latest approved animatic v1 contract
// + every VID-shot asset for the episode, then renders the player with both
// inputs so cells render either real mp4 (canonical / REVIEW) or animatic
// image (fallback) per Director's directive 2026-05-06 #1 + #2.
//
// This is the unified review surface that progressively evolves as VGEN /
// EXEC-MGEN / EXEC-STITCH outputs land. Cells are shot-centric (#1) and the
// resolver picks LATEST per shot_id (#6 fast iteration).
//
// Phase A polish (2026-05-06):
//   - Filter chips (All / REVIEW / APPROVED / Missing)
//   - Bulk actions toolbar (Approve all REVIEW)
//   - Drawer prev/next nav (chevron buttons + arrow keys) so Director can
//     review every cell without closing the drawer between shots.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { ChevronDown, ChevronUp, Film, CheckCircle2, Loader2 } from 'lucide-react';
import { fetcher } from '@/lib/swr';
import {
  AnimaticPlayer,
  type AnimaticPlayerHandle,
} from '@/components/animatic/AnimaticPlayer';
import {
  isAnimaticV1,
  extractShotsFromStoryboard,
  newAnimaticContract,
  newestApprovedMusic,
  excludedShotIdsFromEpisodeMeta,
  type AnimaticContract,
  type AnimaticShot,
} from '@/lib/api/animatic-shotlist';
import { readPipelineMode } from '@/lib/api/pipeline-mode';
import {
  resolveTimelineCells,
  countCellsByStatus,
  type VidShotAssetRow,
  type ImgRefAssetRow,
  type TimelineCell,
  type CellStatusPill,
} from '@/lib/api/timeline-cell-resolver';
import { PreviewDrawer } from '@/components/preview/PreviewDrawer';
import {
  EpisodeAssetDrawer,
  type EpisodeAsset,
} from '@/components/assets/EpisodeAssetDrawer';
import { StitchStatusPill } from '@/components/timeline/StitchStatusPill';
import {
  activeWorkByShot,
  completedWorkByShot,
  workPhaseForAgent,
  type ShotWork,
} from '@/lib/api/pipeline-stages';

interface AssetRow {
  id: string;
  file_type: string;
  status: string;
  metadata: unknown;
  drive_path: string | null;
  staging_path: string | null;
  drive_web_view_url: string | null;
  filename: string;
  version: number | null;
  created_at: string;
  /** Storyboard/markdown body — present for STB-* rows, used to synth a
   *  storyboard-derived skeleton contract when no animatic exists yet. */
  content?: string | null;
  // Extra columns present at runtime (/api/episodes select('*')) that the rich
  // EpisodeAssetDrawer needs when a reference cell is opened (Phase 2).
  description?: string | null;
  drive_file_id?: string | null;
  episode_id?: string | null;
  series_id?: string | null;
}

/** Map a timeline asset row to the EpisodeAssetDrawer's EpisodeAsset shape.
 *  All fields exist at runtime (select('*')); the timeline's AssetRow type is a
 *  documented subset, so we coerce the nullable-optional fields explicitly. */
function toEpisodeAsset(a: AssetRow): EpisodeAsset {
  return {
    id: a.id,
    filename: a.filename,
    file_type: a.file_type,
    status: a.status,
    version: a.version,
    description: a.description ?? null,
    content: a.content ?? null,
    staging_path: a.staging_path,
    drive_path: a.drive_path,
    drive_web_view_url: a.drive_web_view_url,
    drive_file_id: a.drive_file_id ?? null,
    episode_id: a.episode_id ?? null,
    series_id: a.series_id ?? null,
    metadata: (a.metadata ?? null) as EpisodeAsset['metadata'],
  };
}

/** Reference-family assets open the rich drawer; everything else (video, Plan
 *  markdown, final cut) opens the light PreviewDrawer. */
function isReferenceAsset(fileType: string): boolean {
  return fileType.startsWith('IMG-episode_ref') || fileType.startsWith('IMG-anchor');
}

/** Fallback per-shot duration when the storyboard omits one (mirrors
 *  animatic-shotlist FALLBACK_DURATION_S, which is module-private there). */
const SKELETON_FALLBACK_DURATION_S = 2.5;

interface JobRow {
  id: string;
  agent_id: string;
  status: string;
  /** Full Inngest event payload; per-shot jobs carry `shotId` here. */
  input_snapshot: unknown;
}

interface EpisodeResponse {
  data: {
    episode: { id: string; series_id?: string | null; metadata?: unknown };
    assets: AssetRow[];
    jobs: JobRow[];
  };
}

export interface EpisodeTimelineSectionProps {
  episodeId: string;
  /**
   * Whether the section starts collapsed. Default false (expanded). When the
   * episode has no animatic yet, the section auto-hides.
   */
  defaultCollapsed?: boolean;
}

type FilterKey = 'all' | 'review' | 'approved' | 'missing';

export function EpisodeTimelineSection({
  episodeId,
  defaultCollapsed = false,
}: EpisodeTimelineSectionProps) {
  const { data, mutate } = useSWR<EpisodeResponse>(
    `/api/episodes/${episodeId}`,
    fetcher,
    {
      // q4a — poll faster while a per-shot designer / video-artist job is live
      // so the cell pulse stays responsive; fall back to a short idle cadence.
      // 2026-06-26 (Director): idle 30s → 8s so a freshly-started job is noticed
      // (and the cell starts pulsing) within ~8s instead of up to 30s — the gap
      // that made "Polina started X but the timeline shows nothing" unnerving.
      refreshInterval: (latest) => {
        const jobs = latest?.data.jobs ?? [];
        const live = jobs.some(
          (j) =>
            (j.status === 'RUNNING' || j.status === 'QUEUED') &&
            workPhaseForAgent(j.agent_id) !== null,
        );
        return live ? 4_000 : 8_000;
      },
    },
  );

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  // S3 (kebab, 2026-07-05) — open the drawer 'wide' for VID-shot so the Director
  // lands on the re-video provider controls; small for everything else.
  const [drawerWide, setDrawerWide] = useState(false);
  // Phase 2 (2026-07-02): reference cells open the RICH EpisodeAssetDrawer
  // (Reject / regen-with-provider / AI verdict / side-by-side variant compare),
  // so the gallery's unique value moves into the timeline. Only one drawer is
  // open at a time — openAssetSmart() clears the other.
  const [refAssetId, setRefAssetId] = useState<string | null>(null);
  // Phase 2b (2026-07-02): shot whose manual "generate video" flow is starting.
  const [generatingVideoShotId, setGeneratingVideoShotId] = useState<string | null>(null);
  const [generatingRefShotId, setGeneratingRefShotId] = useState<string | null>(null);
  const [startingVideo, setStartingVideo] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  // 👁 Visual Critic advisory result banner (per-shot kebab or whole-episode header).
  const [visualCheck, setVisualCheck] = useState<{ busy?: boolean; msg?: string } | null>(null);
  // TD-84 (2026-06-16): the legacy "Generate VGEN" drawer footer (provider
  // dropdown + Fast/Standard) was removed. It fired the plan-less
  // generate-single-shot path, which the C1 gate silently rejected, and it
  // duplicated provider config that now lives in the Shot Plan. Generation
  // is triggered FROM the plan contract page (ShotPlanContract) instead.
  // Imperative ref to AnimaticPlayer — used to seek the playhead after a
  // regenerate completes (Phase A.1 directive — auto-focus the new candidate).
  const playerRef = useRef<AnimaticPlayerHandle | null>(null);

  function handleRegenerated(shotId: string, newAssetId: string): void {
    // Refetch so the cell-resolver picks up the new VID-shot REVIEW row, then
    // move the playhead to that shot. SWR mutate happens via VGENShotPanel's
    // onChanged → AssetPreview's mutate → /api/episodes refetch propagates
    // through SWR cache; we then nudge the timeline to focus.
    void mutate();
    // Phase A.2 Bug A fix (Director report 2026-05-08): swap the drawer to
    // the NEW asset id immediately. Without this, the drawer stays bound to
    // the OLD APPROVED asset and never shows the REVIEW state's Approve/
    // Reject buttons until Director manually closes + reopens via "Open
    // shot →". The old asset row is unchanged (still APPROVED), so its
    // mutate() doesn't surface the new candidate; only re-pointing the
    // drawer at the NEW row reveals the buttons.
    setPreviewAssetId(newAssetId);
    // Slight delay so cell-resolver re-runs with the fresh assets list before
    // the seek lands on it. Without this we'd seek to the same shot but the
    // cell would still resolve to image fallback for one render cycle.
    setTimeout(() => {
      playerRef.current?.seekToShot(shotId);
    }, 200);
  }

  // Pick the freshest APPROVED VID-animatic with the v1 contract. If multiple
  // approved animatics exist (re-trigger history), we use the highest version /
  // newest created_at — that's the canonical timeline source.
  const animaticAsset = useMemo(() => {
    const assets = data?.data.assets ?? [];
    const animatics = assets.filter(
      (a) =>
        a.file_type === 'VID-animatic' &&
        (a.status === 'APPROVED' || a.status === 'LOCKED') &&
        isAnimaticV1(a.metadata),
    );
    if (animatics.length === 0) return null;
    return animatics.reduce((best, a) => {
      const bv = best.version ?? 0;
      const av = a.version ?? 0;
      if (av > bv) return a;
      if (av < bv) return best;
      return a.created_at > best.created_at ? a : best;
    });
  }, [data]);

  // Timeline-as-home (2026-07-02): when no APPROVED/LOCKED VID-animatic exists
  // yet, synthesize a READ-ONLY skeleton contract from the newest APPROVED/
  // LOCKED storyboard so the timeline is reachable the moment refs start
  // landing — no animatic-approval prerequisite (the old chicken-and-egg: to
  // approve refs in the timeline the timeline needed an animatic built from
  // already-approved refs). The resolver fills ref frames + videos LIVE from
  // imgRefAssets/vidShotAssets; the skeleton only supplies the shot skeleton
  // (order + base duration + caption). Returns null when no approved storyboard
  // exists yet → the narrow "storyboard pending" empty state.
  const storyboardContract = useMemo<AnimaticContract | null>(() => {
    if (animaticAsset) return null; // a real animatic wins; skeleton is fallback
    const assets = data?.data.assets ?? [];
    const boards = assets.filter(
      (a) =>
        a.file_type.startsWith('STB') &&
        (a.status === 'APPROVED' || a.status === 'LOCKED') &&
        typeof a.content === 'string' &&
        a.content.length > 0,
    );
    if (boards.length === 0) return null;
    const board = boards.reduce((best, a) => {
      const bv = best.version ?? 0;
      const av = a.version ?? 0;
      if (av > bv) return a;
      if (av < bv) return best;
      return a.created_at > best.created_at ? a : best;
    });
    const shots = extractShotsFromStoryboard(board.content as string);
    if (shots.length === 0) return null;
    const shotList: AnimaticShot[] = shots.map((s) => ({
      shot_id: s.shot_id,
      asset_id: null,
      image_url: null,
      duration_seconds: s.duration_seconds ?? SKELETON_FALLBACK_DURATION_S,
      shot_role: s.shot_role,
      caption: (s.key_beat ?? s.action)?.slice(0, 200) || undefined,
    }));
    // Music injection is applied once, in activeContract below, so it covers BOTH
    // this synthetic skeleton AND a real (often silent auto-EDL) animatic.
    return newAnimaticContract(shotList);
  }, [animaticAsset, data]);

  // The contract that drives the timeline: the real animatic (with overrides/
  // audio) when it exists, else the storyboard-derived skeleton. `isSynthetic`
  // gates the editing surfaces that need a backing asset (Save-timing, trim,
  // approve/reject) — they materialize in Phase 3 on the first real edit.
  // Music fallback (2026-07-13, runtime-confirmed): apply the newest APPROVED
  // AUD-music to WHICHEVER contract drives the timeline whenever it carries no
  // music of its own — never override already-baked audio. Root cause was an
  // episode's auto-materialized SILENT APPROVED animatic (baked_music_url null,
  // audio_tracks []): the timeline took the real-animatic branch and never
  // consulted approved music. (The exact-match file_type drop that also hid
  // 'AUD-music-main' is fixed in newestApprovedMusic.)
  const activeContract: AnimaticContract | null = useMemo(() => {
    const base = animaticAsset
      ? (animaticAsset.metadata as { animatic_v1: AnimaticContract }).animatic_v1
      : storyboardContract;
    if (!base) return null;
    const hasMusic =
      (Array.isArray(base.audio_tracks) && base.audio_tracks.length > 0) || !!base.music_url;
    if (hasMusic) return base;
    const music = newestApprovedMusic(data?.data.assets ?? []);
    return music
      ? { ...base, music_url: music.url, music_filename: music.filename }
      : base;
  }, [animaticAsset, storyboardContract, data]);
  const isSynthetic = !animaticAsset && storyboardContract !== null;

  // Pick the freshest VID-final_cut asset (any status — REVIEW/APPROVED/LOCKED
   // all warrant the "ready" pill). Used by StitchStatusPill so the green
   // chip survives a session reload after STITCH already completed.
  const finalCutAsset = useMemo(() => {
    const assets = data?.data.assets ?? [];
    const finals = assets.filter((a) => a.file_type === 'VID-final_cut');
    if (finals.length === 0) return null;
    return finals.reduce((best, a) => {
      const bv = best.version ?? 0;
      const av = a.version ?? 0;
      if (av > bv) return a;
      if (av < bv) return best;
      return a.created_at > best.created_at ? a : best;
    });
  }, [data]);

  const vidShotAssets: VidShotAssetRow[] = useMemo(() => {
    const assets = data?.data.assets ?? [];
    return assets
      .filter((a) => a.file_type.startsWith('VID-shot'))
      .map((a) => ({
        id: a.id,
        file_type: a.file_type,
        status: a.status,
        version: a.version,
        created_at: a.created_at,
        drive_path: a.drive_path,
        staging_path: a.staging_path,
        drive_web_view_url: a.drive_web_view_url,
        metadata: a.metadata,
      }));
  }, [data]);

  // Image-version parity — IMG-episode_ref rows (all statuses) for the cell
  // kebab's per-shot reference version list + inline approve.
  const imgRefAssets: ImgRefAssetRow[] = useMemo(() => {
    const assets = data?.data.assets ?? [];
    return assets
      .filter((a) => a.file_type.startsWith('IMG-episode_ref'))
      .map((a) => ({
        id: a.id,
        status: a.status,
        version: a.version,
        metadata: a.metadata,
        drive_path: a.drive_path,
        staging_path: a.staging_path,
        drive_web_view_url: a.drive_web_view_url,
      }));
  }, [data]);

  // TD-80 (2026-05-27): group Shot Plan assets by shot_id for the
  // AnimaticPlayer hover popover. Director surfaces «Plan: vNN STATUS»
  // rows with a click that opens the existing PreviewDrawer — so Plans
  // are reviewable without leaving the timeline. shot_id derived from
  // metadata.shot_id (Animator save path) or from the file_type suffix
  // (TD-66 widening: `SPC-shot_plan-<shot_id>`). Newest-version-first
  // ordering matches the existing video version popover.
  const shotPlansByShotId = useMemo(() => {
    const assets = data?.data.assets ?? [];
    const map = new Map<string, Array<{ id: string; version: number | null; status: string }>>();
    for (const a of assets) {
      if (
        a.file_type !== 'SPC-shot_plan' &&
        !a.file_type.startsWith('SPC-shot_plan-')
      ) {
        continue;
      }
      let shotId: string | null = null;
      const meta = a.metadata as { shot_id?: unknown } | null;
      if (typeof meta?.shot_id === 'string') {
        shotId = meta.shot_id;
      } else if (a.file_type.startsWith('SPC-shot_plan-')) {
        // file_type = "SPC-shot_plan-SS-S15-E01-A2-SC09-SH19"
        shotId = a.file_type.slice('SPC-shot_plan-'.length);
      }
      if (!shotId) continue;
      if (!map.has(shotId)) map.set(shotId, []);
      map.get(shotId)!.push({
        id: a.id,
        version: a.version,
        status: a.status,
      });
    }
    for (const arr of map.values()) {
      arr.sort((x, y) => (y.version ?? 0) - (x.version ?? 0));
    }
    return map;
  }, [data]);

  // Ref Plan (SPC-ref_plan) — the EREF Designer's per-shot plan that produced the
  // reference image. Surfaced in the kebab so the plan is reachable from EVERY
  // shot (Director 2026-06-24: SH09 had a ref plan but the kebab showed nothing;
  // when generation jams he must be able to open the plan to see what went wrong).
  // Keyed by the unique SHxx token because ref_plan metadata.shot_id is sometimes
  // the full storyboard id and sometimes the short "SH16" form.
  const refPlansByShotId = useMemo(() => {
    const token = (s: string): string | null => s.match(/sh\d+/i)?.[0]?.toUpperCase() ?? null;
    const assets = data?.data.assets ?? [];
    const map = new Map<string, Array<{ id: string; version: number | null; status: string }>>();
    for (const a of assets) {
      if (!a.file_type.startsWith('SPC-ref_plan')) continue;
      const meta = a.metadata as { shot_id?: unknown } | null;
      const raw = typeof meta?.shot_id === 'string' ? meta.shot_id : a.filename;
      const key = token(raw) ?? token(a.filename);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ id: a.id, version: a.version, status: a.status });
    }
    for (const arr of map.values()) {
      arr.sort((x, y) => (y.version ?? 0) - (x.version ?? 0));
    }
    return map;
  }, [data]);

  // Critic reviews per shot (2026-07-05) — the kebab's Critic partition. Ref
  // critic (REV-ref_plan) keyed by the SHxx token (aligned with refPlansByShotId);
  // video critic (REV-shot_plan) keyed by metadata.shot_id / file_type suffix
  // (aligned with shotPlansByShotId). `verdict` (PASS/REVISE/FAIL) is pulled from
  // the review metadata so the kebab renders a compact verdict chip.
  const refCriticsByShotId = useMemo(() => {
    const token = (s: string): string | null => s.match(/sh\d+/i)?.[0]?.toUpperCase() ?? null;
    const assets = data?.data.assets ?? [];
    const map = new Map<
      string,
      Array<{ id: string; version: number | null; status: string; verdict?: string | null }>
    >();
    for (const a of assets) {
      if (!a.file_type.startsWith('REV-ref_plan')) continue;
      const meta = a.metadata as { shot_id?: unknown; verdict?: unknown } | null;
      const raw = typeof meta?.shot_id === 'string' ? meta.shot_id : a.filename;
      const key = token(raw) ?? token(a.filename);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({
        id: a.id,
        version: a.version,
        status: a.status,
        verdict: typeof meta?.verdict === 'string' ? meta.verdict : null,
      });
    }
    for (const arr of map.values()) arr.sort((x, y) => (y.version ?? 0) - (x.version ?? 0));
    return map;
  }, [data]);

  const shotCriticsByShotId = useMemo(() => {
    const assets = data?.data.assets ?? [];
    const map = new Map<
      string,
      Array<{ id: string; version: number | null; status: string; verdict?: string | null }>
    >();
    for (const a of assets) {
      if (a.file_type !== 'REV-shot_plan' && !a.file_type.startsWith('REV-shot_plan-')) continue;
      const meta = a.metadata as { shot_id?: unknown; verdict?: unknown } | null;
      let shotId: string | null = null;
      if (typeof meta?.shot_id === 'string') shotId = meta.shot_id;
      else if (a.file_type.startsWith('REV-shot_plan-'))
        shotId = a.file_type.slice('REV-shot_plan-'.length);
      if (!shotId) continue;
      if (!map.has(shotId)) map.set(shotId, []);
      map.get(shotId)!.push({
        id: a.id,
        version: a.version,
        status: a.status,
        verdict: typeof meta?.verdict === 'string' ? meta.verdict : null,
      });
    }
    for (const arr of map.values()) arr.sort((x, y) => (y.version ?? 0) - (x.version ?? 0));
    return map;
  }, [data]);

  // Compute resolved cells once, used by both the toolbar (counts/bulk) and
  // the drawer (prev/next nav). The player computes the same internally —
  // duplicating this is cheap (pure function, ~O(shots × vid-shots)).
  const cells: TimelineCell[] = useMemo(() => {
    if (!activeContract) return [];
    return resolveTimelineCells(activeContract, vidShotAssets, imgRefAssets);
  }, [activeContract, vidShotAssets, imgRefAssets]);

  const counts = useMemo(() => countCellsByStatus(cells), [cells]);

  // Unified language — shot_id → live work { object, roles } for shots whose
  // designer / critic / artist job is RUNNING now. Derived from the jobs already
  // in the episode payload (input_snapshot.shotId) — no extra fetch.
  const liveWorkByShot = useMemo<ReadonlyMap<string, ShotWork>>(
    () => activeWorkByShot(data?.data.jobs ?? []),
    [data],
  );

  // D7 persistent trail — shot_id → completed work for shots that finished but
  // have no live job now, so their role glow lingers (settled, non-pulsing)
  // instead of vanishing the instant the job leaves RUNNING. Live wins: shots in
  // liveWorkByShot are excluded upstream by completedWorkByShot.
  const completedWork = useMemo<ReadonlyMap<string, ShotWork>>(
    () => completedWorkByShot(data?.data.jobs ?? []),
    [data],
  );

  const navigableAssetIds = useMemo(() => {
    return cells
      .filter((c) => c.asset_id !== null)
      .map((c) => c.asset_id!) as string[];
  }, [cells]);

  // Phase 2 — id → full asset row, for opening the rich drawer by cell/kebab id.
  const assetById = useMemo(() => {
    const m = new Map<string, AssetRow>();
    for (const a of data?.data.assets ?? []) m.set(a.id, a);
    return m;
  }, [data]);
  const seriesId = data?.data.episode.series_id ?? null;
  // Explicit excluded ("button") shots — the stage-independent SSOT
  // (episodes.metadata.excluded_shot_ids). Drives the cell strikethrough and the
  // kebab toggle state; the same set the stitch gate / Polina's list read.
  const excludedShotIds = useMemo(
    () => excludedShotIdsFromEpisodeMeta(data?.data.episode.metadata),
    [data],
  );

  const navIndex = previewAssetId
    ? navigableAssetIds.indexOf(previewAssetId)
    : -1;
  const onPrev =
    navIndex > 0
      ? () => setPreviewAssetId(navigableAssetIds[navIndex - 1] ?? null)
      : null;
  const onNext =
    navIndex >= 0 && navIndex < navigableAssetIds.length - 1
      ? () => setPreviewAssetId(navigableAssetIds[navIndex + 1] ?? null)
      : null;
  const navLabel =
    navIndex >= 0
      ? `${navIndex + 1} / ${navigableAssetIds.length}`
      : undefined;

  if (!data) {
    return (
      <div className="rounded-lg border border-glass px-3 py-3 text-xs text-text-muted">
        Loading timeline…
      </div>
    );
  }

  if (!activeContract) {
    // Timeline-as-home (2026-07-02): the only remaining empty state is "no
    // approved storyboard yet" — the storyboard is the shot skeleton the
    // timeline is built from. Once it's approved, the timeline appears
    // immediately (skeleton contract) and references/videos fill in live; no
    // animatic-approval step is required.
    return (
      <div
        className="rounded-lg border border-glass px-3 py-3"
        style={{
          background: 'color-mix(in oklab, var(--accent-primary) 3%, var(--bg-elevated))',
        }}
      >
        <div className="flex items-center gap-2">
          <Film size={14} className="text-text-muted" />
          <span className="text-sm font-medium text-text-primary">
            Timeline appears once the storyboard is approved
          </span>
        </div>
        <p className="mt-1 text-[11px] text-text-muted">
          The shot skeleton comes from the approved storyboard. After that, this
          timeline is the home for reviewing references and videos per shot.
        </p>
      </div>
    );
  }

  const contract = activeContract;

  // Phase 2 — route by asset family: reference images open the rich
  // EpisodeAssetDrawer (Reject / regen-with-provider / AI verdict / side-by-side
  // variant compare); everything else (VID-shot, Plan/ref-plan markdown, final
  // cut) opens the light PreviewDrawer. Only one drawer open at a time.
  function openAssetSmart(assetId: string): void {
    const asset = assetById.get(assetId);
    if (asset && isReferenceAsset(asset.file_type)) {
      setPreviewAssetId(null);
      setRefAssetId(assetId);
    } else {
      setRefAssetId(null);
      setDrawerWide(asset?.file_type.startsWith('VID-shot') ?? false);
      setPreviewAssetId(assetId);
    }
  }

  function handleCellClick(cell: TimelineCell): void {
    // Open whatever the cell resolves to (VID-shot, EREF image fallback, …).
    // Generation of a missing shot is no longer a drawer-footer action — it
    // lives on the Shot Plan contract page (TD-84).
    if (cell.asset_id) openAssetSmart(cell.asset_id);
  }

  const refAsset = refAssetId ? assetById.get(refAssetId) ?? null : null;

  // Phase 2b — manual "generate video" for an eligible shot (approved ref, no
  // VID-shot yet). Plan-aware (Director 2026-07-02): if the shot ALREADY has an
  // APPROVED shot-plan, go straight to the render (EXEC-VGEN single-shot from
  // that plan — with the route's q21 readiness preflight); only run the Video
  // Designer when no plan exists yet. Previously it always re-ran the Designer,
  // superseding an approved plan and looping the shot back a step.
  async function handleGenerateVideo(shotId: string): Promise<void> {
    setGeneratingVideoShotId(shotId);
    try {
      const token = shotId.match(/sh\d+/i)?.[0]?.toUpperCase() ?? null;
      const plansForShot = token
        ? (data?.data.assets ?? []).filter(
            (a) =>
              a.file_type.startsWith('SPC-shot_plan') &&
              `${a.filename} ${a.file_type}`.toUpperCase().includes(token),
          )
        : [];
      const approvedPlan = plansForShot.find(
        (a) => a.status === 'APPROVED' || a.status === 'LOCKED',
      );
      // Ask 2 (backlog_kebab): a plan EXISTS but isn't approved yet
      // (REVIEW/REVISION/DRAFT). Do NOT re-fire the Designer — that authors a
      // fresh plan and supersedes the pending one, looping the shot back a step
      // (the live SH05 spend bug). Surface it and open the plan so the presser
      // approves first; the next Generate press then renders. Only a shot with
      // NO plan at all falls through to the Designer.
      if (!approvedPlan && plansForShot.length > 0) {
        const pendingPlan = plansForShot
          .slice()
          .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0]!;
        setBulkError(
          `Shot ${token ?? shotId} has a video plan in ${pendingPlan.status} — approve it first, then Generate renders the video (re-planning would discard it).`,
        );
        setPreviewAssetId(pendingPlan.id);
        return;
      }
      const body = approvedPlan
        ? {
            agentCode: 'EXEC-VGEN',
            reason: 'Director — render video from approved plan (timeline)',
            payload: { shotId, planAssetId: approvedPlan.id },
          }
        : {
            agentCode: 'EXEC-VANIM',
            reason: 'Director — plan + generate video for this shot (timeline)',
            payload: { shotId },
          };
      const res = await fetch(`/api/episodes/${episodeId}/trigger`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Generate video failed');
      }
      void mutate();
    } catch (e) {
      setBulkError((e as Error).message);
    } finally {
      setGeneratingVideoShotId(null);
    }
  }

  // S2 (kebab, 2026-07-05) — manual "generate / regenerate reference" for a shot,
  // mirroring handleGenerateVideo's plan-aware 3-way:
  //   • APPROVED ref plan  → render the image from it (Reference Artist).
  //   • pending ref plan   → DON'T re-author (would discard it) — open it to approve.
  //   • no ref plan yet    → author one (EXEC-EREF-DESIGNER; auto-fires the critic).
  async function handleGenerateReference(shotId: string): Promise<void> {
    setGeneratingRefShotId(shotId);
    try {
      const token = shotId.match(/sh\d+/i)?.[0]?.toUpperCase() ?? null;
      const plansForShot = token
        ? (data?.data.assets ?? []).filter(
            (a) =>
              a.file_type.startsWith('SPC-ref_plan') &&
              `${a.filename} ${a.file_type}`.toUpperCase().includes(token),
          )
        : [];
      const approvedPlan = plansForShot.find(
        (a) => a.status === 'APPROVED' || a.status === 'LOCKED',
      );
      if (!approvedPlan && plansForShot.length > 0) {
        const pendingPlan = plansForShot
          .slice()
          .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0]!;
        setBulkError(
          `Shot ${token ?? shotId} has a reference plan in ${pendingPlan.status} — approve it first, then Generate renders the image (re-planning would discard it).`,
        );
        setPreviewAssetId(pendingPlan.id);
        return;
      }
      const res = approvedPlan
        ? await fetch(`/api/episodes/${episodeId}/regenerate-image-from-plan`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ shotId, planAssetId: approvedPlan.id }),
          })
        : await fetch(`/api/episodes/${episodeId}/trigger`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              agentCode: 'EXEC-EREF-DESIGNER',
              reason: 'Director — author reference plan for this shot (timeline)',
              payload: { shotId },
            }),
          });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Generate reference failed');
      }
      void mutate();
    } catch (e) {
      setBulkError((e as Error).message);
    } finally {
      setGeneratingRefShotId(null);
    }
  }

  // Toggle a shot's "excluded (button)" flag. Targets the EPISODE metadata (not
  // the animatic asset), so it works at any stage incl. synthetic/parallel where
  // no VID-animatic exists. The stitch gate, generation guards, and Polina's list
  // all read the same episodes.metadata.excluded_shot_ids.
  async function handleToggleExclusion(shotId: string, excluded: boolean): Promise<void> {
    try {
      const res = await fetch(`/api/episodes/${episodeId}/shot-exclusion`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shotId, excluded }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Toggle exclusion failed');
      }
      void mutate();
    } catch (e) {
      setBulkError((e as Error).message);
    }
  }

  // 👁 Visual Critic (2026-07-13, advisory): run the vision check on this shot's
  // rendered ref. Logs a verdict to the activity feed AND surfaces a compact banner
  // here. Never changes status. shotId omitted → whole-episode sweep (header button).
  async function handleVisualCheck(shotId?: string, kind?: 'ref' | 'video' | 'both'): Promise<void> {
    const what = kind === 'video' ? ' (видео)' : kind === 'ref' ? ' (реф)' : '';
    setVisualCheck({ busy: true, msg: shotId ? `Проверяю ${shotId}${what}…` : 'Проверяю эпизод…' });
    try {
      const res = await fetch(`/api/episodes/${episodeId}/visual-critic`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...(shotId ? { shotId } : {}), ...(kind ? { kind } : {}) }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        data?: { checked?: number; flagged?: number; results?: Array<{ shotId: string | null; verdict: string | null; summary: string | null }> };
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? 'Visual check failed');
      const d = j.data;
      const first = d?.results?.[0];
      const msg = shotId && first
        ? `👁 ${first.shotId ?? shotId} → ${first.verdict ?? '?'}: ${first.summary ?? ''}`
        : `👁 Проверено ${d?.checked ?? 0}, помечено ${d?.flagged ?? 0}. Детали — в Activity.`;
      setVisualCheck({ msg });
    } catch (e) {
      setVisualCheck({ msg: `👁 Ошибка: ${(e as Error).message}` });
    }
  }

  // Materialize-on-first-edit (E25 2026-07-10): the synthetic (storyboard-derived)
  // timeline has no backing VID-animatic to persist duration edits into. When the
  // Director saves timing for the first time, create the animatic vessel from the
  // approved storyboard skeleton and return its id so Save-timing PATCHes it — no
  // more "approve an empty animatic to unlock the duration panel". Idempotent
  // server-side (returns the existing approved animatic if any).
  async function handleMaterializeAnimatic(): Promise<string | null> {
    try {
      const res = await fetch(`/api/episodes/${episodeId}/animatic/materialize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Materialize animatic failed');
      }
      const j = (await res.json()) as { data?: { asset_id?: string } };
      const newId = j.data?.asset_id ?? null;
      void mutate();
      return newId;
    } catch (e) {
      setBulkError((e as Error).message);
      return null;
    }
  }

  // "Start Video" latch (2026-07-09, animatic-stage demotion): open the video
  // stream for the whole episode. Flips pipeline_mode → parallel + retro-fans-out
  // already-approved references; every new approval flows to video from here.
  async function handleStartVideo(): Promise<void> {
    setStartingVideo(true);
    setBulkError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/start-video`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ directorConfirm: true }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Start video failed');
      }
      void mutate();
    } catch (e) {
      setBulkError((e as Error).message);
    } finally {
      setStartingVideo(false);
    }
  }

  async function bulkApproveReview(): Promise<void> {
    setBulkBusy(true);
    setBulkError(null);
    try {
      const res = await fetch(
        `/api/episodes/${episodeId}/vgen/approve-all-review`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ directorConfirm: true }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Bulk approve failed');
      }
      void mutate();
    } catch (e) {
      setBulkError((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  const reviewCount = counts.REVIEW;

  return (
    <>
      <div
        className="rounded-lg border border-glass overflow-hidden"
        style={{
          background: 'color-mix(in oklab, var(--accent-primary) 4%, var(--bg-elevated))',
          boxShadow: '0 0 0 1px color-mix(in oklab, var(--accent-primary) 18%, transparent)',
        }}
      >
        <div
          className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
          onClick={() => setCollapsed((v) => !v)}
        >
          <Film size={14} className="text-[var(--accent-primary)]" />
          <span className="text-sm font-semibold text-text-primary">Episode timeline</span>
          <span className="text-[11px] text-text-muted">
            · {contract.shot_list.length} shots · {vidShotAssets.length} VID-shot rows
          </span>
          <div
            // Stop the click from toggling collapse when Director clicks the
            // "Final cut ready" pill button.
            onClick={(e) => e.stopPropagation()}
          >
            <StitchStatusPill
              episodeId={episodeId}
              finalCutAssetId={finalCutAsset?.id ?? null}
              onOpen={(assetId) => openAssetSmart(assetId)}
            />
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => void handleVisualCheck()}
              disabled={visualCheck?.busy}
              title="Advisory Visual Critic — check every rendered ref in this episode against the storyboard + style. Logs verdicts to Activity; never changes status."
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-glass text-text-secondary hover:text-text-primary disabled:opacity-40"
            >
              👁 {visualCheck?.busy ? 'Checking…' : 'Visual check'}
            </button>
          </div>
          <div className="flex-1" />
          <span className="text-[11px] text-text-muted">
            {collapsed ? 'Expand' : 'Collapse'}
          </span>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </div>
        {!collapsed && (
          <div className="px-3 pb-3 pt-0 border-t border-glass space-y-2">
            {visualCheck?.msg && (
              <div
                className="flex items-start gap-2 text-[11px] px-2.5 py-1.5 rounded-lg"
                style={{ background: 'color-mix(in oklab, var(--accent-info) 10%, transparent)', color: 'var(--text-primary)' }}
              >
                <span className="flex-1 whitespace-pre-wrap">{visualCheck.msg}</span>
                <button onClick={() => setVisualCheck(null)} className="text-text-muted hover:text-text-primary">✕</button>
              </div>
            )}
            <TimelineToolbar
              counts={counts}
              filter={filter}
              setFilter={setFilter}
              reviewCount={reviewCount}
              bulkBusy={bulkBusy}
              onBulkApprove={bulkApproveReview}
              bulkError={bulkError}
            />
            <AnimaticPlayer
              ref={playerRef}
              assetId={animaticAsset?.id ?? ''}
              contract={contract}
              synthetic={isSynthetic}
              vidShotAssets={vidShotAssets}
              imgRefAssets={imgRefAssets}
              filter={filter}
              onCellClick={handleCellClick}
              onChanged={() => void mutate()}
              // "Start Video" latch — shown only while the episode is still
              // waiting (pipeline_mode !== 'parallel'). Opening the stream flips
              // the mode, so the button disappears on the next refetch.
              onStartVideo={
                readPipelineMode(data?.data.episode?.metadata) !== 'parallel'
                  ? () => void handleStartVideo()
                  : undefined
              }
              startingVideo={startingVideo}
              // Unified language — per-shot live work { object, roles } so the
              // cell number recolours by role (designer/critic/both/artist).
              liveWorkByShot={liveWorkByShot}
              // D7 — settled trail for finished-but-idle shots (persistent glow).
              completedWorkByShot={completedWork}
              // TD-80 (2026-05-27): Plan-row click on popover opens the
              // existing PreviewDrawer via setPreviewAssetId — bypasses the
              // image-fallback path that handleCellClick uses (which would
              // otherwise enable the «Generate VGEN» footer on a Plan view).
              shotPlansByShotId={shotPlansByShotId}
              refPlansByShotId={refPlansByShotId}
              refCriticsByShotId={refCriticsByShotId}
              shotCriticsByShotId={shotCriticsByShotId}
              onOpenAsset={(id) => openAssetSmart(id)}
              onGenerateVideo={(shotId) => void handleGenerateVideo(shotId)}
              generatingVideoShotId={generatingVideoShotId}
              onGenerateReference={(shotId) => void handleGenerateReference(shotId)}
              generatingRefShotId={generatingRefShotId}
              onVisualCheck={(shotId, kind) => void handleVisualCheck(shotId, kind)}
              excludedShotIds={excludedShotIds}
              onToggleExclusion={(shotId, excluded) =>
                void handleToggleExclusion(shotId, excluded)
              }
              // Synthetic mode only: first duration Save materializes the
              // animatic vessel (removes the empty-animatic-approval step). A
              // real animatic already has an assetId, so it doesn't need this.
              onMaterialize={isSynthetic ? handleMaterializeAnimatic : undefined}
            />
          </div>
        )}
      </div>

      <PreviewDrawer
        open={previewAssetId !== null}
        onClose={() => setPreviewAssetId(null)}
        assetId={previewAssetId}
        onPrev={onPrev}
        onNext={onNext}
        navLabel={navLabel}
        onRegenerated={handleRegenerated}
        onAssetChanged={() => void mutate()}
        onPickAsset={(id) => setPreviewAssetId(id)}
        initialSize={drawerWide ? 'wide' : 'small'}
      />

      {/* Phase 2 — rich reference drawer (Reject / regen-with-provider / AI
          verdict / side-by-side variant compare). Opened only for reference
          cells via openAssetSmart; onPickAsset lets CandidatesStrip switch to a
          sibling variant. This is what retires the gallery (Phase 4). */}
      {refAsset && (
        <EpisodeAssetDrawer
          open={true}
          asset={toEpisodeAsset(refAsset)}
          onClose={() => setRefAssetId(null)}
          onBack={() => setRefAssetId(null)}
          onChange={() => void mutate()}
          onPickAsset={(id) => openAssetSmart(id)}
          kindLabel="Episode reference"
          seriesId={seriesId}
        />
      )}
    </>
  );
}

// ── Toolbar (filter chips + bulk actions) ────────────────────────────────────

function TimelineToolbar({
  counts,
  filter,
  setFilter,
  reviewCount,
  bulkBusy,
  onBulkApprove,
  bulkError,
}: {
  counts: Record<CellStatusPill, number>;
  filter: FilterKey;
  setFilter: (f: FilterKey) => void;
  reviewCount: number;
  bulkBusy: boolean;
  onBulkApprove: () => void;
  bulkError: string | null;
}) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const approved = counts.APPROVED + counts.LOCKED;
  const missing = counts.NONE; // placeholder + image fallback both count as "missing VGEN"

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-2">
      <FilterChip
        label="All"
        count={total}
        active={filter === 'all'}
        onClick={() => setFilter('all')}
      />
      <FilterChip
        label="Review"
        count={counts.REVIEW}
        active={filter === 'review'}
        onClick={() => setFilter('review')}
        accent="warn"
      />
      <FilterChip
        label="Approved"
        count={approved}
        active={filter === 'approved'}
        onClick={() => setFilter('approved')}
        accent="ok"
      />
      <FilterChip
        label="Missing"
        count={missing}
        active={filter === 'missing'}
        onClick={() => setFilter('missing')}
        accent="muted"
      />
      <div className="flex-1" />
      {reviewCount > 0 && (
        <button
          onClick={onBulkApprove}
          disabled={bulkBusy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors disabled:opacity-50"
          style={{
            background: bulkBusy
              ? 'color-mix(in oklab, var(--accent-primary) 8%, transparent)'
              : 'color-mix(in oklab, var(--accent-success) 12%, transparent)',
            color: 'var(--accent-success)',
            borderColor: 'color-mix(in oklab, var(--accent-success) 30%, transparent)',
          }}
          title="Approve all VID-shot REVIEW rows for this episode"
        >
          {bulkBusy ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <CheckCircle2 size={11} />
          )}
          {bulkBusy ? 'Approving…' : `Approve all REVIEW (${reviewCount})`}
        </button>
      )}
      {bulkError && (
        <span
          className="text-[11px] px-2 py-1 rounded-md"
          style={{
            background: 'color-mix(in oklab, var(--accent-danger) 10%, transparent)',
            color: 'var(--accent-danger)',
          }}
        >
          {bulkError}
        </span>
      )}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
  accent,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  accent?: 'ok' | 'warn' | 'muted';
}) {
  const accentColor =
    accent === 'ok'
      ? 'var(--accent-success)'
      : accent === 'warn'
        ? 'var(--accent-warning)'
        : accent === 'muted'
          ? 'var(--text-muted)'
          : 'var(--accent-primary)';
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors"
      style={{
        background: active
          ? `color-mix(in oklab, ${accentColor} 16%, transparent)`
          : 'transparent',
        color: active ? accentColor : 'var(--text-secondary)',
        borderColor: active
          ? `color-mix(in oklab, ${accentColor} 40%, transparent)`
          : 'var(--border-glass)',
      }}
      aria-pressed={active}
    >
      <span>{label}</span>
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}
