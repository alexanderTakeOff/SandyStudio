// ──────────────────────────────────────────────────────────────────────────────
// components/preview/AssetPreview.tsx
// Renders an asset's body inside the preview drawer based on file type.
//
//   text (SCR / STB / BIB / PRO / REV / SPC / STA)  → markdown via react-markdown
//   image (IMG)                                     → <img src=drive_path>
//   video (VID)                                     → <video controls>
//   audio (AUD)                                     → <audio controls>
//   unknown                                         → "preview unavailable" + Download
//
// Binary URLs go through `drive_path`. For mock outputs that's
// "H:/My Drive/..." (won't load → fallback). For real outputs it's
// "/staging/<file>" served by Next.js public/.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import useSWR from 'swr';
import ReactMarkdown from 'react-markdown';
import { withHardBreaks } from '@/lib/markdown-breaks';
import { isHttpishUrl, resolvePreviewSrc } from '@/lib/asset-preview-resolver';
import { Download, FileWarning, ExternalLink, CloudOff, Upload, Sparkles, Loader2, Pencil } from 'lucide-react';
import { fetcher } from '@/lib/swr';
import { CanonExtensionsPanel } from '@/components/canon/CanonExtensionsPanel';
import { agentDisplayName } from '@/lib/api/agent-names';
import type { CanonExtensionProposal } from '@/lib/api/canon-extensions';
import { VGENShotSection } from '@/components/vgen/VGENShotSection';
import { ShotPlanContract } from '@/components/preview/ShotPlanContract';
import { CandidatesStrip } from '@/components/assets/EREFv2Sections';
import { primaryAttemptVersion } from '@/lib/api/shot-reference';
import { compareAssetVersionsNewestFirst } from '@/lib/api/asset-ordering';
import { EditorModal } from '@/components/editor/EditorModal';
import { Button } from '@/components/ui/Button';
import { useEffect, useMemo, useRef, useState } from 'react';

const TEXT_PREFIXES = ['SCR', 'STB', 'BIB', 'PRO', 'REV', 'SPC', 'STA', 'SBL'];

export interface AssetPreviewProps {
  assetId: string;
  /** Pass-through for VID-shot regenerate completion (Phase A.1 auto-focus). */
  onRegenerated?: (shotId: string, newAssetId: string) => void;
  /**
   * Called whenever an action inside this preview changes asset state
   * (approve / reject / regenerate / demote). Lets the parent invalidate
   * sibling SWR caches — e.g. EpisodeTimelineSection's `/api/episodes/[id]`
   * — so the timeline cell colour updates instantly. Phase A.1 bug fix
   * 2026-05-08.
   */
  onAssetChanged?: () => void;
  /**
   * TD-43 (2026-05-24): clicking a sibling candidate in the version-picker
   * switches the preview to that asset. Parent (EpisodeTimelineSection)
   * wires this to `setPreviewAssetId` so Director navigates between
   * VID-shot v01/v02/... without closing the drawer.
   */
  onPickAsset?: (assetId: string) => void;
}

interface AssetRow {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  drive_path: string | null;
  staging_path: string | null;
  drive_file_id: string | null;
  drive_web_view_url: string | null;
  content: string | null;
  description: string | null;
  agent_id: string | null;
  created_at: string;
  version: number | null;
  episode_id: string | null;
  series_id: string | null;
  /** JSONB metadata (image_prompt, provenance, animatic_v1, shot_reference, …). */
  metadata: unknown;
}

interface CanonExtensionEvent {
  id: string;
  episode_id: string | null;
  metadata: { proposals?: CanonExtensionProposal[]; asset_id?: string } | null;
  resolved_at: string | null;
}

function categoryFor(file_type: string): 'text' | 'image' | 'video' | 'audio' | 'unknown' {
  const code = (file_type.split('-')[0] ?? '').toUpperCase();
  if (TEXT_PREFIXES.includes(code)) return 'text';
  if (code === 'IMG') return 'image';
  if (code === 'VID') return 'video';
  if (code === 'AUD') return 'audio';
  return 'unknown';
}

// TD-84: Animator Shot Plan (bare `SPC-shot_plan` or TD-66 suffixed
// `SPC-shot_plan-<shot_id>`) renders as the contract page, not raw markdown.
function isShotPlan(file_type: string): boolean {
  return file_type === 'SPC-shot_plan' || file_type.startsWith('SPC-shot_plan-');
}

// F-preview (2026-07-01): any approvable TEXT asset (script, storyboard, review
// docs, SPC specs — cast / metadata / copy / thumb_plan / ref_plan) should
// expose the shared approve control in preview. Previously only VID-shot,
// shot_plan and (later) casting had it, so the Director could not approve e.g.
// the Publicist metadata at all. shot_plan keeps its own ShotPlanContract UI, so
// it is excluded here. BIB/SBL/STA/PRO are on the LOCK flow, not this approve
// path, so they are excluded via the prefix allowlist.
const APPROVABLE_TEXT_PREFIXES = ['SCR', 'STB', 'REV', 'SPC'];
function isApprovableText(file_type: string): boolean {
  if (categoryFor(file_type) !== 'text') return false;
  if (isShotPlan(file_type)) return false;
  const code = (file_type.split('-')[0] ?? '').toUpperCase();
  return APPROVABLE_TEXT_PREFIXES.includes(code);
}

/** Canonical shot_id a plan drives — metadata first, else file_type suffix. */
function shotIdForPlan(file_type: string, metadata: unknown): string | null {
  const fromMeta = (metadata as { shot_id?: unknown } | null)?.shot_id;
  if (typeof fromMeta === 'string' && fromMeta.length > 0) return fromMeta;
  if (file_type.startsWith('SPC-shot_plan-')) {
    return file_type.slice('SPC-shot_plan-'.length) || null;
  }
  return null;
}


