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
  type VgenProvider,
} from './VGENShotPanel';
import type { VideoResolution } from '@/lib/api/provider-capabilities';

interface VidShotMetadataLoose {
  shot_id?: string;
  storyboard_shot?: VGENShotPanelStoryboardShot;
  aspect_ratio?: string;
  quality_tier?: string;
  duration_seconds?: number;
  reference_eref_asset_id?: string;
  reference_asset_id?: string;
  prompt?: string;
  /** Phase 2 — provider id stamped by runner / regenerate-video. */
  provider_id?: string;
  /** TD-85 — resolution the render actually used (stamped by runner /
   *  regenerate-video). Seeds the panel selector. */
  resolution?: string;
  vgen_settings?: Partial<VGENShotPanelSettings> & {
    reference_eref_asset_id?: string;
    provider_id?: string;
    resolution?: string;
  };
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

function pickResolution(value: unknown): VideoResolution | undefined {
  if (value === '480p' || value === '720p' || value === '1080p') return value;
  return undefined;
}

function pickProvider(value: unknown): VgenProvider | undefined {
  // Normalize legacy variants — runner persists 'seedance-fal' for the text-
  // only path and 'seedance-fal-img2vid' when an EREF was used; the UI shows
  // them as the same provider choice.
  if (value === 'veo-3' || value === 'veo-3-img2vid') return 'veo-3-img2vid';
  if (value === 'seedance-fal' || value === 'seedance-fal-img2vid') return 'seedance-fal-img2vid';
  return undefined;
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
    const providerId = pickProvider(settings.provider_id ?? m.provider_id);
    const resolution = pickResolution(settings.resolution ?? m.resolution);
    const stub: VGENShotPanelStoryboardShot = m.storyboard_shot ?? { shot_id: shotId };
    const cs: VGENShotPanelSettings = {
      prompt,
      aspect_ratio: aspect,
      quality_tier: quality,
      duration_seconds: duration,
      reference_asset_id: refId,
      ...(providerId ? { provider_id: providerId } : {}),
      ...(resolution ? { resolution } : {}),
    };
    return { storyboardShot: stub, currentSettings: cs };
  }, [metadata, filename]);

  // Best-available mp4 URL. Drive-backed media → stable /api/media/<id> cache
  // route (post-2026-06-01); /staging is dead, drive_web_view_url is a viewer
  // page not a playable mp4. drive_web_view_url presence ⇒ Drive-backed.
  const videoUrl =
    assetId && driveWebViewUrl ? `/api/media/${assetId}` : drivePath ?? stagingPath ?? null;

  return (
    <VGENShotPanel
      assetId={assetId}
      videoUrl={videoUrl}
      storyboardShot={storyboardShot}
      currentSettings={currentSettings}
      onChanged={onChanged}
      onRegenerated={onRegenerated}
      readOnly={!editable}
    />
  );
}
