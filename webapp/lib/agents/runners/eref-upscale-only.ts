// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/eref-upscale-only.ts
// Upscale a single approved IMG-episode_ref asset to 4K AFTER Director APPROVE.
//
// Per technology.md §3, 4K upscale is wasteful when fired on AI-APPROVE
// (Director may still REJECT/REVISE). This function is invoked by the
// Inngest event `sandystudio/exec-eref/upscale-final`, dispatched from
// /api/assets/[id]/approve route when the Director approves an EREF v2
// asset and `skip_upscale` was not requested.
//
// Lifted out of episode-references.ts to keep that file under the 800-line
// hard limit imposed by the project's pre-write hook.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/types.gen';
import { persistBinary } from '../persist-binary';
import { upscaleToFourK, UpscaleError } from '../providers/upscale-fal';
import {
  SHOT_REFERENCE_CONTRACT,
  type GenerationAttempt,
  type ShotReferenceContract,
} from '../../api/shot-reference';

/** Image dimensions ≥ this on either axis count as 4K. */
const FOUR_K_THRESHOLD = 3840;

interface AssetWithMetadata {
  id: string;
  metadata: Record<string, unknown> | null;
  staging_path: string | null;
  filename: string | null;
  episode_id: string | null;
}

export interface RunUpscaleOnlyArgs {
  assetId: string;
  supabase: SupabaseClient<Database>;
}

export interface RunUpscaleOnlyResult {
  ok: boolean;
  final_4k_url: string | null;
  cost_usd: number;
  /** Set when ok=false. */
  reason?: string;
  /**
   * Cost-attribution fields (2026-07-25). The upscale is a PAID fal call and its
   * cost must reach budget_log; the caller records it, so it needs to know which
   * episode to bill and which provider/model to name. Populated only on the paths
   * that actually spent money — a $0 return needs no attribution.
   */
  episode_id?: string | null;
  provider_id?: string;
  model?: string;
}

export async function runUpscaleOnly(
  args: RunUpscaleOnlyArgs,
): Promise<RunUpscaleOnlyResult> {
  const { assetId, supabase } = args;
  if (!process.env.FAL_KEY?.trim() && !process.env.FAL_API_KEY?.trim()) {
    return { ok: false, final_4k_url: null, cost_usd: 0, reason: 'FAL_KEY not set' };
  }

  const { data: rawAsset, error } = await supabase
    .from('assets')
    .select('id,metadata,staging_path,filename,episode_id')
    .eq('id', assetId)
    .maybeSingle();
  if (error) {
    return { ok: false, final_4k_url: null, cost_usd: 0, reason: error.message };
  }
  if (!rawAsset) {
    return { ok: false, final_4k_url: null, cost_usd: 0, reason: 'Asset not found' };
  }
  const asset = rawAsset as unknown as AssetWithMetadata;

  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  const sr = meta.shot_reference as ShotReferenceContract | undefined;
  if (!sr || sr.contract !== SHOT_REFERENCE_CONTRACT) {
    return {
      ok: false,
      final_4k_url: null,
      cost_usd: 0,
      reason: 'Asset is not v2 EREF (no shot_reference contract)',
    };
  }
  if (sr.final_4k_url) {
    return {
      ok: true,
      final_4k_url: sr.final_4k_url,
      cost_usd: 0,
      reason: 'already 4K',
    };
  }
  const last = sr.generation_history[sr.generation_history.length - 1];
  if (!last) {
    return {
      ok: false,
      final_4k_url: null,
      cost_usd: 0,
      reason: 'No generation_history entries to upscale',
    };
  }

  let imageB64: string;
  try {
    const res = await fetch(last.image_url);
    if (!res.ok) {
      return {
        ok: false,
        final_4k_url: null,
        cost_usd: 0,
        reason: `source fetch ${res.status}`,
      };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    imageB64 = buf.toString('base64');
  } catch (err) {
    return {
      ok: false,
      final_4k_url: null,
      cost_usd: 0,
      reason: `source fetch failed: ${(err as Error).message}`,
    };
  }

  let upscaled;
  try {
    upscaled = await upscaleToFourK({ image_b64: imageB64, target: '4K' });
  } catch (err) {
    if (err instanceof UpscaleError) {
      return {
        ok: false,
        final_4k_url: null,
        cost_usd: 0,
        reason: `upscale failed: ${err.message}`,
      };
    }
    throw err;
  }

  const persisted = await persistBinary({
    base64: upscaled.b64_data,
    ext: 'png',
    driveFilename: (asset.filename ?? `eref-${assetId.slice(-8)}-4k`).replace(
      /\.png$/i,
      '-4k.png',
    ),
    localHint: `eref-upscale-${assetId.slice(-8)}`,
    episodeCode: undefined,
    supabase,
  });

  const upscaleAttempt: GenerationAttempt = {
    version: (last.version ?? sr.generation_history.length) + 1,
    provider_id: upscaled.provider_id,
    model: upscaled.model,
    prompt: '(upscale only — no prompt)',
    references_used: [{ kind: 'identity', bible_asset_id: 'self' }],
    strength: null,
    cost_usd: upscaled.cost_usd,
    image_url: persisted.browserUrl,
    drive_file_id: persisted.driveFileId,
    drive_web_view_url: persisted.driveWebViewUrl,
    width: upscaled.width,
    height: upscaled.height,
    is_4k:
      upscaled.width >= FOUR_K_THRESHOLD || upscaled.height >= FOUR_K_THRESHOLD,
    at: new Date().toISOString(),
    triggered_by: 'auto_upscale',
    mode_at_time: last.mode_at_time,
  };

  const updatedSr: ShotReferenceContract = {
    ...sr,
    generation_history: [...sr.generation_history, upscaleAttempt],
    final_4k_url: persisted.browserUrl,
  };
  const newMeta = { ...meta, shot_reference: updatedSr };

  const { error: upErr } = await supabase
    .from('assets')
    .update({
      staging_path: persisted.browserUrl,
      drive_path: persisted.browserUrl,
      drive_file_id: persisted.driveFileId,
      drive_web_view_url: persisted.driveWebViewUrl,
      metadata: newMeta as unknown as Record<string, unknown>,
    } as never)
    .eq('id', assetId);
  if (upErr) {
    return {
      ok: false,
      final_4k_url: null,
      cost_usd: upscaled.cost_usd,
      reason: `asset update: ${upErr.message}`,
      // The fal call already billed us even though the asset row did not update —
      // the cost row must still be written, or the money vanishes from the ledger.
      episode_id: asset.episode_id,
      provider_id: upscaled.provider_id,
      model: upscaled.model,
    };
  }

  return {
    ok: true,
    final_4k_url: persisted.browserUrl,
    cost_usd: upscaled.cost_usd,
    episode_id: asset.episode_id,
    provider_id: upscaled.provider_id,
    model: upscaled.model,
  };
}