export function AssetPreview({ assetId, onRegenerated, onAssetChanged, onPickAsset }: AssetPreviewProps) {
  const { data: meta, error: metaErr, mutate } = useSWR<{ data: AssetRow }>(
    `/api/assets/${assetId}`,
    fetcher,
  );

  // TD-43 (2026-05-24): VID-shot sibling versions for the version-picker.
  // Fetch ALL assets in the episode (limit 200), filter to VID-shot rows
  // sharing the same metadata.shot_id. CandidatesStrip self-hides when ≤1.
  const isVidShotCurrent = meta?.data?.file_type.startsWith('VID-shot') ?? false;
  const episodeIdForSiblings = meta?.data?.episode_id ?? null;
  const { data: episodeAssets } = useSWR<{ data: AssetRow[] }>(
    isVidShotCurrent && episodeIdForSiblings
      ? `/api/assets?episode_id=${episodeIdForSiblings}&file_type_prefix=VID-shot&limit=200`
      : null,
    fetcher,
  );
  const vidShotSiblings = useMemo(() => {
    if (!isVidShotCurrent || !meta?.data || !episodeAssets?.data) {
      return [] as AssetRow[];
    }
    const currentShotId = (meta.data.metadata as { shot_id?: unknown } | null)
      ?.shot_id;
    if (typeof currentShotId !== 'string') return [] as AssetRow[];
    return episodeAssets.data
      .filter((a) => a.file_type.startsWith('VID-shot'))
      .filter((a) => {
        const sid = (a.metadata as { shot_id?: unknown } | null)?.shot_id;
        return typeof sid === 'string' && sid === currentShotId;
      })
      .slice()
      .sort(compareAssetVersionsNewestFirst);
  }, [isVidShotCurrent, meta?.data, episodeAssets?.data]);

  // Fix 1b (Key Art, 2026-07-05): IMG-thumbnail concept variants. EXEC-THUMB
  // renders 3 DIFFERENT concepts (emotion-led / curiosity-led / text-led) but
  // stamps each as a sequential version v01/v02/v03 of one file_type
  // 'IMG-thumbnail'. They are a "pick 1 of N" slot (single-approved), NOT
  // versions of one image — so surface all of them like VID-shot candidates
  // (pipeline-stages collapses the stage to latest=v03, hiding the other two).
  // Episode-scoped (no shot_id): siblings = every IMG-thumbnail row in the
  // same episode. CandidatesStrip self-hides when ≤1.
  const isThumbnailCurrent = meta?.data?.file_type.startsWith('IMG-thumbnail') ?? false;
  const { data: thumbnailAssets } = useSWR<{ data: AssetRow[] }>(
    isThumbnailCurrent && episodeIdForSiblings
      ? `/api/assets?episode_id=${episodeIdForSiblings}&file_type_prefix=IMG-thumbnail&limit=200`
      : null,
    fetcher,
  );
  const thumbnailSiblings = useMemo(() => {
    if (!isThumbnailCurrent || !meta?.data || !thumbnailAssets?.data) {
      return [] as AssetRow[];
    }
    return thumbnailAssets.data
      .filter((a) => a.file_type.startsWith('IMG-thumbnail'))
      .slice()
      .sort(compareAssetVersionsNewestFirst);
  }, [isThumbnailCurrent, meta?.data, thumbnailAssets?.data]);

  // 2026-07-11 (Director): VID-final_cut version picker + approve in the drawer.
  // The Online Editor drawer had no version list and no approve control, so the
  // Director had to approve via the kebab "all". Mirror the VID-shot / thumbnail
  // pattern — episode-scoped siblings (each re-stitch bumps the version).
  const isFinalCutCurrent = meta?.data?.file_type.startsWith('VID-final_cut') ?? false;
  const { data: finalCutAssets } = useSWR<{ data: AssetRow[] }>(
    isFinalCutCurrent && episodeIdForSiblings
      ? `/api/assets?episode_id=${episodeIdForSiblings}&file_type_prefix=VID-final_cut&limit=200`
      : null,
    fetcher,
  );
  const finalCutSiblings = useMemo(() => {
    if (!isFinalCutCurrent || !meta?.data || !finalCutAssets?.data) {
      return [] as AssetRow[];
    }
    return finalCutAssets.data
      .filter((a) => a.file_type.startsWith('VID-final_cut'))
      .slice()
      .sort(compareAssetVersionsNewestFirst);
  }, [isFinalCutCurrent, meta?.data, finalCutAssets?.data]);

  // Warm the cache for every candidate as soon as the viewer has them, so
  // picking one swaps instantly (Director 2026-07-19). Images only — video
  // siblings would mean tens of MB, and their tiles already preload metadata.
  // Declared before the early returns so hook order stays stable.
  useEffect(() => {
    const candidates = [...vidShotSiblings, ...thumbnailSiblings, ...finalCutSiblings];
    for (const c of candidates) {
      const src = resolvePreviewSrc(c);
      if (!src) continue;
      if (/\.(mp4|mov|webm)(\?|$)/i.test(src) || /-VID-/i.test(c.filename ?? '')) continue;
      const img = new window.Image();
      img.decoding = 'async';
      img.src = src;
    }
  }, [vidShotSiblings, thumbnailSiblings, finalCutSiblings]);

  // Fix 3 (Key Art, 2026-07-05): the "Edit plan" affordance opens the linked
  // SPC-thumb_plan (the JSON of 3 concepts) in the shared EditorModal. Declared
  // here (before the early returns) so the hook order stays stable.
  const [planEditorOpen, setPlanEditorOpen] = useState(false);

  if (metaErr) {
    return (
      <div className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--accent-danger)' }}>
        Failed to load asset metadata.
      </div>
    );
  }
  if (!meta?.data) {
    return <p className="text-sm text-text-secondary">Loading…</p>;
  }

  const asset = meta.data;
  const cat = categoryFor(asset.file_type);

  // Fix 3 (Key Art): the thumbnail renderer stamps metadata.plan_asset_id on
  // every IMG-thumbnail variant (thumbnail-renderer.ts). Resolve it so the
  // "Edit plan" button can open the concept plan in the shared EditorModal.
  const thumbPlanAssetIdRaw = (asset.metadata as { plan_asset_id?: unknown } | null)?.plan_asset_id;
  const thumbPlanAssetId =
    isThumbnailCurrent && typeof thumbPlanAssetIdRaw === 'string' ? thumbPlanAssetIdRaw : null;

  // TD-shot-preview L0a (2026-05-26): surface the asset version as a real
  // badge in the drawer header rather than burying "·v01" deep in the
  // meta-row. Closes the audit gap where Director couldn't tell at a
  // glance which version of a shot he was reviewing — relevant whenever a
  // VID-shot has multiple renders (CandidatesStrip lists them; this badge
  // labels the active one in the header itself).
  // 2026-07-15 (Director): an IMG-episode_ref asset carries MULTIPLE attempt images
  // in metadata.shot_reference.generation_history; the ACTIVE one is
  // `selected_version ?? last(generation_history)`. Show "v01.<attempt>" so Director
  // sees at a glance WHICH attempt is on screen / approved (and thus which one the
  // visual critic judged), plus how many attempts exist. Attempt index comes from
  // metadata, NOT the filename (unreliable: a fresh ref's file is "-v01-DRAFT", a
  // hand-picked one is "-attemptN"). Non-EREF assets keep the plain "v01" badge.
  const erefMeta = asset.file_type.startsWith('IMG-episode_ref')
    ? (asset.metadata as {
        shot_reference?: {
          selected_version?: number | null;
          generation_history?: Array<{ version?: number | null }>;
        };
        image_prompt?: { current_version?: number | null };
      } | null)
    : null;
  const shotRef = erefMeta?.shot_reference ?? null;
  const attemptCount = shotRef?.generation_history?.length ?? 0;
  // Active attempt precedence: a manual pick (selected_version) wins; else the
  // attempt the loop shipped (image_prompt.current_version — with keep-best this is
  // the BEST attempt, NOT necessarily the last); else fall back to the last. Shared
  // with the drawer's candidates strip via primaryAttemptVersion so both agree.
  const activeAttempt = shotRef
    ? primaryAttemptVersion(shotRef, erefMeta?.image_prompt?.current_version)
    : null;
  // Compact "v01-N/M" badge (Director 2026-07-16): version-attempt/total, so the
  // active attempt AND how many exist are visible at a glance. Collapses to plain
  // "v01" when there is a single attempt (or a non-EREF asset).
  const versionBase = asset.version ? `v${String(asset.version).padStart(2, '0')}` : null;
  const hasAttempts = attemptCount > 1 && activeAttempt != null;
  const versionLabel = versionBase
    ? hasAttempts
      ? `${versionBase}-${activeAttempt}/${attemptCount}`
      : versionBase
    : null;
  const versionTitle = versionLabel
    ? hasAttempts
      ? `Asset ${versionBase} · attempt ${activeAttempt} of ${attemptCount}`
      : `Asset version ${versionLabel}`
    : '';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-text-muted">
        {/* Strip the frozen status token from the filename: it is baked in at
            creation and NOT updated on demotion, so "…-v02-APPROVED.mp4" can lie
            when the DB status is INVALIDATED. Trust the live status badge below. */}
        <span className="text-text-primary font-medium font-mono">
          {asset.filename.replace(/-(DRAFT|REVIEW|REVISION|APPROVED|LOCKED)(\.[^.]+)$/i, '$2')}
        </span>
        {versionLabel && (
          <span
            className="inline-flex items-center px-1.5 h-5 rounded-full text-[10px] font-semibold font-mono leading-none border"
            style={{
              background: 'color-mix(in oklab, var(--accent-primary) 14%, transparent)',
              color: 'var(--accent-primary)',
              borderColor: 'color-mix(in oklab, var(--accent-primary) 30%, transparent)',
            }}
            title={versionTitle}
          >
            {versionLabel}
          </span>
        )}
        <span>{asset.status}</span>
        <span>·</span>
        <span>{asset.file_type}</span>
        {asset.agent_id && (
          <>
            <span>·</span>
            <span title={asset.agent_id}>{agentDisplayName(asset.agent_id)}</span>
          </>
        )}
      </div>
      {asset.description && (
        <div
          className="text-xs px-3 py-2 rounded-lg border leading-relaxed font-mono"
          style={{
            background: 'var(--accent-success-bg, rgba(34, 197, 94, 0.08))',
            color: 'var(--accent-success, rgb(34, 197, 94))',
            borderColor: 'var(--accent-success, rgba(34, 197, 94, 0.3))',
          }}
          title="Production trace — contract, model, cost, tokens"
        >
          ⚙ {asset.description}
        </div>
      )}

      <CanonExtensionsForAsset asset={asset} />

      {/* Animatic-stage demotion (2026-07-09): the standalone slideshow player is
          gone. The animatic (EDL) lives ON the Episode Timeline — the single
          surface for pacing review, the duration editor, and the "Start Video"
          latch. Point there instead of duplicating the player in this drawer. */}
      {asset.file_type.startsWith('VID-animatic') ? (
        <div
          className="rounded-lg p-3 border border-dashed border-glass text-xs text-text-muted"
          style={{ background: 'color-mix(in oklab, var(--accent-primary) 6%, transparent)' }}
        >
          Аниматик (EDL) живёт на таймлайне эпизода — там пейсинг-обзор, редактор
          длительности кадров и кнопка «Старт видео».
        </div>
      ) : (
        <>
          {cat === 'text' &&
            (isShotPlan(asset.file_type) ? (
              <ShotPlanContract
                assetId={asset.id}
                status={asset.status}
                episodeId={asset.episode_id}
                shotId={shotIdForPlan(asset.file_type, asset.metadata)}
                onChanged={() => {
                  void mutate();
                  onAssetChanged?.();
                }}
              />
            ) : (
              <TextBody assetId={asset.id} />
            ))}
          {cat === 'image' && <ImageBody asset={asset} />}
          {/* VID-shot has its own player inside VGENShotPanel — skip the
              generic VideoBody to avoid rendering the mp4 twice. */}
          {cat === 'video' && !asset.file_type.startsWith('VID-shot') && (
            <VideoBody asset={asset} />
          )}
          {cat === 'audio' && <AudioBody asset={asset} />}
        </>
      )}
      {cat === 'unknown' && (
        <FallbackBody
          message={`Preview unavailable for file type "${asset.file_type}". Download to inspect.`}
          drivePath={asset.drive_path}
        />
      )}
      {/* AUD-music: Director affordances — Upload own track + Re-fire MGEN.
          Closes the regression from Phase A.2 PR γ (LT-04, 2026-05-08): after
          MGEN moved BEFORE animatic, the only Upload button lived inside
          AnimaticPlayer, which doesn't render until the animatic exists.
          Director ended up in the composer preview seeing a mock track with
          no affordance to replace it. These two buttons restore the path. */}
      {asset.file_type.startsWith('AUD-music') && asset.status !== 'LOCKED' && (
        <MGENActionsBlock
          assetId={asset.id}
          episodeId={asset.episode_id}
          onChanged={() => {
            void mutate();
            onAssetChanged?.();
          }}
        />
      )}
      {/* Composer Approve (2026-07-11, Director): AUD-music was structurally
          excluded from the approve control (isApprovableText gates on the text
          category), so a generated/uploaded track had no Approve affordance in
          the Composer — the Director had to upload-to-force-approve or use the
          timeline Replace button. Reuse PilotApproveButtons here; approving fires
          computeNextEvents' new AUD-music branch which bakes the track into the
          animatic audio_tracks[], so it flows to the timeline automatically. */}
      {asset.file_type.startsWith('AUD-music') && (
        <>
          {(asset.status === 'DRAFT' ||
            asset.status === 'REVIEW' ||
            asset.status === 'REVISION' ||
            asset.status === 'INVALIDATED') && (
            <PilotApproveButtons
              assetId={asset.id}
              variant="review"
              onChanged={() => {
                void mutate();
                onAssetChanged?.();
              }}
            />
          )}
          {asset.status === 'APPROVED' && (
            <PilotApproveButtons
              assetId={asset.id}
              variant="approved"
              onChanged={() => {
                void mutate();
                onAssetChanged?.();
              }}
            />
          )}
        </>
      )}

      {/* Image asset (SBL-* / IMG-*): Director affordance — manual upload.
          Closes Director's 2026-05-20 gap: "почему в превью нет опции
          загрузить вручную". Useful when Director has a hand-made ref
          (designed externally) and wants to skip gpt-image-2 generation.
          Status stays as-is — upload is not implicit approval. */}
      {(asset.file_type.startsWith('SBL-') || asset.file_type.startsWith('IMG-')) &&
        asset.status !== 'LOCKED' && (
          <ImageUploadBlock
            assetId={asset.id}
            filename={asset.filename}
            onChanged={() => {
              void mutate();
              onAssetChanged?.();
            }}
          />
        )}

      {/* Fix 1b (Key Art, 2026-07-05): IMG-thumbnail is a "pick 1 of 3
          concepts" slot — surface every concept like VID-shot candidates so
          Director sees all of them and picks one (pipeline-stages otherwise
          exposes only the latest v03). Approving one → single-approved
          invalidates the others → ONE publish (atomic EXEC-PUB claim), which
          is why this drawer path is safer than the kebab (that fired 3 approves
          at once). Reuses CandidatesStrip + PilotApproveButtons; strip
          self-hides when ≤1. Mirrors the VID-shot branch: REVIEW/INVALIDATED →
          Approve/Reject, APPROVED → Send to revision. */}
      {isThumbnailCurrent && (
        <>
          <CandidatesStrip
            currentAssetId={asset.id}
            label={`Key Art concepts (${thumbnailSiblings.length})`}
            candidates={thumbnailSiblings.map((a) => ({
              id: a.id,
              filename: a.filename,
              status: a.status,
              staging_path: a.staging_path,
              drive_path: a.drive_path,
              drive_web_view_url: a.drive_web_view_url,
              metadata: a.metadata as never,
            }))}
            onPick={(id) => onPickAsset?.(id)}
          />
          {(asset.status === 'REVIEW' || asset.status === 'INVALIDATED') && (
            <PilotApproveButtons
              assetId={asset.id}
              variant="review"
              onChanged={() => {
                void mutate();
                onAssetChanged?.();
              }}
            />
          )}
          {asset.status === 'APPROVED' && (
            <PilotApproveButtons
              assetId={asset.id}
              variant="approved"
              onChanged={() => {
                void mutate();
                onAssetChanged?.();
              }}
            />
          )}
          {/* Fix 3 (Key Art, q10 = plan + upload): Edit the concept plan.
              Opens the linked SPC-thumb_plan (JSON of the 3 concepts) in the
              shared EditorModal. When the plan is APPROVED the modal is
              read-only and tells the Director to request revision first; the
              image-upload path is the ImageUploadBlock above. Re-approving the
              edited plan re-renders the variants via computeNextEvents. */}
          {thumbPlanAssetId && (
            <div className="flex items-center gap-2 pt-2 border-t border-glass">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPlanEditorOpen(true)}
                title="Open the Key Art concept plan (SPC-thumb_plan) to view or edit the 3 concepts"
              >
                <Pencil size={12} /> Edit plan
              </Button>
              <span className="text-[11px] text-text-muted">
                Edit the concept JSON, then re-approve the plan to re-render the variants.
              </span>
            </div>
          )}
        </>
      )}

      {/* Online Editor VID-final_cut (2026-07-11, Director): version picker +
          approve in the drawer, so the final cut is reviewed/approved here
          instead of via the kebab "all". The video plays via VideoBody above
          (video category, not VID-shot). Reuses CandidatesStrip +
          PilotApproveButtons — same shape as the VID-shot branch below. */}
      {isFinalCutCurrent && (
        <>
          <CandidatesStrip
            currentAssetId={asset.id}
            label={`Final cut versions (${finalCutSiblings.length})`}
            candidates={finalCutSiblings.map((a) => ({
              id: a.id,
              filename: a.filename,
              status: a.status,
              staging_path: a.staging_path,
              drive_path: a.drive_path,
              drive_web_view_url: a.drive_web_view_url,
              metadata: a.metadata as never,
            }))}
            onPick={(id) => onPickAsset?.(id)}
          />
          {(asset.status === 'REVIEW' ||
            asset.status === 'REVISION' ||
            asset.status === 'DRAFT' ||
            asset.status === 'INVALIDATED') && (
            <PilotApproveButtons
              assetId={asset.id}
              variant="review"
              onChanged={() => {
                void mutate();
                onAssetChanged?.();
              }}
            />
          )}
          {asset.status === 'APPROVED' && (
            <PilotApproveButtons
              assetId={asset.id}
              variant="approved"
              onChanged={() => {
                void mutate();
                onAssetChanged?.();
              }}
            />
          )}
          {/* Video → Shorts slicer — cut a 9:16 short from this final cut. */}
          <ShortsPanel assetId={asset.id} />
        </>
      )}

      {/* VGEN VID-shot: show Universal Core controls + per-shot approve/reject
          so Director can act on a shot from the activity feed Preview drawer
          and the EpisodeTimeline "Open shot →" link. Regenerate creates a NEW
          asset row (does NOT mutate the canonical), so any non-LOCKED state can
          re-generate to try a new variant. The cell-resolver picks the latest
          per shot_id (directive #6 fast iteration). */}
      {asset.file_type.startsWith('VID-shot') && (
        <>
          <VGENShotSection
            assetId={asset.id}
            episodeId={asset.episode_id}
            filename={asset.filename}
            metadata={asset.metadata}
            drivePath={asset.drive_path}
            driveWebViewUrl={asset.drive_web_view_url}
            stagingPath={asset.staging_path}
            editable={asset.status !== 'LOCKED'}
            onChanged={() => {
              void mutate();
              onAssetChanged?.();
            }}
            onRegenerated={onRegenerated}
          />
          {/* TD-43 (2026-05-24): version-picker — Director can switch between
              VID-shot versions for the same shot_id (e.g. legacy v01 vs
              plan-driven v02). Self-hides when ≤1 candidate. Clicks navigate
              the parent's previewAssetId state via onPickAsset. */}
          <CandidatesStrip
            currentAssetId={asset.id}
            candidates={vidShotSiblings.map((a) => ({
              id: a.id,
              filename: a.filename,
              status: a.status,
              staging_path: a.staging_path,
              drive_path: a.drive_path,
              drive_web_view_url: a.drive_web_view_url,
              metadata: a.metadata as never,
            }))}
            onPick={(id) => onPickAsset?.(id)}
          />
          {(asset.status === 'REVIEW' || asset.status === 'INVALIDATED') && (
            // INVALIDATED = a version auto-superseded by a sibling's approval.
            // Director can re-pick it: "Approve" makes THIS version win (the
            // current winner is demoted), "Reject" sends it to REVISION. (q13)
            <PilotApproveButtons
              assetId={asset.id}
              variant="review"
              onChanged={() => {
                void mutate();
                onAssetChanged?.();
              }}
            />
          )}
          {asset.status === 'APPROVED' && (
            <PilotApproveButtons
              assetId={asset.id}
              variant="approved"
              onChanged={() => {
                void mutate();
                onAssetChanged?.();
              }}
            />
          )}
        </>
      )}

      {/* TD-84: Shot Plan approve/revise — same shared buttons as VID-shot.
          REVIEW/REVISION → Approve (auto-fires plan-driven VGEN) or send to
          revision; APPROVED → demote to REVISION so the Director can edit the
          plan (content route forbids editing APPROVED). */}
      {isShotPlan(asset.file_type) && (
        <>
          {(asset.status === 'REVIEW' || asset.status === 'REVISION') && (
            <PilotApproveButtons
              assetId={asset.id}
              variant="review"
              onChanged={() => {
                void mutate();
                onAssetChanged?.();
              }}
            />
          )}
          {asset.status === 'APPROVED' && (
            <PilotApproveButtons
              assetId={asset.id}
              variant="approved"
              onChanged={() => {
                void mutate();
                onAssetChanged?.();
              }}
            />
          )}
        </>
      )}
      {/* F-preview (2026-07-01): generalized approve control for ALL approvable
          text assets (script, storyboard, review docs, SPC specs incl. cast /
          metadata / copy / thumb_plan / ref_plan). Subsumes the earlier
          casting-only branch. VID-shot and shot_plan keep their own branches
          above (special UI). Generic POST /api/assets/[id]/approve handles all
          of these. */}
      {isApprovableText(asset.file_type) && (
        <>
          {(asset.status === 'REVIEW' || asset.status === 'REVISION') && (
            <PilotApproveButtons
              assetId={asset.id}
              variant="review"
              onChanged={() => {
                void mutate();
                onAssetChanged?.();
              }}
            />
          )}
          {asset.status === 'APPROVED' && (
            <PilotApproveButtons
              assetId={asset.id}
              variant="approved"
              onChanged={() => {
                void mutate();
                onAssetChanged?.();
              }}
            />
          )}
        </>
      )}
      <DriveBadge asset={asset} />

      {thumbPlanAssetId && (
        <EditorModal
          open={planEditorOpen}
          onClose={() => setPlanEditorOpen(false)}
          assetId={thumbPlanAssetId}
          onSaved={() => {
            void mutate();
            onAssetChanged?.();
          }}
        />
      )}
    </div>
  );
}

