// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/next-events.ts
// computeNextEvents — the single "what fires next" router for the studio DAG.
//
// TD-87 (2026-06-09): extracted verbatim from
// app/api/assets/[id]/approve/route.ts so BOTH callers share one router:
//   - Modes 1-3 (Director-driven): approve/route.ts calls it on APPROVE.
//   - Mode 4 (AUTOTEST, autonomous): factory.ts calls it after auto-approving
//     an agent's output, replacing the thin per-agent `spec.nextEvent` for
//     forward routing so the Mode-4 chain gets the full rich fan-out (EREF +
//     MGEN, per-shot designer/animator advancement) instead of skipping
//     straight to EXEC-EDIT with no episode references.
//
// Behaviour is byte-for-byte identical to the prior in-route implementation;
// only the file location changed. The route re-imports computeNextEvents +
// SupabaseClientLike from here.
//
// Idempotency: each branch checks whether the target agent already has a
// COMPLETED or RUNNING job for this episode (hasJob). If yes, no new event
// fires — prevents duplicate runs when Director re-approves, HMR retriggers,
// OR the Mode-4 factory dispatches the same milestone twice.
// ──────────────────────────────────────────────────────────────────────────────

import type { requireDirector } from '@/lib/api/auth';
import type { StudioEventName } from '@/lib/inngest/client';
import {
  isShotReferenceV2,
  type ShotReferenceContract,
} from '@/lib/api/shot-reference';
import {
  extractShotsFromStoryboard,
  isAnimaticV1,
  isDeletedShot,
  excludedShotIdsFromEpisodeMeta,
  type AnimaticContract,
} from '@/lib/api/animatic-shotlist';
import { pickPilotVgenShots } from '@/lib/api/vgen-shot-helpers';
import { resolveShotId } from '@/lib/api/shot-identity';
import { setVgenPilotState } from '@/lib/api/vgen-pilot-state';
import { ensureEpisodeAnimaticEDL } from '@/lib/api/ensure-animatic';
import { contractHasMusic } from '@/lib/agents/music';
import {
  designerChainEnabled,
  animatorChainEnabled,
  readabilityGateEnabled,
  stopBeforeErefEnabled,
} from '@/lib/agents/chain-flags';
import { logEvent } from '@/lib/api/events';
import { readPipelineMode, type PipelineMode } from '@/lib/api/pipeline-mode';

export type AssetForChain = {
  id: string;
  filename: string;
  file_type: string;
  episode_id: string | null;
  /** Approval timestamp — used as the "since" floor for idempotency. */
  updated_at?: string | null;
  /** Optional metadata — used to detect v2 EREF contract for chain skip. */
  metadata?: unknown;
  /** Optional content (markdown / JSON body) — read by Day 3.2 Plan branch
   *  to extract `shot_id` from APPROVED SPC-ref_plan assets. */
  content?: string | null;
};

export type SupabaseClientLike = Awaited<ReturnType<typeof requireDirector>>['supabase'];

/**
 * Has the target agent been triggered for this episode SINCE the given moment?
 *
 * `since` is critical: previous pipeline runs (mock pilot, dev retries, prior
 * revisions) leave COMPLETED/FAILED jobs behind. Without a `since` floor, those
 * stale jobs would block every re-trigger — and Director's APPROVE-after-revision
 * would silently produce no fan-out.
 *
 * Pass the asset's `updated_at` (≈ approval moment) as `since`. Jobs started
 * before that don't count: they belonged to earlier upstream versions.
 */
export async function hasJob(
  supabase: SupabaseClientLike,
  episodeId: string,
  agentId: string,
  options?: { since?: string | null; excludeFailed?: boolean },
): Promise<boolean> {
  const excludeFailed = options?.excludeFailed ?? true;
  const since = options?.since;
  let q = supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('episode_id', episodeId)
    .eq('agent_id', agentId)
    .in(
      'status',
      excludeFailed
        ? ['QUEUED', 'RUNNING', 'COMPLETED']
        : ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'],
    );
  // Allow a small grace window (5s) before approval to catch jobs the route
  // itself might have just enqueued in a parallel request — keeps idempotency
  // intact for double-clicks.
  if (since) {
    const sinceMs = new Date(since).getTime() - 5_000;
    q = q.gte('started_at', new Date(sinceMs).toISOString());
  }
  const { count } = await q;
  return (count ?? 0) > 0;
}

/**
 * Parse the LAST fenced ```json block from an asset's markdown content.
 * Local copy (kept tiny + dependency-free) so next-events.ts does not import
 * the heavy episode-references runner just for this. Returns null on
 * absent/malformed content. Used by the REV-ref_plan critic-PASS promotion.
 */
