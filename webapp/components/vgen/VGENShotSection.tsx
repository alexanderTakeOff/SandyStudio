// ──────────────────────────────────────────────────────────────────────────────
// components/vgen/VGENShotSection.tsx
// Glue between EpisodeAssetDrawer and VGENShotPanel.
//
// The drawer is already >800 lines from EREF v2 work. This thin section keeps
// the drawer's branch on `file_type === 'VID-shot'` minimal — it owns nothing
// except deriving Universal Core settings from VID-shot metadata and choosing
// the best browser-loadable mp4 URL.
//
// Track A's contract for VID-shot metadata (per plan):
//   { shot_id, aspect_ratio, quality_tier, duration_seconds,
//     reference_eref_asset_id, prompt?, storyboard_shot?, vgen_settings? }
//
// We accept a few historical aliases so older asset rows keep working:
//   - reference_asset_id   (alias of reference_eref_asset_id)
//   - vgen_settings.{...}  (nested settings dict, takes precedence)
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useMemo } from 'react';
import {
  VGENShotPanel,
  type AspectRatio,
  type QualityTier,
  type VGENShotPanelSettings,
  type VGENShotPanelStoryboardShot,
} from './VGENShotPanel';

interface VidShotMetadataLoose {
  shot_id?: string;
  storyboard_shot?: VGENShotPanelStoryboardShot;
  aspect_ratio?: string;
  quality_tier?: string;
  duration_seconds?: number;
  reference_eref_asset_id?: string;
  reference_asset_id?: string;
  prompt?: string;
  vgen_settings?: Partial<VGENShotPanelSettings> & { reference_eref_asset_id?: string };
}

export interface VGENShotSectionProps {
  assetId: string;
  filename: string;
  metadata?: unknown;
  drivePath: string | null;
  driveWebViewUrl: string | null;
  stagingPath: string | null;
  editable: boolean;
  onChanged: () => void;
  /** See VGENShotPanelProps.onRegenerated. */
  onRegenerated?: (shotId: string, newAssetId: string) => void;
}

function pickAspect(value: unknown): AspectRatio {
  if (value === '16:9' || value === '9:16' || value === '1:1') return value;
  return '16:9';
}

function pickQuality(value: unknown): QualityTier {
  if (value === 'fast' || value === 'standard') return value;
  return 'fast';
}

export function VGENShotSection({
  assetId,
  filename,
  metadata,
  drivePath,
  driveWebViewUrl,
  stagingPath,
  editable,
  onChanged,
  onRegenerated,
}: VGENShotSectionProps) {
  const { storyboardShot, currentSettings } = useMemo(() => {
    const m = (metadata ?? {}) as VidShotMetadataLoose;
    const settings = m.vgen_settings ?? {};
    const aspect = pickAspect(settings.aspect_ratio ?? m.aspect_ratio);
    const quality = pickQuality(settings.quality_tier ?? m.quality_tier);
    const duration =
      typeof settings.duration_seconds === 'number'
        ? settings.duration_seconds
        : typeof m.duration_seconds === 'number'
          ? m.duration_seconds
          : 4;
    const refId =
      settings.reference_asset_id ??
      settings.reference_eref_asset_id ??
      m.reference_asset_id ??
      m.reference_eref_asset_id ??
      '';
    const prompt = settings.prompt ?? m.prompt ?? '';
    const shotId = m.storyboard_shot?.shot_id ?? m.shot_id ?? filename;
    const stub: VGENShotPanelStoryboardShot = m.storyboard_shot ?? { shot_id: shotId };
    const cs: VGENShotPanelSettings = {
      prompt,
      aspect_ratio: aspect,
      quality_tier: quality,
      duration_seconds: duration,
      reference_asset_id: refId,
    };
    return { storyboardShot: stub, currentSettings: cs };
  }, [metadata, filename]);

  // Best-available mp4 URL — prefer Drive (signed), fall back to staging.
  const videoUrl = drivePath ?? driveWebViewUrl ?? stagingPath ?? null;

  return (
    <VGENShotPanel
      assetId={assetId}
      videoUrl={videoUrl}
      storyboardShot={storyboardShot}
      currentSettings={currentSettings}
      onChanged={onChanged}
      readOnly={!editable}
    />
  );
}