function PilotApproveButtons({
  assetId,
  variant,
  onChanged,
}: {
  assetId: string;
  /**
   * `review`   — REVIEW asset: Approve → APPROVED, "Send to revision" → REVISION.
   * `approved` — APPROVED asset: "Send to revision" only — demotes APPROVED to
   *              REVISION so Director can revoke a too-eager approval and regen.
   *
   * REJECT decision is intentionally not exposed: the FSM forbids
   * APPROVED→REJECTED, and REVISION is the ergonomic state for "not happy,
   * please redo". REJECTED is reserved for upstream pipeline failures.
   */
  variant: 'review' | 'approved';
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<null | 'approve' | 'revise'>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy('approve');
    setError(null);
    try {
      const res = await fetch(`/api/assets/${assetId}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decision: 'APPROVE',
          directorConfirm: true,
          preview_acknowledged: true,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'APPROVE failed');
      }
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function requestRevision() {
    const defaultNote =
      variant === 'approved'
        ? 'Director revoked approval — please regenerate'
        : 'Please regenerate with adjusted settings';
    const note = typeof window !== 'undefined'
      ? window.prompt('Reason for sending back to revision?', defaultNote)
      : defaultNote;
    if (note === null) return; // user cancelled prompt
    const trimmed = note.trim().length > 0 ? note.trim() : defaultNote;
    setBusy('revise');
    setError(null);
    try {
      const res = await fetch(`/api/assets/${assetId}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decision: 'REQUEST_REVISION',
          note: trimmed,
          directorConfirm: true,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'REVISION failed');
      }
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2 pt-2 border-t border-glass">
      {variant === 'review' && (
        <Button
          size="sm"
          variant="primary"
          onClick={approve}
          disabled={busy !== null}
        >
          {busy === 'approve' ? 'Approving…' : 'Approve'}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={requestRevision}
        disabled={busy !== null}
        title={
          variant === 'approved'
            ? 'Demote this APPROVED shot to REVISION so Director can regenerate'
            : 'Send shot back to REVISION'
        }
      >
        {busy === 'revise'
          ? 'Sending…'
          : variant === 'approved' ? 'Send to revision' : 'Reject'}
      </Button>
      {error && (
        <span className="text-[11px]" style={{ color: 'var(--accent-danger)' }}>
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * ShortsPanel — the "Cut a short" tool under a VID-final_cut drawer. TWO explicit
 * steps (2026-07-24, E15 «Автомойка» incident): (1) "Cut a short" center-crops the
 * widescreen final cut to 9:16 (+ optional overlay / trim) and MATERIALIZES it as a
 * VID-short asset with a preview player — nothing is uploaded; (2) "Upload short" sends
 * the previewed cut to the Shorts channel. Both hit POST /api/assets/[id]/shorts with an
 * `action` discriminator, reusing the SAME server `makeShort` + `persistBinary` +
 * `uploadVideo` as the batch (no parallel machinery). The preview between the two clicks
 * is the check that a broken cut can't fly to the channel unseen.
 *
 * This is the MANUAL repurposing tool (cut a short from an existing episode). Auto
 * distribution of shorts-configured episodes is untouched — those publish their final cut
 * via the normal EXEC-PUB path on approval. Backlog `backlog_shorts_ui_slicer` realised
 * (2026-07-12); split into cut/upload 2026-07-24. Unlisted is the default privacy: the
 * youtube.upload scope can't delete, so public is a deliberate choice.
 */
function ShortsPanel({ assetId }: { assetId: string }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [overlay, setOverlay] = useState(true);
  const [overlayText, setOverlayText] = useState('SANDY the HOURGLASS');
  const [privacy, setPrivacy] = useState<'private' | 'unlisted' | 'public'>('unlisted');
  const [busy, setBusy] = useState<null | 'cut' | 'upload'>(null);
  const [error, setError] = useState<string | null>(null);
  // The cut (not yet uploaded) short.
  const [shortAssetId, setShortAssetId] = useState<string | null>(null);
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{ url: string; privacyStatus: string } | null>(null);

  async function cut() {
    setBusy('cut');
    setError(null);
    setUploaded(null);
    setShortAssetId(null);
    setShortUrl(null);
    try {
      const startSec = start.trim() ? Number(start) : undefined;
      const endSec = end.trim() ? Number(end) : undefined;
      if (startSec != null && Number.isNaN(startSec)) throw new Error('Start must be a number');
      if (endSec != null && Number.isNaN(endSec)) throw new Error('End must be a number');
      const res = await fetch(`/api/assets/${assetId}/shorts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          startSec,
          endSec,
          overlay,
          overlayText,
          privacyStatus: privacy,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !(j as { success?: boolean }).success) {
        throw new Error((j as { error?: string }).error ?? 'Cut failed');
      }
      const data = (j as { data: { shortAssetId: string; browserUrl: string } }).data;
      setShortAssetId(data.shortAssetId);
      setShortUrl(data.browserUrl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function upload() {
    if (!shortAssetId) return;
    setBusy('upload');
    setError(null);
    try {
      const res = await fetch(`/api/assets/${shortAssetId}/shorts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'upload', privacyStatus: privacy }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !(j as { success?: boolean }).success) {
        throw new Error((j as { error?: string }).error ?? 'Upload failed');
      }
      setUploaded((j as { data: { url: string; privacyStatus: string } }).data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="px-3 py-3 rounded-lg border border-glass space-y-2 mt-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text-primary">🩳 Cut a short (9:16)</span>
        <span className="text-[10px] text-text-muted">center-crop · preview → upload</span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-text-muted">
        <label className="flex items-center gap-1">
          Start
          <input
            value={start}
            onChange={(e) => setStart(e.target.value)}
            placeholder="0"
            inputMode="decimal"
            className="w-14 px-2 py-1 rounded border border-glass bg-transparent"
          />
        </label>
        <label className="flex items-center gap-1">
          End
          <input
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            placeholder="end"
            inputMode="decimal"
            className="w-14 px-2 py-1 rounded border border-glass bg-transparent"
          />
        </label>
        <span>sec — blank = whole clip</span>
      </div>
      <label className="flex items-center gap-2 text-[11px] text-text-muted">
        <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />
        Overlay
        <input
          value={overlayText}
          onChange={(e) => setOverlayText(e.target.value)}
          disabled={!overlay}
          className="flex-1 px-2 py-1 rounded border border-glass bg-transparent disabled:opacity-40"
        />
      </label>
      <div className="flex items-center gap-2 text-[11px] text-text-muted">
        <label className="flex items-center gap-1">
          Privacy
          <select
            value={privacy}
            onChange={(e) => setPrivacy(e.target.value as 'private' | 'unlisted' | 'public')}
            className="px-2 py-1 rounded border border-glass bg-transparent"
          >
            <option value="private">private</option>
            <option value="unlisted">unlisted</option>
            <option value="public">public</option>
          </select>
        </label>
        {/* Step 1 — cut the short into a VID-short asset (no upload). */}
        <Button size="sm" variant="primary" onClick={cut} disabled={busy !== null}>
          {busy === 'cut' ? 'Cutting…' : shortAssetId ? 'Re-cut short' : 'Cut a short'}
        </Button>
      </div>

      {/* Step 2 — preview + upload, once a short is cut. */}
      {shortAssetId && shortUrl && (
        <div className="space-y-2 pt-1">
          <video
            controls
            src={shortUrl}
            className="w-full max-h-96 rounded border border-glass bg-black"
          />
          <div className="text-[11px] text-text-muted">
            Short saved as an asset — preview it, then upload to the Shorts channel.
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={upload}
            disabled={busy !== null}
            title="Upload this short to the Shorts channel"
          >
            {busy === 'upload' ? 'Uploading…' : '📤 Upload short'}
          </Button>
        </div>
      )}

      {uploaded && (
        <a
          href={uploaded.url}
          target="_blank"
          rel="noreferrer"
          className="block text-[11px] underline"
          style={{ color: 'var(--accent-success)' }}
        >
          ✅ {uploaded.privacyStatus} → {uploaded.url}
        </a>
      )}
      {error && (
        <span className="block text-[11px]" style={{ color: 'var(--accent-danger)' }}>
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * MGENActionsBlock — Director affordances for AUD-music assets.
 *
 * Two actions:
 *  1. Upload own .mp3 / .wav → replaces asset binary via /upload-music-direct.
 *     Asset status stays REVIEW (or current) so Director still has to APPROVE
 *     separately. Uploaded flag is recorded in metadata.uploaded_by_director.
 *  2. Re-fire EXEC-MGEN → POSTs /api/episodes/[id]/trigger with EXEC-MGEN.
 *     Current provider is mock (no Suno wired); an informational chip
 *     advertises this.
 *
 * Mounted under any AUD-music asset preview that is not LOCKED.
 *
 * Why this exists: after the Phase A.2 audio reorg (LT-04, 2026-05-08),
 * music gen runs BEFORE animatic, so the legacy Upload button inside
 * AnimaticPlayer became unreachable for fresh episodes. Director observed:
 * «зашёл в композер, зашёл в превью, вижу там ничего нет. ожидаю Загрузить
 * или Запустить генерацию.» — these two buttons close that gap.
 */
function MGENActionsBlock({
  assetId,
  episodeId,
  onChanged,
}: {
  assetId: string;
  episodeId: string | null;
  onChanged: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<null | 'upload' | 'generate'>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File): Promise<void> {
    setBusy('upload');
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/assets/${assetId}/upload-music-direct`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Upload failed');
      }
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerate(): Promise<void> {
    if (!episodeId) {
      setError('No episode_id on this asset — cannot re-trigger EXEC-MGEN');
      return;
    }
    setBusy('generate');
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/trigger`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentCode: 'EXEC-MGEN',
          reason: 'Director re-fired EXEC-MGEN from composer preview',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Trigger failed');
      }
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 pt-2 border-t border-glass">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy !== null}
        >
          {busy === 'upload' ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <Upload size={12} /> Upload track
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleGenerate}
          disabled={busy !== null || !episodeId}
          title={
            episodeId
              ? 'Re-fire EXEC-MGEN — currently mock provider (Suno not wired)'
              : 'No episode_id on this asset'
          }
        >
          {busy === 'generate' ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Triggering…
            </>
          ) : (
            <>
              <Sparkles size={12} /> Run generation
            </>
          )}
        </Button>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wider"
          style={{
            background: 'color-mix(in oklab, var(--text-muted) 12%, transparent)',
            color: 'var(--text-muted)',
          }}
          title="Suno / Beatoven not wired yet — generation produces mock output. Upload works fully."
        >
          mock
        </span>
      </div>
      <p className="text-[11px] text-text-muted">
        Upload your own .mp3 / .wav to replace the track, or re-fire generation.
        A manual upload is auto-approved and advances the pipeline.
      </p>
      {error && (
        <span className="text-[11px]" style={{ color: 'var(--accent-danger)' }}>
          {error}
        </span>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/**
 * ImageUploadBlock — Director affordance for SBL-* / IMG-* image assets.
 *
 * Single action: upload your own PNG / JPG / WebP → replaces asset binary
 * via /api/assets/[id]/upload-image-direct. Status stays as-is (typically
 * DRAFT or REVIEW) — upload is not implicit approval. The uploaded image
 * is appended to metadata.image_prompt.history with source='director_upload'
 * so the rollback ladder in /regenerate-image still works.
 *
 * Mounted under any image asset preview that is not LOCKED. Closes
 * Director's 2026-05-20 finding "в превью нет опции загрузить вручную".
 */
function ImageUploadBlock({
  assetId,
  filename,
  onChanged,
}: {
  assetId: string;
  filename: string;
  onChanged: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      // TD-20.B 2026-05-20 — use existing /api/assets/[id]/upload which
      // accepts image/video/audio MIMEs and writes via logEvent. The
      // standalone /upload-image-direct route that briefly existed was
      // a duplicate of this path and was removed in the same commit.
      const res = await fetch(`/api/assets/${assetId}/upload`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Upload failed');
      }
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 pt-2 border-t border-glass">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          title={`Replace image binary for ${filename}`}
        >
          {busy ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <Upload size={12} /> Upload image
            </>
          )}
        </Button>
      </div>
      <p className="text-[11px] text-text-muted">
        Upload your own PNG / JPG / WebP to replace the reference. Status stays as-is — approve below when ready. Appended to image_prompt history with source=director_upload.
      </p>
      {error && (
        <span className="text-[11px]" style={{ color: 'var(--accent-danger)' }}>
          {error}
        </span>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function DriveBadge({ asset }: { asset: AssetRow }) {
  if (asset.drive_file_id && asset.drive_web_view_url) {
    return (
      <a
        href={asset.drive_web_view_url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-[11px] hover:underline"
        style={{ color: 'var(--accent-success)' }}
      >
        <ExternalLink size={11} />
        Backed up to Google Drive — open in Drive
      </a>
    );
  }
  // Show this hint only for binary types. Text assets live in the DB column.
  const cat = categoryFor(asset.file_type);
  if (cat === 'image' || cat === 'video' || cat === 'audio') {
    return (
      <div
        className="inline-flex items-center gap-1.5 text-[11px]"
        style={{ color: 'var(--text-muted)' }}
        title="Switch storage provider to drive_native in Settings → Providers to back up new assets to Drive."
      >
        <CloudOff size={11} />
        Local cache only — Drive storage off
      </div>
    );
  }
  return null;
}

function TextBody({ assetId }: { assetId: string }) {
  const { data, error } = useSWR<{ data: { content: string } }>(
    `/api/assets/${assetId}/content`,
    fetcher,
  );
  if (error) {
    return (
      <div className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--accent-danger)' }}>
        {(error as Error).message}
      </div>
    );
  }
  if (!data?.data) return <p className="text-sm text-text-secondary">Loading content…</p>;
  const content = data.data.content;
  if (!content) {
    return (
      <p className="text-sm text-text-secondary italic">
        Asset has no content yet (may be pre-migration 0013 or pending generation).
      </p>
    );
  }
  return (
    <article
      className="markdown-body px-4 py-3 rounded-lg border border-glass leading-relaxed text-sm text-text-primary"
      style={{ background: 'var(--bg-elevated)' }}
    >
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-semibold mt-1 mb-2 text-text-primary">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold mt-3 mb-1.5 text-text-primary">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold mt-2.5 mb-1 text-text-primary">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="mb-2 text-text-secondary leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => <ul className="list-disc ml-5 mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal ml-5 mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="text-text-secondary">{children}</li>,
          code: ({ children }) => (
            <code
              className="px-1 py-0.5 rounded text-[12px] font-mono"
              style={{ background: 'var(--panel-hover-bg)' }}
            >
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre
              className="p-3 rounded-lg overflow-x-auto text-[12px] mb-2"
              style={{ background: 'var(--panel-hover-bg)' }}
            >
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className="pl-3 border-l-2 italic mb-2"
              style={{ borderColor: 'var(--accent-info)', color: 'var(--text-muted)' }}
            >
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-glass" />,
        }}
      >
        {withHardBreaks(content)}
      </ReactMarkdown>
    </article>
  );
}

function ImageBody({ asset }: { asset: AssetRow }) {
  const previewSrc = resolvePreviewSrc(asset);
  if (!previewSrc) {
    return (
      <FallbackBody
        message="Mock image — no browser-loadable URL. Switch the image provider to gpt-image-1 in Settings → Providers and re-trigger to see a real preview."
        drivePath={asset.drive_path}
      />
    );
  }
  return (
    <div
      className="rounded-lg overflow-hidden border border-glass"
      style={{ background: 'var(--bg-elevated)' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewSrc}
        alt={asset.filename}
        className="w-full h-auto block"
      />
    </div>
  );
}

function VideoBody({ asset }: { asset: AssetRow }) {
  const previewSrc = resolvePreviewSrc(asset);
  if (!previewSrc) {
    return (
      <FallbackBody
        message="Mock video — no browser-loadable URL. Switch the video provider to a real one and re-trigger."
        drivePath={asset.drive_path}
      />
    );
  }
  return (
    <video
      key={previewSrc}
      src={previewSrc}
      controls
      className="w-full rounded-lg border border-glass"
      style={{ background: 'var(--bg-elevated)' }}
    />
  );
}

function AudioBody({ asset }: { asset: AssetRow }) {
  const previewSrc = resolvePreviewSrc(asset);
  if (!previewSrc) {
    return (
      <FallbackBody
        message="Mock audio — no browser-loadable URL."
        drivePath={asset.drive_path}
      />
    );
  }
  // `key={previewSrc}` forces React to unmount + remount the <audio> element
  // when the URL changes (e.g. after Director uploads a replacement track via
  // /upload-music-direct). Without the key, React reuses the same DOM node
  // and the browser audio engine keeps streaming the previously-buffered
  // file — Director sees "version did not change" even though the asset row
  // updated. 2026-05-13 evening regression report.
  return (
    <audio
      key={previewSrc}
      src={previewSrc}
      controls
      className="w-full"
    />
  );
}

function FallbackBody({
  message,
  drivePath,
}: {
  message: string;
  drivePath: string | null;
}) {
  return (
    <div
      className="px-3 py-3 rounded-lg border border-glass space-y-2"
      style={{ background: 'var(--bg-elevated)' }}
    >
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <FileWarning size={14} />
        <span>{message}</span>
      </div>
      {drivePath && (
        <div className="text-[11px] text-text-muted font-mono break-all">{drivePath}</div>
      )}
      {drivePath && isHttpishUrl(drivePath) && (
        <a
          href={drivePath}
          download
          className="inline-flex items-center gap-1.5 text-xs text-text-primary hover:underline"
        >
          <Download size={12} /> Download
        </a>
      )}
    </div>
  );
}

function CanonExtensionsForAsset({ asset }: { asset: AssetRow }) {
  // Look up unresolved canon_extension_proposed event for this asset.
  const { data, error, mutate } = useSWR<{
    data: CanonExtensionEvent[];
  }>(`/api/activity?asset_id=${asset.id}&type=canon_extension_proposed&unresolved=true`, fetcher);

  if (error || !data?.data) return null;
  const event = data.data[0];
  if (!event || event.resolved_at) return null;

  // Resolve series_id: prefer asset.series_id (Bible asset), else fall back
  // to the episode's series via API. For canon-extension events the asset is
  // the producing agent's output (REV-world_check, etc.) — series_id is on
  // the parent episode, surfaced via /api/episodes/[id].
  const seriesId = asset.series_id;
  const proposals: CanonExtensionProposal[] = Array.isArray(event.metadata?.proposals)
    ? event.metadata!.proposals!
    : [];
  if (proposals.length === 0) return null;
  if (!seriesId) {
    return (
      <CanonExtensionsWithEpisode
        episodeId={asset.episode_id ?? null}
        eventId={event.id}
        proposals={proposals}
        onResolved={() => mutate()}
      />
    );
  }
  return (
    <CanonExtensionsPanel
      proposals={proposals}
      eventId={event.id}
      seriesId={seriesId}
      onResolved={() => mutate()}
    />
  );
}

function CanonExtensionsWithEpisode({
  episodeId,
  eventId,
  proposals,
  onResolved,
}: {
  episodeId: string | null;
  eventId: string;
  proposals: CanonExtensionProposal[];
  onResolved: () => void;
}) {
  const { data: epData } = useSWR<{ data: { episode: { series_id: string | null } } }>(
    episodeId ? `/api/episodes/${episodeId}` : null,
    fetcher,
  );
  const seriesId = epData?.data?.episode?.series_id;
  if (!seriesId) {
    return (
      <div
        className="text-xs px-3 py-2 rounded-lg border"
        style={{ borderColor: 'var(--border-glass)', color: 'var(--text-muted)' }}
      >
        Bible extensions found, but the parent series is unresolved — cannot create Bible drafts.
      </div>
    );
  }
  return (
    <CanonExtensionsPanel
      proposals={proposals}
      eventId={eventId}
      seriesId={seriesId}
      onResolved={onResolved}
    />
  );
}