function parseLastJsonBlock(
  content: string | null | undefined,
): Record<string, unknown> | null {
  if (typeof content !== 'string') return null;
  const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
  const last = matches[matches.length - 1]?.[1];
  if (!last) return null;
  try {
    const parsed = JSON.parse(last.trim());
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function countApproved(
  supabase: SupabaseClientLike,
  episodeId: string,
  fileTypePrefix: string,
): Promise<number> {
  const { count } = await supabase
    .from('assets')
    .select('*', { count: 'exact', head: true })
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED')
    .like('file_type', `${fileTypePrefix}%`);
  return count ?? 0;
}

/**
 * Find the latest APPROVED upstream asset of a given file_type prefix for
 * the episode. Used by the auto-chain when a REV-* approval needs to fire
 * the next agent — the agent expects the underlying creative asset's id
 * (storyboard / script / etc.), not the review asset's id.
 *
 * Sprint φ chain bug fix (2026-05-16): REV-world_check approval was firing
 * EREF with `storyboardAssetId = <review asset id>`; runner loaded review
 * content, found no shots, failed «No episode reference assets inserted».
 * Symmetric bug for REV-script_qa → EXEC-SB (storyboarder ignored it via
 * its `findApprovedAsset` lookup, so the bug was latent there).
 */
async function findLatestApprovedAssetId(
  supabase: SupabaseClientLike,
  episodeId: string,
  fileTypePrefix: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('assets')
    .select('id,version,created_at')
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED')
    .like('file_type', `${fileTypePrefix}%`)
    .order('version', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * Existence check: does the episode already have ANY asset of this file-type
 * prefix, regardless of status? Used to guard auto-start triggers that must
 * fire only on a "fresh" (empty) episode and never re-fire once an artifact
 * exists. Idempotency by produced ARTIFACT, not by job — a job can fail or be
 * absent while the artifact is the real state of the stage.
 */
async function episodeHasAnyAsset(
  supabase: SupabaseClientLike,
  episodeId: string,
  fileTypePrefix: string,
): Promise<boolean> {
  const { count } = await supabase
    .from('assets')
    .select('*', { count: 'exact', head: true })
    .eq('episode_id', episodeId)
    .like('file_type', `${fileTypePrefix}%`);
  return (count ?? 0) > 0;
}

/**
 * S-reorder (2026-07-01): read the episode's pipeline mode. Absent/garbage ⇒
 * 'sequential' (the existing behaviour). Read lazily only inside the parallel-
 * relevant branches so the sequential path pays no extra query.
 */
async function readEpisodePipelineMode(
  supabase: SupabaseClientLike,
  episodeId: string,
): Promise<PipelineMode> {
  const { data } = await supabase
    .from('episodes')
    .select('metadata')
    .eq('id', episodeId)
    .maybeSingle();
  return readPipelineMode((data as { metadata?: unknown } | null)?.metadata);
}

/**
 * Per-shot idempotency for the parallel ref→video edge: has this shot already
 * got a Shot Plan? Prevents a re-approved reference from spawning a duplicate
 * Video Designer run.
 */
async function shotHasPlan(
  supabase: SupabaseClientLike,
  episodeId: string,
  shotId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('assets')
    .select('metadata,content')
    .eq('episode_id', episodeId)
    .like('file_type', 'SPC-shot_plan%');
  for (const r of (data ?? []) as Array<{ metadata?: unknown; content?: string | null }>) {
    if (resolveShotId({ metadata: r.metadata, content: r.content }) === shotId) return true;
  }
  return false;
}

/**
 * Set of shot_ids that already have a ref plan (the Reference Designer's own
 * output). One scan → used to filter the pilot→fanout list so the fanout never
 * regenerates a shot the parallel per-shot edge already advanced.
 */
async function shotsWithRefPlan(
  supabase: SupabaseClientLike,
  episodeId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from('assets')
    .select('metadata,content')
    .eq('episode_id', episodeId)
    .like('file_type', 'SPC-ref_plan%');
  const set = new Set<string>();
  for (const r of (data ?? []) as Array<{ metadata?: unknown; content?: string | null }>) {
    const sid = resolveShotId({ metadata: r.metadata, content: r.content });
    if (sid) set.add(sid);
  }
  return set;
}

/**
 * Read the executing Plan's asset id off a produced asset's metadata.
 * Two historical shapes exist: EREF stamps `provenance.plan_asset_id`
 * (IMG-episode_ref), VGEN stamps top-level `plan_asset_id` (VID-shot,
 * exec-vgen.ts metaPatch). Every per-Plan idempotency check below MUST
 * read both — the provenance-only readers were blind to VID-shots
 * (E07 smoke 2026-06-11: SH03 generated twice, +$1.21).
 */
export function planIdFromAssetMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as {
    provenance?: { plan_asset_id?: unknown };
    plan_asset_id?: unknown;
  };
  if (typeof m.provenance?.plan_asset_id === 'string') {
    return m.provenance.plan_asset_id;
  }
  if (typeof m.plan_asset_id === 'string') return m.plan_asset_id;
  return null;
}

/**
 * Per-Plan idempotency: has this Plan already produced an output asset?
 * One shared scan for all branches (was 3 inline copies, each reading only
 * the provenance shape).
 */
async function planAlreadyExecuted(
  supabase: SupabaseClientLike,
  episodeId: string,
  outputFileTypePrefix: 'IMG-episode_ref' | 'VID-shot',
  planAssetId: string,
): Promise<boolean> {
  const { data: rows } = await supabase
    .from('assets')
    .select('metadata')
    .eq('episode_id', episodeId)
    .like('file_type', `${outputFileTypePrefix}%`);
  for (const row of (rows ?? []) as Array<{ metadata?: unknown }>) {
    if (planIdFromAssetMeta(row.metadata) === planAssetId) return true;
  }
  return false;
}

// Asset approval → which Inngest event(s) to fire next.
//
// Single-asset milestones return one event. Multi-asset milestones (storyboard,
// animatic fan-out, publish-ready) require DB queries to verify the gate set
// is complete.
export async function computeNextEvents(
  supabase: SupabaseClientLike,
  asset: AssetForChain,
  directorUserId: string,
): Promise<Array<{ name: StudioEventName; data: Record<string, unknown> }>> {
  if (!asset.episode_id) return [];
  const ep = asset.episode_id;
  const ft = asset.file_type;
  const since = asset.updated_at ?? null;
  const events: Array<{ name: StudioEventName; data: Record<string, unknown> }> = [];

  // Excluded ("button") shots — episodes.metadata.excluded_shot_ids. Fetched at
  // most once, lazily, only when a generation edge or the stitch gate needs it.
  // Slice 3 (2026-07-03): an excluded shot must NOT be generated (skip the
  // per-shot dispatch) and must not gate the final cut.
  let _excludedShotIds: Set<string> | null = null;
  const getExcludedShotIds = async (): Promise<Set<string>> => {
    if (_excludedShotIds) return _excludedShotIds;
    const { data } = await supabase
      .from('episodes')
      .select('metadata')
      .eq('id', ep)
      .maybeSingle();
    _excludedShotIds = excludedShotIdsFromEpisodeMeta(
      (data as { metadata?: unknown } | null)?.metadata,
    );
    return _excludedShotIds;
  };

  // ── Brief APPROVED → Casting gate → Writer (2026-06-23, Director q22a/q30a:
  //    «кастинг ПОСЛЕ брифа, ПЕРЕД writer» — after the brief it's clear which
  //    characters/objects the episode needs).
  //
  //    Casting is TOOL-ONLY: the Director/Polina draft it via castEpisode →
  //    SPC-episode_cast → approve. It has NO Inngest executor, so a fully
  //    autonomous run can't perform it. Therefore:
  //      • AUTOTEST (Mode 4 / replay-pilot — signalled by directorUserId ===
  //        'AUTOTEST', the factory's auto-chain marker): keep the direct
  //        Brief→Writer edge so the headless DAG still completes.
  //      • Director-driven modes (1/2/2.5/3): Brief does NOT fire the Writer;
  //        the Writer fires only once the cast is approved (branch below).
  const isAutotest = directorUserId === 'AUTOTEST';
  if (ft === 'SPC-brief' && isAutotest && !(await hasJob(supabase, ep, 'EXEC-SW', { since }))) {
    events.push({
      name: 'sandystudio/exec-sw/write-script',
      data: { episodeId: ep, briefAssetId: asset.id },
    });
  }

  // ── Brief APPROVED (Director modes) → nudge «cast this episode» (D1/D2, 2026-07-09).
  //    Casting is TOOL-ONLY (no Inngest executor), so a fresh brief otherwise leaves
  //    the DAG silent — nothing tells the Director/Polina the next move is casting,
  //    and the Writer gate deadlocks waiting for an approved cast nobody knew to make.
  //    Reuse the already-wired `decision_requested` type (a MUST-WAKE, first-class in
  //    both event whitelists + the inbox) instead of adding a new node/edge. Fire once
  //    per episode: only while no cast asset exists yet.
  if (
    ft === 'SPC-brief' &&
    !isAutotest &&
    !(await episodeHasAnyAsset(supabase, ep, 'SPC-episode_cast'))
  ) {
    await logEvent(supabase, {
      event_type: 'decision_requested',
      severity: 'info',
      title: 'Бриф одобрен — кастуй эпизод',
      description:
        'Следующий шаг — кастинг: собери каст эпизода (castEpisode → SPC-episode_cast) ' +
        'и утверди его. Writer стартует только после одобрения каста.',
      episode_id: ep,
      asset_id: asset.id,
    });
  }

  // ── Casting APPROVED → EXEC-SW. The gate the Brief no longer skips in
  //    Director modes. Resolve the approved brief id so the Writer's event
  //    payload stays honest. Harmless in AUTOTEST (no SPC-episode_cast there).
  if (ft === 'SPC-episode_cast' && !(await hasJob(supabase, ep, 'EXEC-SW', { since }))) {
    // Guard (2026-06-25, Director): the Writer auto-start fires ONLY for a fresh
    // episode (no script yet). A cast RE-approval on an episode that already has
    // a script must NOT re-run the Writer — a new script version risks a
    // regression cascade (storyboard → refs → video rebuilt), blowing away
    // near-complete downstream work. Live case: E12 cast v02 re-approve spawned
    // redundant SCR v05/v06. Signal is the produced ARTIFACT (script exists),
    // not the job — honest idempotency by output existence.
    if (await episodeHasAnyAsset(supabase, ep, 'SCR-script')) {
      // Suppressed — but never silently: surface a warning into the feed so the
      // Director/Polina see WHY the Writer didn't fire and can re-run manually
      // if the rewrite is intentional. Passive (non-actionable) by design — a
      // deliberate no-op must not wake Polina (avoids the notify spiral).
      await logEvent(supabase, {
        event_type: 'pipeline/writer-autostart-skipped',
        severity: 'warning',
        title: 'Каст переаппрувлен — Writer не перезапущен',
        description:
          'У эпизода уже есть скрипт. Авто-запуск Writer пропущен во избежание ' +
          'регресса downstream. Перезапиши скрипт вручную, если это намеренно.',
        episode_id: ep,
        asset_id: asset.id,
      });
    } else {
      const briefId = await findLatestApprovedAssetId(supabase, ep, 'SPC-brief');
      events.push({
        name: 'sandystudio/exec-sw/write-script',
        data: { episodeId: ep, briefAssetId: briefId },
      });
    }
  }

  // ── Casting APPROVED → EXEC-SB, when the SCRIPT is ALREADY approved
  //    (writer→cast→storyboard order, Director 2026-07-04). Mirror of the
  //    REV-script_qa→EXEC-SB branch below: whichever of {script, cast} is
  //    approved LAST unblocks the Storyboard. hasJob(EXEC-SB) guards single-fire.
  if (
    ft === 'SPC-episode_cast' &&
    (await findLatestApprovedAssetId(supabase, ep, 'REV-script_qa')) &&
    !(await hasJob(supabase, ep, 'EXEC-SB', { since }))
  ) {
    const scrId = await findLatestApprovedAssetId(supabase, ep, 'SCR-script');
    if (scrId) {
      events.push({
        name: 'sandystudio/exec-sb/create-storyboard',
        data: { episodeId: ep, scriptAssetId: scrId },
      });
    }
  }

  // ── Script APPROVED → EXEC-COPY (parallel chain start)
  // Dedup 2026-06-12 (E07 SREV double-fire, jobs 12:38:24/12:38:41): the
  // Script Critic fires ONLY via the factory critic chain (exec-sw
  // spec.nextEvent at Writer completion, all modes — factory.ts isCriticChain
  // since 2026-06-02). The SCR→SREV push that lived here double-fired
  // deterministically in Mode 4: the factory runs computeNextEvents on the
  // auto-APPROVED script BEFORE its own critic-chain event lands a job, so
  // hasJob never saw an SREV job → two SREVs → two storyboards with
  // DIFFERENT shot numbering → mirror deadlock on SH03. Doctrine (4ff5262):
  // critics fire from the critic chain; this router advances EXECUTOR
  // milestones only.
  if (ft === 'SCR-script') {
    if (!(await hasJob(supabase, ep, 'EXEC-COPY', { since }))) {
      events.push({
        name: 'sandystudio/exec-copy/write-metadata',
        data: { episodeId: ep, scriptAssetId: asset.id },
      });
    }
  }

  // ── Script review APPROVED → EXEC-SB
  // Resolve underlying SCR-script asset id — `asset.id` here is the REV
  // review, not the script. EXEC-SB's runner currently looks up upstream
  // assets itself (so it survives without this), but passing the correct id
  // keeps event payloads honest and consistent with the EREF fix below.
  if (ft === 'REV-script_qa' && !(await hasJob(supabase, ep, 'EXEC-SB', { since }))) {
    // EXEC-SB's gate requires ≥1 APPROVED cast ("found 0 cast" crash otherwise).
    // AUTOTEST has no casting stage → keep the direct fire (replay-pilot intact).
    // Director modes (writer→cast→storyboard, Director 2026-07-04): if the cast
    // isn't approved yet, DON'T fire storyboard — the cast-approval branch above
    // fires it once the cast lands. Whichever of {script, cast} is last unblocks SB.
    const castReady =
      isAutotest || (await countApproved(supabase, ep, 'SPC-episode_cast')) >= 1;
    if (castReady) {
      const scrId = await findLatestApprovedAssetId(supabase, ep, 'SCR-script');
      events.push({
        name: 'sandystudio/exec-sb/create-storyboard',
        data: { episodeId: ep, scriptAssetId: scrId ?? asset.id },
      });
    } else {
      await logEvent(supabase, {
        event_type: 'pipeline/storyboard-waiting-cast',
        severity: 'warning',
        title: 'Раскадровка ждёт одобренный каст',
        description:
          'Сценарий одобрен, но одобренного каста ещё нет. Прогони кастинг ' +
          '(castEpisode → approve) — раскадровка запустится сразу после аппрува каста.',
        episode_id: ep,
        asset_id: asset.id,
      });
    }
  }

  // ── Storyboard APPROVED → EXEC-WCHK (Continuity Supervisor) — legacy path,
  //    READABILITY_GATE_ENABLED off only.
  // Backbone v2.5: Bible canon validation BEFORE generating episode refs.
  // Dedup 2026-06-11 (E06 double-fire): when the flag is ON, CREAD fires ONLY
  // via the factory critic chain (exec-sb spec.nextEvent at Storyboarder
  // completion, all modes). The STB→CREAD push that used to live here
  // double-fired deterministically in Mode 4: the factory runs
  // computeNextEvents on the auto-APPROVED storyboard BEFORE sending its own
  // critic-chain event, so hasJob never saw a CREAD job (E06: two identical
  // REVISE verdicts → two parallel re-authors). Doctrine: critics fire from
  // the critic chain; this router advances EXECUTOR milestones only.
  // Flag off → byte-identical legacy WCHK fire (replay-pilot keeps passing).
  if (ft.startsWith('STB-')) {
    const stbCount = await countApproved(supabase, ep, 'STB');
    if (stbCount >= 1 && !readabilityGateEnabled()) {
      if (!(await hasJob(supabase, ep, 'EXEC-WCHK', { since }))) {
        events.push({
          name: 'sandystudio/exec-wchk/check-world',
          data: { episodeId: ep, storyboardAssetIds: [asset.id] },
        });
      }
    }
  }

  // ── Readability review APPROVED → EXEC-SB re-author (AUTOTEST REVISE only).
  //    Dedup 2026-06-11: the PASS→WCHK push moved out of this router — CREAD's
  //    own spec.nextEvent (PASS → exec-wchk/check-world) is a critic chain
  //    firing in ALL modes at CREAD completion, so the push here was the same
  //    Mode-4 deterministic double-fire the STB→CREAD branch had
  //    (computeNextEvents runs before the critic-chain event lands; hasJob
  //    misses). The AUTOTEST REVISE branch stays — it is the ONLY Mode-4
  //    re-author path (exec-sb is not a critic chain, so the thin candidate
  //    never dispatches it).
  //    Phase guard: per-shot eref/vanim REV-readability rows (T1 consolidation)
  //    are closed by applyCriticVerdict inside the runner — routing them here
  //    would re-author the whole storyboard off a single shot-plan verdict.
  if (ft === 'REV-readability' || ft.startsWith('REV-readability')) {
    const metaPhase =
      asset.metadata && typeof asset.metadata === 'object'
        ? (asset.metadata as { phase?: unknown }).phase
        : null;
    const isShotPhase = metaPhase === 'eref' || metaPhase === 'vanim';
    const body = isShotPhase ? null : parseLastJsonBlock(asset.content);
    const verdict = typeof body?.verdict === 'string' ? body.verdict : null;
    if (verdict === 'REVISE' && directorUserId === 'AUTOTEST') {
      const scrId = await findLatestApprovedAssetId(supabase, ep, 'SCR-script');
      const criteria = Array.isArray(body?.acceptance_criteria)
        ? (body.acceptance_criteria as unknown[]).filter(
            (v): v is string => typeof v === 'string' && v.trim().length > 0,
          )
        : [];
      const revisionNote =
        criteria.length > 0
          ? criteria.join('; ')
          : 'Readability Critic verdict REVISE — re-author the storyboard for readability.';
      events.push({
        name: 'sandystudio/exec-sb/create-storyboard',
        data: {
          episodeId: ep,
          scriptAssetId: scrId ?? '',
          revisionNote,
        },
      });
    }
  }

  // ── Continuity Check APPROVED → EXEC-EREF (episode references) +
  //    EXEC-MGEN (music) in parallel.
  // Phase A.2 PR γ (LT-04, Director directive 2026-05-08 q3b): music
  // generation moves BEFORE animatic, so the animatic player can preview
  // pacing WITH music. Both MGEN and EREF run after world_check; EDIT
  // (animatic) waits for both to complete.
  if (ft === 'REV-world_check') {
    // Day 3.2 (2026-05-18, q2c soft switch): when DESIGNER_CHAIN_ENABLED is
    // on, fan out one Designer Plan event per shot in the APPROVED storyboard.
    // Each Plan is a per-shot SPC-ref_plan asset that Director approves
    // independently; APPROVED Plan fires `exec-eref/execute-from-plan` below.
    // Legacy path (flag off) keeps firing the single generate-references
    // event — replay-pilot and in-flight episodes continue to work.
    //
    // C1_STOP_BEFORE_EREF (verification): halt the chain here, before any paid
    // image generation. MGEN (below) still fires so the run is otherwise whole.
    if (stopBeforeErefEnabled()) {
      // intentionally fire no EREF events — chain stops before images.
    } else if (designerChainEnabled()) {
      if (!(await hasJob(supabase, ep, 'EXEC-EREF-DESIGNER', { since }))) {
        const stbId = await findLatestApprovedAssetId(
          supabase,
          ep,
          'STB-storyboard',
        );
        // Load the APPROVED storyboard's content so we can list every shot
        // and fan out one Designer event per shot. If STB lookup fails we
        // intentionally fall back to the legacy path rather than firing zero
        // events (defensive — keeps the pipeline moving on data anomalies).
        let stbContent: string | null = null;
        if (stbId) {
          const { data: stbRow } = await supabase
            .from('assets')
            .select('content')
            .eq('id', stbId)
            .maybeSingle();
          stbContent = (stbRow as { content?: string | null } | null)?.content ?? null;
        }
        const shots = stbContent ? extractShotsFromStoryboard(stbContent) : [];
        if (shots.length > 0) {
          // Pilot Pass (Director directive 2026-05-20): only fire the first
          // PILOT_COUNT shots as Designer Plans. Director reviews / approves
          // both pilots, then we fan out the remaining shots in a second
          // batch. Mirrors the EREF v2 generate-references → fanout-trigger
          // pattern. Previously this fan-out was N×shots all at once, which
          // generated 22 Plans in one go and forced Director to triage all
          // of them before a single execute-from-plan could run. The
          // remaining shot ids are stashed into episodes.metadata so a
          // future auto-fanout-on-last-pilot trigger (or PA `fanoutDesigner`
          // tool) can pick them up without re-reading the storyboard.
          const PILOT_COUNT_DESIGNER = 2;
          const pilotShots = shots.slice(0, PILOT_COUNT_DESIGNER);
          const pendingShotIds = shots.slice(PILOT_COUNT_DESIGNER).map((s) => s.shot_id);
          for (const shot of pilotShots) {
            events.push({
              name: 'sandystudio/exec-eref-designer/plan',
              data: { episodeId: ep, shotId: shot.shot_id },
            });
          }
          // Stash remaining shot ids for the post-pilot fanout, AND mirror the
          // pilot shotIds into the Track-A `eref_pilot_shot_ids` field so the
          // browser-side EREFPilotPillbar (components/pipeline/EREFPilotPillbar.tsx)
          // can count the 2 approved pilot IMGs and activate the
          // "Approve Direction & Fan Out" button. Without this mirror, the UI
          // counter stays "0/2" forever because the Designer-chain branch
          // (Track B) writes only `designer_*` keys, but the pillbar reads
          // `eref_pilot_shot_ids` (Track A).
          //
          // TD-23 / TD-24 follow-up 2026-05-20.
          //
          // We do this AFTER queueing events so a transient metadata write
          // failure does not block the pilots — those still fire.
          try {
            const { data: epRow } = await supabase
              .from('episodes')
              .select('metadata')
              .eq('id', ep)
              .maybeSingle();
            const existingMeta = (epRow?.metadata as Record<string, unknown> | null) ?? {};
            const pilotShotIds = pilotShots.map((s) => s.shot_id);
            const nextMeta: Record<string, unknown> = {
              ...existingMeta,
              designer_pilot_count: PILOT_COUNT_DESIGNER,
              designer_fanout_total: shots.length,
              // Mirror Track-A pilot shotIds so the pillbar counter works.
              eref_pilot_shot_ids: pilotShotIds,
            };
            if (pendingShotIds.length > 0) {
              nextMeta.designer_fanout_pending = pendingShotIds;
            }
            await supabase
              .from('episodes')
              .update({ metadata: nextMeta as never } as never)
              .eq('id', ep);
          } catch {
            /* non-fatal — pilots will still fire */
          }
        } else {
          // Defensive fallback — fire legacy single event so REV-world_check
          // approval doesn't silently land in a state with zero next events.
          events.push({
            name: 'sandystudio/exec-eref/generate-references',
            data: { episodeId: ep, storyboardAssetId: stbId ?? asset.id },
          });
        }
      }
    } else if (!(await hasJob(supabase, ep, 'EXEC-EREF', { since }))) {
      // Resolve the underlying STB asset — `asset.id` is the REV-world_check
      // review, not the storyboard. EREF runner parses storyboard JSON from
      // the asset it receives, so passing the review id makes it find no
      // shots → "No episode reference assets inserted" failure. (Sprint φ
      // chain bug fix 2026-05-16.)
      const stbId = await findLatestApprovedAssetId(supabase, ep, 'STB-storyboard');
      events.push({
        name: 'sandystudio/exec-eref/generate-references',
        data: { episodeId: ep, storyboardAssetId: stbId ?? asset.id },
      });
    }
    if (!(await hasJob(supabase, ep, 'EXEC-MGEN', { since }))) {
      events.push({
        name: 'sandystudio/exec-mgen/generate-music',
        // animaticAssetId is empty here — MGEN now generates BEFORE
        // animatic exists. Runner reads section + storyboard for prompt
        // context. Field kept for backward-compat with the event schema.
        data: { episodeId: ep, animaticAssetId: '', section: 'main' },
      });
    }
  }

  // ── Ref Plan Critic PASS (Mode 4 only) → flip Plan APPROVED + fire Artist.
  // TD (2026-06-09): the "downstream code flips Plan to REVIEW" the EPREV
  // comment promised never existed — the Designer's SPC-ref_plan stays DRAFT
  // forever in the Mode-4 designer→critic chain (factory auto-approve does not
  // stick for re-authored plans), so the Artist (execute-from-plan) hard-fails
  // `status="DRAFT", expected APPROVED` and zero frames generate. This is the
  // missing promotion: when the EPREV critic PASSes (Mode 4 = AUTOTEST), flip
  // the reviewed Plan to APPROVED and fire the Artist. Modes 1-3 are untouched
  // — there computeNextEvents only runs on the Director's manual Plan approval
  // (autoChain is off for critic outputs), so the SPC-ref_plan branch below is
  // what fires the Artist. confirmedBy === 'AUTOTEST' is the Mode-4 sentinel.
  if (
    (ft === 'REV-ref_plan' || ft.startsWith('REV-ref_plan-')) &&
    directorUserId === 'AUTOTEST' &&
    designerChainEnabled()
  ) {
    const body = parseLastJsonBlock(asset.content);
    const verdict = typeof body?.verdict === 'string' ? body.verdict : null;
    const planAssetId =
      typeof body?.plan_asset_id === 'string' ? body.plan_asset_id : null;
    const shotId = typeof body?.shot_id === 'string' ? body.shot_id : null;
    if (verdict === 'PASS' && planAssetId && shotId) {
      // Promote the Plan so the Artist's APPROVED gate passes.
      await supabase.from('assets').update({ status: 'APPROVED' }).eq('id', planAssetId);
      // Per-Plan idempotency: skip if an IMG already references this Plan.
      if (!(await planAlreadyExecuted(supabase, ep, 'IMG-episode_ref', planAssetId))) {
        events.push({
          name: 'sandystudio/exec-eref/execute-from-plan',
          data: { episodeId: ep, shotId, planAssetId },
        });
      }
    }
  }

  // ── Ref Plan APPROVED → EXEC-EREF execute-from-plan (Day 3.2)
  // Sprint «Дизайнер и Аниматор» 2026-05-18 (q2c flag-gated). Director (or
  // future Day 4 Critic) approved the per-shot Plan; runner now generates
  // exactly one IMG-episode_ref using the Plan's provider/size/prompt
  // decisions. Idempotency check is keyed per Plan asset id (not per agent
  // for the whole episode) so each Plan triggers its own execute event.
  // TD-24 (2026-05-20): Designer runner writes file_type as
  // `SPC-ref_plan-<shot_id>` (e.g. `SPC-ref_plan-SS-S15-E01-A1-SC01-SH01`)
  // per its documented format. The original strict `===` check missed every
  // real Plan asset and `fired_events: []` blocked Phase 5 of the q2b smoke
  // for SS-S15-E01. Hot-fix accepts both shapes. Helper refactor for the
  // other 4 prod sites in follow-up (TD-24.B).
  //
  // Status guard (2026-06-09): only fire when the Plan is actually APPROVED.
  // In Mode 4 the factory feeds the Designer's freshly-saved (DRAFT) plan to
  // computeNextEvents, which previously fired the Artist prematurely against a
  // DRAFT plan (→ hard-fail). The REV-ref_plan branch above now drives the
  // Mode-4 Artist fire post-critic; this branch handles the Director-approved
  // (APPROVED) path in Modes 1-3.
  if ((ft === 'SPC-ref_plan' || ft.startsWith('SPC-ref_plan-')) && designerChainEnabled()) {
    // Mode-4 dedup (2026-06-12, E07 Artist double-fire 25s apart): in
    // AUTOTEST the factory auto-approves the Designer's fresh plan and runs
    // computeNextEvents on it → this branch fired the Artist BEFORE the
    // EPREV critic ever saw the plan (gate bypass), then the REV-ref_plan
    // PASS branch above fired it AGAIN post-critic (the IMG-provenance
    // idempotency is blind while the first image is still generating,
    // ~6 min). The comment below always declared this branch the
    // Director-approval (Modes 1-3) path — now it actually is. Mode-4
    // canonical source: REV-ref_plan PASS branch, post-critic, only.
    if (directorUserId === 'AUTOTEST') {
      return events;
    }
    const { data: planRow } = await supabase
      .from('assets')
      .select('status')
      .eq('id', asset.id)
      .maybeSingle();
    const planApproved =
      (planRow as { status?: string } | null)?.status === 'APPROVED';
    if (!planApproved) {
      // Not yet approved (Mode-4 pre-critic, or non-approved revision) — the
      // REV-ref_plan branch fires the Artist once the critic promotes it.
      return events;
    }
    // Extract shotId from the Plan asset's JSON body so the executor knows
    // which shot to generate. We trust the body — Director would not have
    // approved a Plan with a malformed shot_id (and the Designer runner
    // validates it before write).
    let shotId: string | null = null;
    if (typeof asset.content === 'string') {
      const matches = [...asset.content.matchAll(/```json\s*([\s\S]+?)```/g)];
      const last = matches[matches.length - 1]?.[1];
      if (last) {
        try {
          const body = JSON.parse(last.trim()) as { shot_id?: unknown };
          if (typeof body.shot_id === 'string') shotId = body.shot_id;
        } catch {
          /* leave shotId null */
        }
      }
    }
    // Per-Plan idempotency: any IMG already carrying this Plan id suppresses
    // the re-fire (handles Director double-click, HMR retrigger).
    if (
      shotId &&
      !(await getExcludedShotIds()).has(shotId) &&
      !(await planAlreadyExecuted(supabase, ep, 'IMG-episode_ref', asset.id))
    ) {
      events.push({
        name: 'sandystudio/exec-eref/execute-from-plan',
        data: { episodeId: ep, shotId, planAssetId: asset.id },
      });
    }
  }

  // ── Shot Plan Critic PASS (Mode 4 only) → flip Plan APPROVED + fire VGEN.
  // Mirror of the REV-ref_plan branch above, added 2026-06-12 (E07 smoke):
  // this branch DID NOT EXIST — the eref side got its post-critic promotion
  // on 2026-06-09 but the vanim side never got the mirror. Consequences in
  // the smoke: (a) re-authored SPC-shot_plan versions sat DRAFT forever at
  // clean VPREV verdicts (TD-76 — Полина's unstickPlanForApproval + manual
  // DRAFT→REVIEW→approve were the workaround), and (b) the SPC-shot_plan
  // branch below fired VGEN off the factory auto-approve BEFORE the critic
  // ran (paid render on an unvalidated plan). Mode-4 canonical source for
  // plan-driven video: THIS branch, post-VPREV, only.
  //
  // PASS_WITH_UNCERTAINTY also advances: AUTOTEST auto-passes Director
  // gates by definition, and the smoke's clean-but-uncertain verdicts are
  // exactly the rows that stuck. CREAD's vanim phase still reviews after
  // (advisory in Mode 4, same ordering as the eref side).
  if (
    (ft === 'REV-shot_plan' || ft.startsWith('REV-shot_plan-')) &&
    directorUserId === 'AUTOTEST' &&
    animatorChainEnabled()
  ) {
    const body = parseLastJsonBlock(asset.content);
    const verdict = typeof body?.verdict === 'string' ? body.verdict : null;
    const planAssetId =
      typeof body?.plan_asset_id === 'string' ? body.plan_asset_id : null;
    const shotId = typeof body?.shot_id === 'string' ? body.shot_id : null;
    const cleanVerdict = verdict === 'PASS' || verdict === 'PASS_WITH_UNCERTAINTY';
    if (cleanVerdict && planAssetId && shotId) {
      await supabase.from('assets').update({ status: 'APPROVED' }).eq('id', planAssetId);
      if (!(await planAlreadyExecuted(supabase, ep, 'VID-shot', planAssetId))) {
        // duration_seconds rides from the Plan body (runner clamps anyway,
        // but passing it keeps event payloads honest).
        const { data: planRow } = await supabase
          .from('assets')
          .select('content')
          .eq('id', planAssetId)
          .maybeSingle();
        const planBody = parseLastJsonBlock(
          (planRow as { content?: string | null } | null)?.content,
        );
        const duration =
          typeof planBody?.duration_seconds === 'number' &&
          planBody.duration_seconds > 0
            ? planBody.duration_seconds
            : null;
        events.push({
          name: 'sandystudio/exec-vgen/single-shot',
          data: {
            episodeId: ep,
            shotId,
            planAssetId,
            ...(duration !== null ? { duration_seconds: duration } : {}),
          },
        });
      }
    }
  }

  // ── SPC-shot_plan.APPROVED → exec-vgen/start with planAssetId
  //    (q7a Step 6 wired runner.ts to extract end_image, seed, quality_tier
  //    from Plan body; this branch is what triggers that flow). Mirrors the
  //    SPC-ref_plan branch above. Gated by ANIMATOR_CHAIN_ENABLED so a
  //    pre-flag episode that received Plans manually can't accidentally
  //    fire VGEN twice. Per-Plan idempotency via metadata plan_asset_id on
  //    the resulting VID-shot (both provenance and top-level shapes).
  //
  //    Mode-4 dedup (2026-06-12): AUTOTEST skips this branch — the factory
  //    feeds the freshly auto-approved plan here BEFORE the VPREV critic has
  //    reviewed it (gate bypass + double fire vs the REV-shot_plan branch
  //    above). Modes 1-3 only: Director's manual Plan approval is the
  //    canonical trigger.
  if (
    (ft === 'SPC-shot_plan' || ft.startsWith('SPC-shot_plan-')) &&
    animatorChainEnabled() &&
    directorUserId !== 'AUTOTEST'
  ) {
    let shotId: string | null = null;
    let durationSecondsFromPlan: number | null = null;
    if (typeof asset.content === 'string') {
      const matches = [...asset.content.matchAll(/```json\s*([\s\S]+?)```/g)];
      const last = matches[matches.length - 1]?.[1];
      if (last) {
        try {
          const body = JSON.parse(last.trim()) as {
            shot_id?: unknown;
            duration_seconds?: unknown;
          };
          if (typeof body.shot_id === 'string') shotId = body.shot_id;
          if (typeof body.duration_seconds === 'number' && body.duration_seconds > 0) {
            durationSecondsFromPlan = body.duration_seconds;
          }
        } catch {
          /* leave shotId null */
        }
      }
    }
    // Per-Plan idempotency: any VID-shot already carrying this Plan id
    // (either metadata shape) suppresses the re-fire.
    if (
      shotId &&
      !(await getExcludedShotIds()).has(shotId) &&
      !(await planAlreadyExecuted(supabase, ep, 'VID-shot', asset.id))
    ) {
      const data: {
        episodeId: string;
        shotId: string;
        planAssetId: string;
        duration_seconds?: number;
      } = {
        episodeId: ep,
        shotId,
        planAssetId: asset.id,
      };
      if (durationSecondsFromPlan !== null) {
        data.duration_seconds = durationSecondsFromPlan;
      }
      // TD-47.a (2026-05-24): emit `single-shot` (not `start`/Pilot Pass).
      // Pilot Pass marks output as `vgen_pilot=true` and forces fast tier —
      // both wrong for Plan-driven path. The Plan IS the preview; we want a
      // single canonical VID-shot at the tier the Plan specifies.
      events.push({
        name: 'sandystudio/exec-vgen/single-shot',
        data,
      });
    }
  }

  // ── TD-49 Phase 2 P2.6 — IMG-anchor batch flow
  //
  // When an `IMG-anchor_*` asset is APPROVED, we do NOT immediately fire a
  // downstream agent — the Animator (EXEC-VANIM) needs ALL anchors of the
  // episode in place before it can author Plans (each Plan body references
  // both start_anchor and end_anchor by asset_id). The flow:
  //
  //   1. Read `episodes.metadata.anchor_chain_enabled`. If false / absent →
  //      no-op (legacy path, anchor chain feature off for this episode).
  //   2. Count storyboard shots for the episode.
  //   3. Count APPROVED IMG-anchor_* assets for the episode.
  //   4. If APPROVED count < expected (`2 × shotCount`) → just log progress
  //      and exit. Director continues approving pairs.
  //   5. If APPROVED count >= expected → all anchors locked. Fan-out
  //      `exec-vanim/plan` per shot so the Animator authors each Plan with
  //      references to its `start_anchor` + `end_anchor` IDs.
  //
  // Pair reciprocity (checkAnchorPairCompatibility across adjacent shots)
  // is not gated here in v1 — it lives at the Critic structural validator
  // (P2.5 validateAnchorChainStructure) per-Plan. Approve-route fanout
  // surfaces a warning-level activity event if cross-shot mismatch found
  // but does not block the fan-out (Director can still revise).
  if (ft.startsWith('IMG-anchor_') || ft === 'IMG-anchor') {
    // computeNextEvents is only invoked on APPROVE (callsite line 1157), so
    // no decision check needed here.
    const { data: episodeRow } = await supabase
      .from('episodes')
      .select('id,metadata')
      .eq('id', ep)
      .maybeSingle();
    const epMetadata =
      (episodeRow as { metadata?: Record<string, unknown> | null } | null)
        ?.metadata ?? null;
    const anchorChainEnabled =
      Boolean(epMetadata && (epMetadata as { anchor_chain_enabled?: unknown }).anchor_chain_enabled);

    if (anchorChainEnabled) {
      // 1. Total storyboard shots — 2 × N is the expected anchor count.
      const { data: stbRow } = await supabase
        .from('assets')
        .select('content')
        .eq('episode_id', ep)
        .eq('file_type', 'STB-storyboard')
        .eq('status', 'APPROVED')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      let shotCount = 0;
      const stbContent =
        (stbRow as { content?: string | null } | null)?.content ?? null;
      let shots: Array<{ shotId: string }> = [];
      if (stbContent) {
        try {
          const { listStoryboardShots } = await import('@/lib/api/vgen-shot-helpers');
          shots = listStoryboardShots(stbContent);
          shotCount = shots.length;
        } catch {
          shotCount = 0;
        }
      }
      const expected = shotCount > 0 ? shotCount * 2 : 0;

      // 2. APPROVED IMG-anchor_* count.
      const { count: approvedAnchorCount } = await supabase
        .from('assets')
        .select('id', { count: 'exact', head: true })
        .eq('episode_id', ep)
        .like('file_type', 'IMG-anchor_%')
        .eq('status', 'APPROVED');
      const approved = approvedAnchorCount ?? 0;

      if (expected > 0 && approved >= expected && shots.length > 0) {
        // 3. All anchors approved → ONE animatic pass (pacing gate) before
        // any video. TD-49 Phase 2 re-wire: previously this fanned out
        // exec-vanim/plan per shot, skipping the pacing preview. Now it fires
        // a single exec-edit/create-animatic with anchor_mode so EXEC-EDIT
        // builds the animatic from APPROVED IMG-anchor START frames. The
        // animatic→video gate (Director approves the animatic) is what fans
        // out per-shot planning afterwards (VID-animatic APPROVED branch).
        //
        // Idempotency: hasJob with since=updated_at on this asset gates
        // re-fires of EXEC-EDIT at the episode level.
        const alreadyFired = await hasJob(supabase, ep, 'EXEC-EDIT', { since });
        if (!alreadyFired) {
          // Optional: attach newest APPROVED music so the animatic plays with
          // the real track for pacing review (graceful — absent → silent).
          const { data: musicRow } = await supabase
            .from('assets')
            .select('id')
            .eq('episode_id', ep)
            .eq('file_type', 'AUD-music')
            .eq('status', 'APPROVED')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const musicAssetId = (musicRow as { id?: string } | null)?.id ?? null;
          events.push({
            name: 'sandystudio/exec-edit/create-animatic',
            data: {
              episodeId: ep,
              storyboardAssetIds: [],
              anchor_mode: true,
              ...(musicAssetId ? { musicAssetId } : {}),
            },
          });
        }
      }
      // expected === 0 or approved < expected: no event emitted. Activity
      // feed already shows the per-anchor approval; the gate is implicit.
    }
  }

  // ── Early silent EDL materialization (D6, 2026-07-09): the moment an episode
  //    reference is APPROVED, materialize the silent EDL animatic so the Episode
  //    Timeline flips from a read-only storyboard skeleton to a real editable EDL
  //    — in BOTH pipeline modes, for the whole run. `ensureEpisodeAnimaticEDL` is
  //    a raw service-role insert (status APPROVED) that does NOT pass through
  //    computeNextEvents, so it NEVER triggers a premature video fanout; the
  //    "Start Video" latch stays the sole gate that opens the stream. Idempotent
  //    and self-guarding — returns null (no-op) until an APPROVED storyboard and
  //    ≥1 APPROVED reference exist.
  if (ft.startsWith('IMG-episode_ref')) {
    await ensureEpisodeAnimaticEDL(supabase, ep);
  }

  // ── Parallel mode (S-reorder 2026-07-01): an APPROVED episode reference fires
  //    the shot's Video Designer directly — ref → shot plan → critic → video —
  //    WITHOUT waiting for a whole-episode animatic. The pilot-2 count is bounded
  //    upstream (the Designer only fanned 2 shots), so this naturally yields the
  //    2 video pilots; the pilot-video branch (below) releases the fanout for the
  //    rest. Sequential mode is untouched (refs wait for the animatic gate).
  if (ft.startsWith('IMG-episode_ref') && isShotReferenceV2((asset as { metadata?: unknown }).metadata)) {
    if ((await readEpisodePipelineMode(supabase, ep)) === 'parallel') {
      const shotId = (asset.metadata as unknown as { shot_reference?: { shot_id?: unknown } })
        ?.shot_reference?.shot_id;
      if (
        typeof shotId === 'string' &&
        shotId.length > 0 &&
        !(await getExcludedShotIds()).has(shotId) &&
        !(await shotHasPlan(supabase, ep, shotId))
      ) {
        events.push({
          name: 'sandystudio/exec-vanim/plan',
          data: { episodeId: ep, shotId },
        });
      }
    }
  }

  // ── Sequential auto-fire create-animatic — REMOVED (2026-07-09, animatic-stage
  //    demotion). The whole-episode animatic-approval ceremony is gone: the EDL
  //    is now materialized silently and early (see the IMG-episode_ref block
  //    above, both modes), and video is released by the "Start Video" latch, not
  //    by approving an animatic. Anchor-mode still fires its OWN create-animatic
  //    (anchor pacing gate) in the anchor block above — that path is untouched.

  // ── Animatic APPROVED → VGEN Pilot Pass + EXEC-MGEN×1
  // Per purrfect-stirring-hollerith plan: replace the legacy [1,2,3] hardcode
  // with real shot ids from animatic_v1.shot_list. Pilot Pass picks 1-2
  // representative shots; Director approves direction; remaining shots fan
  // out via the /fanout-trigger event after manual approval.
  //
  // Back-compat: if the animatic asset has no animatic_v1 metadata (legacy
  // mock pilot or pre-shot-list episodes), fall through to the old 3-shot
  // fan-out so replay-pilot keeps passing.
  if (ft === 'VID-animatic') {
    const animaticMeta = (asset as { metadata?: unknown }).metadata;

    // TD-49 Phase 2 (anchor_chain_enabled): in anchor mode the per-shot Plans
    // already exist (Animator authored them before the anchors). The animatic
    // is now the PACING GATE, and approving it advances into video — without
    // re-planning existing Plans (LOCKED idempotency) and still respecting the
    // pilot gate (q13 LOCKED — KEEP pilot, do NOT fan out all shots).
    const { data: anchorEpRow } = await supabase
      .from('episodes')
      .select('metadata')
      .eq('id', ep)
      .maybeSingle();
    const anchorEpMeta =
      (anchorEpRow as { metadata?: Record<string, unknown> | null } | null)
        ?.metadata ?? null;
    const anchorMode = Boolean(
      anchorEpMeta &&
        (anchorEpMeta as { anchor_chain_enabled?: unknown }).anchor_chain_enabled ===
          true,
    );

    if (anchorMode) {
      // Anchor-mode gate. Idempotency on EXEC-VGEN — advancing approved Plans
      // fires video-gen, never the Animator (plans are not regenerated).
      const alreadyFiredAnchor = await hasJob(supabase, ep, 'EXEC-VGEN', { since });
      if (!alreadyFiredAnchor && isAnimaticV1(animaticMeta)) {
        const v1 = (animaticMeta as { animatic_v1: AnimaticContract }).animatic_v1;
        const shotList = v1.shot_list ?? [];
        // q13 LOCKED — KEEP pilot: only the pilot shots advance, not all shots.
        const pilots = pickPilotVgenShots(shotList);
        if (pilots.length > 0) {
          // Map shot_id → existing SPC-shot_plan (id + status). E02 already has
          // all 30 plans, so this map is fully populated and NO planning fires.
          const { data: planRows } = await supabase
            .from('assets')
            .select('id,status,content,metadata')
            .eq('episode_id', ep)
            .or('file_type.eq.SPC-shot_plan,file_type.like.SPC-shot_plan-%');
          // Only an APPROVED plan may advance to video. A plan that merely
          // EXISTS (REVIEW/REVISION) has NOT passed the Animator's Critic — so
          // firing video on it bypasses the quality gate AND is rejected
          // downstream by EXEC-VGEN ("expected APPROVED", runner.ts). Track
          // APPROVED plans separately from "any plan exists" so unapproved shots
          // WAIT for plan approval instead of spawning doomed video jobs.
          const approvedPlanByShotId = new Map<string, { id: string }>();
          const shotsWithAnyPlan = new Set<string>();
          for (const row of (planRows ?? []) as Array<{
            id: string;
            status?: string | null;
            content?: string | null;
            metadata?: unknown;
          }>) {
            // A2 (2026-06-14): shared shot_id SSOT resolver.
            const shotId = resolveShotId({ metadata: row.metadata, content: row.content });
            if (!shotId) continue;
            shotsWithAnyPlan.add(shotId);
            // Newest-wins: any APPROVED plan for the shot is enough to advance it.
            if (row.status === 'APPROVED') approvedPlanByShotId.set(shotId, { id: row.id });
          }

          // Per-Plan video idempotency: a VID-shot stamped with the plan's
          // asset_id means that plan was already executed → never re-fire.
          const { data: vidRows } = await supabase
            .from('assets')
            .select('metadata')
            .eq('episode_id', ep)
            .like('file_type', 'VID-shot%');
          const executedPlanIds = new Set<string>();
          for (const row of (vidRows ?? []) as Array<{ metadata?: unknown }>) {
            const pid = planIdFromAssetMeta(row.metadata);
            if (pid) executedPlanIds.add(pid);
          }

          let firedPilotVideo = false;
          for (const p of pilots) {
            const approvedPlan = approvedPlanByShotId.get(p.shotId);
            if (approvedPlan) {
              // APPROVED plan → advance to video via the plan-driven single-shot
              // path. Skip if its plan already produced a VID-shot.
              if (executedPlanIds.has(approvedPlan.id)) continue;
              events.push({
                name: 'sandystudio/exec-vgen/single-shot',
                data: {
                  episodeId: ep,
                  shotId: p.shotId,
                  planAssetId: approvedPlan.id,
                  duration_seconds: p.durationSeconds,
                },
              });
              firedPilotVideo = true;
            } else if (shotsWithAnyPlan.has(p.shotId)) {
              // Plan exists but is NOT APPROVED (REVIEW/REVISION) — it has not
              // cleared the Animator's Critic. Do NOT fire video (that bypasses
              // the gate and EXEC-VGEN rejects it) and do NOT re-author. The shot
              // advances on its own when its SPC-shot_plan.APPROVED fires.
              continue;
            } else {
              // No plan at all for this pilot shot → author one (Animator chain).
              events.push({
                name: 'sandystudio/exec-vanim/plan',
                data: { episodeId: ep, shotId: p.shotId },
              });
            }
          }
          // Only mark pilots PENDING_REVIEW when a pilot video actually fired —
          // not when every pilot is waiting on plan approval (E02's case).
          if (firedPilotVideo) await setVgenPilotState(supabase, ep, 'PENDING_REVIEW');
        }
      }
    } else {
    // ANIMATOR_CHAIN: idempotency on EXEC-VANIM (Plan author); legacy:
    // EXEC-VGEN. Picking the wrong one would either re-fire pilots on
    // double-click (animator chain) or block animator chain firing at all.
    const animatorChain = animatorChainEnabled();
    const alreadyFired = animatorChain
      ? await hasJob(supabase, ep, 'EXEC-VANIM', { since })
      : await hasJob(supabase, ep, 'EXEC-VGEN', { since });
    if (!alreadyFired) {
      if (isAnimaticV1(animaticMeta)) {
        const v1 = (animaticMeta as { animatic_v1: AnimaticContract }).animatic_v1;
        const shotList = v1.shot_list ?? [];
        const pilots = pickPilotVgenShots(shotList);
        if (pilots.length > 0) {
          // Set pilot_state PENDING_REVIEW upfront — runner will reaffirm
          // it after each pilot finishes. Doing it here means the UI reflects
          // "pilot in flight" the moment Director clicks Approve animatic.
          await setVgenPilotState(supabase, ep, 'PENDING_REVIEW');
          if (animatorChain) {
            // ANIMATOR_CHAIN ON: per-shot Animator authors SPC-shot_plan →
            // exec-vprev (Critic) auto-chained → comedy → GAGAD review →
            // Director approves Plan → SPC-shot_plan.APPROVED branch below
            // fires exec-vgen/start with planAssetId for plan-driven video.
            // Closes the 2026-05-19 «~30 LoC follow-up» gap. Symmetric to
            // designer chain (REV-world_check → exec-eref-designer per shot).
            for (const p of pilots) {
              events.push({
                name: 'sandystudio/exec-vanim/plan',
                data: {
                  episodeId: ep,
                  shotId: p.shotId,
                },
              });
            }
          } else {
            // Legacy direct-to-VGEN (buildShotPromptV2 template path).
            for (const p of pilots) {
              events.push({
                name: 'sandystudio/exec-vgen/start',
                data: {
                  episodeId: ep,
                  shotId: p.shotId,
                  duration_seconds: p.durationSeconds,
                  pilot: true,
                },
              });
            }
          }
        }
      } else {
        // Legacy fallback (replay-pilot, pre-Pilot-Pass episodes): 3 fake shots.
        for (const shotN of [1, 2, 3] as const) {
          events.push({
            name: 'sandystudio/exec-vgen/generate-shot',
            data: { episodeId: ep, shotId: `shot${shotN}`, animaticAssetId: asset.id },
          });
        }
      }
    }
    // (Phase A.2 PR γ) MGEN no longer fires here — moved to REV-world_check
    // approval so music is ready BEFORE animatic. See branch above.
    } // end non-anchor (else) branch
  }

  // ── Parallel mode (S-reorder 2026-07-01): the APPROVED pilot videos release
  //    the fanout. Once the 2 pilot videos are approved, the remaining shots'
  //    Designers fire (stashed in `designer_fanout_pending` by the REV-world_check
  //    pilot branch); each remaining ref then flows ref→video via the parallel
  //    edge above. Fires once (`parallel_fanout_fired` guard). Sequential: no-op.
  if (ft.startsWith('VID-shot')) {
    if ((await readEpisodePipelineMode(supabase, ep)) === 'parallel') {
      const { data: epRow } = await supabase
        .from('episodes')
        .select('metadata')
        .eq('id', ep)
        .maybeSingle();
      const meta = ((epRow as { metadata?: Record<string, unknown> | null } | null)
        ?.metadata ?? {}) as Record<string, unknown>;
      const alreadyFired = meta.parallel_fanout_fired === true;
      const pending = Array.isArray(meta.designer_fanout_pending)
        ? (meta.designer_fanout_pending as unknown[]).filter(
            (s): s is string => typeof s === 'string' && s.length > 0,
          )
        : [];
      const PILOT_COUNT_PARALLEL = 2;
      const approvedVideos = await countApproved(supabase, ep, 'VID-shot');
      if (!alreadyFired && pending.length > 0 && approvedVideos >= PILOT_COUNT_PARALLEL) {
        // Per-shot idempotency (2026-07-03 fix, E13): fan out ONLY to shots the
        // Reference Designer hasn't already produced a ref plan for. Without this
        // the fanout blindly re-fired the Designer for EVERY pending shot —
        // including the many the parallel per-shot edge had already advanced — so
        // approving the 2nd pilot video REGENERATED refs across the whole episode
        // (07-02 10:24–10:45 burst: ~14 shots got a duplicate SPC-ref_plan). One
        // scan builds the "already has a ref plan" set; skip those shots.
        const alreadyHasRefPlan = await shotsWithRefPlan(supabase, ep);
        const excludedIds = await getExcludedShotIds();
        const freshShots = pending.filter(
          (s) => !alreadyHasRefPlan.has(s) && !excludedIds.has(s),
        );
        for (const shotId of freshShots) {
          events.push({
            name: 'sandystudio/exec-eref-designer/plan',
            data: { episodeId: ep, shotId },
          });
        }
        try {
          // Prune the pending list as we fire — the fanout is a one-shot
          // transition. Leaving the full 36-shot list in metadata was a landmine:
          // the approve-pilots pillbar route reads it WITHOUT the
          // parallel_fanout_fired guard, so a stale list could re-drive a mass
          // regeneration. Guard set + list dropped together make a second fanout
          // impossible from either path.
          const { designer_fanout_pending: _pruned, ...restMeta } = meta;
          await supabase
            .from('episodes')
            .update({
              metadata: { ...restMeta, parallel_fanout_fired: true } as never,
            } as never)
            .eq('id', ep);
        } catch {
          /* non-fatal — guard is best-effort; duplicate designers dedup downstream */
        }
      }
      // Timeline-as-home Phase 3 — materialize the silent EDL animatic once the
      // pilots are approved, so the Episode Timeline flips from read-only
      // (storyboard skeleton) to a real editable EDL for the rest of the run,
      // and EXEC-STITCH's edit-decision-list is ready ahead of the final cut.
      // Idempotent + parallel-only (this whole branch is gated on parallel).
      await ensureEpisodeAnimaticEDL(supabase, ep);
    }
  }

  // ── Last VID-shot APPROVED → if all shots have an APPROVED row, fire
  //    EXEC-STITCH to assemble the final-cut mp4 (Phase A.2 PR β).
  //    This is the second half of VGEN auto-COMPLETE: the inline status flip
  //    (after the BRIEF block) handles the episode FSM; this branch fires the
  //    actual stitching job. Idempotent via hasJob.
  if (ft.startsWith('VID-shot') && !(await hasJob(supabase, ep, 'EXEC-STITCH', { since }))) {
    // Timeline-as-home Phase 3 — parallel episodes never ran the ref-animatic
    // ceremony, so no VID-animatic exists to drive the final cut. Materialize
    // the silent EDL now (idempotent; no-op in sequential, where the ceremony
    // already produced one → replay-pilot unchanged). Without this, the stitch
    // completeness check below finds no APPROVED animatic and never fires.
    const pipelineMode = await readEpisodePipelineMode(supabase, ep);
    if (pipelineMode === 'parallel') {
      // Refreshes music into the existing EDL if AUD-music was approved AFTER the
      // EDL was first materialized at pilot approval (Фаза 0 staleness fix).
      await ensureEpisodeAnimaticEDL(supabase, ep);
    }
    const { data: animaticRow } = await supabase
      .from('assets')
      .select('metadata')
      .eq('episode_id', ep)
      .like('file_type', 'VID-animatic%')
      .eq('status', 'APPROVED')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const animMeta = (animaticRow as { metadata?: unknown } | null)?.metadata;
    if (isAnimaticV1(animMeta)) {
      const v1 = (animMeta as { animatic_v1: AnimaticContract }).animatic_v1;
      // 2026-06-22 — a shot the Director deleted (duration ≤0.5s) sits in
      // shot_list but can never be APPROVED. Counting it in the denominator
      // meant the gate never reached the threshold and the final cut never
      // auto-started; Director's only workaround was to "approve" the deleted
      // shot (a cheat). Exclude deleted shots: require every LIVE shot approved.
      // 2026-07-03 — also honor the explicit episodes.metadata.excluded_shot_ids
      // flag (the kebab toggle), not just the ≤0.5s duration gesture.
      const overrides = v1.director_overrides;
      const excludedShotIds = await getExcludedShotIds();
      const liveShotIds = (v1.shot_list ?? [])
        .filter((s) => !isDeletedShot(s, overrides, excludedShotIds))
        .map((s) => s.shot_id);
      if (liveShotIds.length > 0) {
        const { data: approvedRows } = await supabase
          .from('assets')
          .select('metadata')
          .eq('episode_id', ep)
          .like('file_type', 'VID-shot%')
          .eq('status', 'APPROVED');
        const approvedShotIds = new Set<string>();
        for (const row of (approvedRows ?? []) as Array<{ metadata?: unknown }>) {
          const sid = (row.metadata as { shot_id?: unknown } | null)?.shot_id;
          if (typeof sid === 'string') approvedShotIds.add(sid);
        }
        if (liveShotIds.every((id) => approvedShotIds.has(id))) {
          // Фаза 0 — music precondition. By now ensureEpisodeAnimaticEDL (above,
          // parallel) has baked any APPROVED music into `v1`. If a PARALLEL,
          // Director-driven run STILL has no music track, an APPROVED AUD-music
          // does not exist — do NOT assemble a silent cut behind the Director's
          // back (E14 complaint #1). Surface a readable, actionable notice; the
          // Director loads/approves music (re-fires this gate) or triggers
          // EXEC-STITCH manually for a deliberate music-less cut. AUTOTEST
          // (replay-pilot) and sequential keep their prior behaviour untouched.
          // D3b (2026-07-09): music precondition is now UNIFORM for both pipeline
          // modes (was parallel-only) — the stitch gate (gate.ts) enforces it for
          // manual/direct triggers; this pre-dispatch check keeps the auto-fire
          // from spawning a job that would just fail the gate, and instead surfaces
          // an actionable decision_requested (a MUST-WAKE) so Polina/Director load
          // music (UPLOAD MUSIC re-fires this gate) or run skip-music / manual
          // EXEC-STITCH for a deliberate silent cut. AUTOTEST keeps assembling.
          if (!isAutotest && !contractHasMusic(v1)) {
            await logEvent(supabase, {
              event_type: 'decision_requested',
              severity: 'warning',
              title: 'Финалка ждёт музыку — стич не запущен',
              description:
                'Все живые шоты одобрены, но у эпизода нет APPROVED AUD-music. ' +
                'Залей музыку (UPLOAD MUSIC) — финальный стич соберётся автоматически. ' +
                'Нужен немой cut — запусти skip-music или EXEC-STITCH вручную.',
              actor: 'exec-dir-ai',
              episode_id: ep,
              metadata: { reason: 'STITCH_NO_APPROVED_MUSIC' },
            });
          } else {
            events.push({
              name: 'sandystudio/exec-stitch/assemble-episode',
              data: { episodeId: ep },
            });
          }
        }
      }
    }
  }

  // ── Metadata APPROVED → EXEC-THUMB (covered also by EXEC-COPY's auto-chain
  //    from factory.nextEvent in Mode 4; in Mode 1-3 chain is suppressed and
  //    Director's metadata approval is what fires THUMB).
  if (ft === 'SPC-metadata' && !(await hasJob(supabase, ep, 'EXEC-THUMB-DESIGNER', { since }))) {
    events.push({
      name: 'sandystudio/exec-thumb-designer/plan',
      data: {
        episodeId: ep,
        assetId: asset.id,
      },
    });
  }

  // ── Thumbnail Plan APPROVED → EXEC-THUMB executor renders the designed
  //    variants from the plan (1280×720 + overlay). Director's APPROVE click
  //    on the SPC-thumb_plan is what fires rendering in Mode 1-3.
  if (ft === 'SPC-thumb_plan' && !(await hasJob(supabase, ep, 'EXEC-THUMB', { since }))) {
    events.push({
      name: 'sandystudio/exec-thumb/generate-thumbnail',
      data: {
        episodeId: ep,
        planAssetId: asset.id,
      },
    });
  }

  // ── Thumbnail APPROVED → check publish-ready set (animatic + metadata +
  //    thumbnail all APPROVED) → EXEC-PUB. Director's APPROVE click on the
  //    thumbnail is the implicit publish-confirm in Mode 1-3.
  if (ft === 'IMG-thumbnail') {
    // 2026-06-01: publish-ready now requires the real final cut, not the animatic.
    const finalCutOk = (await countApproved(supabase, ep, 'VID-final_cut')) >= 1;
    const metadataOk = (await countApproved(supabase, ep, 'SPC-metadata')) >= 1;
    const thumbOk = (await countApproved(supabase, ep, 'IMG-thumbnail')) >= 1;
    if (finalCutOk && metadataOk && thumbOk && !(await hasJob(supabase, ep, 'EXEC-PUB', { since }))) {
      events.push({
        name: 'sandystudio/exec-pub/publish',
        data: { episodeId: ep, directorConfirm: true, confirmedBy: directorUserId },
      });
    }
  }

  // ── Final cut APPROVED → if metadata + thumbnail are also approved, the
  //    episode is publish-ready (final_cut may be the last of the three to
  //    be approved). Mirrors the thumbnail branch so order doesn't matter.
  if (ft === 'VID-final_cut') {
    const finalCutOk = (await countApproved(supabase, ep, 'VID-final_cut')) >= 1;
    const metadataOk = (await countApproved(supabase, ep, 'SPC-metadata')) >= 1;
    const thumbOk = (await countApproved(supabase, ep, 'IMG-thumbnail')) >= 1;
    if (finalCutOk && metadataOk && thumbOk && !(await hasJob(supabase, ep, 'EXEC-PUB', { since }))) {
      events.push({
        name: 'sandystudio/exec-pub/publish',
        data: { episodeId: ep, directorConfirm: true, confirmedBy: directorUserId },
      });
    }
  }

  return events;
}
