// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/thumbnail-renderer.ts
// EXEC-THUMB executor — renders the approved SPC-thumb_plan into N sibling
// IMG-thumbnail assets (one per design variant), mirroring the EXEC-EREF
// multi-insert pattern (skip_save + inserted_asset_ids).
//
// Per variant: gpt-image-1 @ 1536×1024 (3:2 — the provider has no native 16:9)
//   → sharp center-crop + resize to the YouTube target (16:9 1280×720)
//   → sharp SVG-text overlay of the variant's overlay_text (bold, stroke)
//   → persistBinary → insert one IMG-thumbnail row (status REVIEW) with the
//   full prompt / negative / overlay / palette persisted in metadata so the
//   Director can compare, reproduce, and revise.
// ──────────────────────────────────────────────────────────────────────────────

import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateIdeogram } from '../providers/fal-ideogram';
import { readBibleImageAsBase64 } from '../providers/openai-image-edit';
import { downloadFile } from '../providers/drive';
import { persistBinary } from '../persist-binary';
import type { AgentInputs } from '../types';

// YouTube delivery spec (16:9). Lives here (executor/config layer), not in the
// process skill — see skill-creation abstraction doctrine.
const YT_WIDTH = 1280;
const YT_HEIGHT = 720;
/** Hard ceiling on variants rendered per run (Director directive 2026-06-01). */
const MAX_VARIANTS = 10;

export class ThumbnailRendererError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ThumbnailRendererError';
  }
}

interface ThumbnailVariant {
  concept?: string;
  prompt: string;
  negative_prompt?: string | null;
  overlay_text?: string | null;
  palette?: unknown;
  composition_notes?: string | null;
}

export interface ThumbnailRendererResult {
  insertedAssetIds: string[];
  totalImages: number;
  costUsd: number;
  description: string;
}

/** Parse the last fenced ```json block from the Plan asset's markdown content. */
export function parsePlanVariants(content: string | null): ThumbnailVariant[] {
  if (!content) throw new ThumbnailRendererError('SPC-thumb_plan content is empty');
  const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
  const last = matches[matches.length - 1]?.[1];
  if (!last) throw new ThumbnailRendererError('SPC-thumb_plan has no fenced ```json block');
  let body: { halt?: unknown; variants?: unknown };
  try {
    body = JSON.parse(last.trim()) as typeof body;
  } catch (err) {
    throw new ThumbnailRendererError(`SPC-thumb_plan JSON parse failed: ${String(err)}`);
  }
  if (typeof body.halt === 'string' && body.halt.length > 0) {
    throw new ThumbnailRendererError(`Designer HALTed: ${body.halt}`);
  }
  const variants = Array.isArray(body.variants) ? (body.variants as ThumbnailVariant[]) : [];
  const usable = variants.filter((v) => v && typeof v.prompt === 'string' && v.prompt.length > 0);
  if (usable.length === 0) {
    throw new ThumbnailRendererError('SPC-thumb_plan declares no usable variants (missing prompt)');
  }
  return usable.slice(0, MAX_VARIANTS);
}

/**
 * Build the Ideogram prompt for a variant. Ideogram renders text natively, so
 * the overlay caption is folded into the prompt (bold, high-contrast) instead
 * of being burned on afterwards with sharp.
 */
function buildIdeogramPrompt(v: ThumbnailVariant): string {
  const parts = [v.prompt.trim()];
  const text = (v.overlay_text ?? '').trim();
  if (text) {
    parts.push(
      `Render the text "${text}" as a large, bold, high-contrast caption integrated into the thumbnail — heavy weight, thick outline and drop shadow, positioned so it never covers the character's face.`,
    );
  }
  return parts.join(' ');
}

/** Ideogram landscape_16_9 is already 16:9 — normalise to the exact YouTube target. */
async function resizeToYouTube(b64: string): Promise<Buffer> {
  return sharp(Buffer.from(b64, 'base64'))
    .resize(YT_WIDTH, YT_HEIGHT, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
}

/**
 * Resolve a canonical character reference for Ideogram character mode as an
 * inline data URL. Sandy (and any series protagonist) drifts badly in plain
 * text-to-image, so we anchor on an APPROVED IMG-episode_ref. Bytes come from
 * the local staging cache when present, else a Google Drive download — works
 * both in-server and from a fresh worktree/smoke. Returns null if none found.
 */
async function resolveCharacterRefDataUrl(
  supabase: SupabaseClient,
  episodeId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('assets')
    .select('file_type,staging_path,drive_file_id,version')
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED')
    .like('file_type', 'IMG-episode_ref%')
    .order('version', { ascending: false })
    .limit(25);
  const refs = (data ?? []) as Array<{ staging_path?: string | null; drive_file_id?: string | null }>;
  for (const ref of refs) {
    let b64: string | null = null;
    if (ref.staging_path) b64 = await readBibleImageAsBase64(ref.staging_path);
    if (!b64 && ref.drive_file_id) {
      try {
        b64 = Buffer.from(await downloadFile(ref.drive_file_id)).toString('base64');
      } catch {
        b64 = null;
      }
    }
    if (b64) return `data:image/png;base64,${b64}`;
  }
  return null;
}

export interface ThumbnailRendererArgs {
  inputs: AgentInputs;
  supabase: SupabaseClient;
  episodeCode: string | null | undefined;
  planAssetId: string;
}

export async function runThumbnailRenderer(
  args: ThumbnailRendererArgs,
): Promise<ThumbnailRendererResult> {
  const { inputs, supabase, episodeCode, planAssetId } = args;
  const episode = inputs.episode as { id?: string } | undefined;
  const episodeId = episode?.id;
  if (!episodeId) throw new ThumbnailRendererError('inputs.episode.id missing');

  const { data: planRow, error: planErr } = await supabase
    .from('assets')
    .select('content,status,file_type')
    .eq('id', planAssetId)
    .maybeSingle();
  if (planErr) throw new ThumbnailRendererError(`Plan load failed: ${planErr.message}`);
  if (!planRow) throw new ThumbnailRendererError(`Plan asset ${planAssetId} not found`);
  if ((planRow as { file_type?: string }).file_type !== 'SPC-thumb_plan') {
    throw new ThumbnailRendererError(`Asset ${planAssetId} is not an SPC-thumb_plan`);
  }

  const variants = parsePlanVariants((planRow as { content?: string | null }).content ?? null);

  // Sibling versions: continue numbering from the highest existing thumbnail.
  const { data: existing } = await supabase
    .from('assets')
    .select('version')
    .eq('episode_id', episodeId)
    .eq('file_type', 'IMG-thumbnail')
    .order('version', { ascending: false })
    .limit(1);
  let nextV = (((existing?.[0] as { version?: number } | undefined)?.version ?? 0) || 0) + 1;

  const insertedAssetIds: string[] = [];
  let totalCost = 0;
  const nowIso = new Date().toISOString();

  // Anchor on a canonical character reference so the protagonist stays on-model
  // (plain text-to-image drifts badly — Director directive). null → text-only mode.
  const characterRef = await resolveCharacterRefDataUrl(supabase, episodeId);
  const renderMode = characterRef ? 'ideogram/character' : 'ideogram/v3';
  console.log(`[thumb-render] mode=${renderMode} variants=${variants.length}`);

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    let real;
    try {
      real = await generateIdeogram({
        prompt: buildIdeogramPrompt(v),
        negativePrompt: v.negative_prompt ?? undefined,
        imageSize: 'landscape_16_9',
        renderingSpeed: 'QUALITY',
        referenceImageUrl: characterRef ?? undefined,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[thumb-render] variant ${i} (${v.concept ?? '?'}) gen failed: ${(err as Error).message}`);
      continue;
    }
    totalCost += real.cost_usd;

    let finalPng: Buffer;
    try {
      finalPng = await resizeToYouTube(real.b64_data);
    } catch (err) {
      throw new ThumbnailRendererError(`sharp processing failed for variant ${i}: ${String(err)}`, err);
    }

    const versionTag = `v${String(nextV).padStart(2, '0')}`;
    const filename = `${episodeCode ?? 'SS-unknown'}-IMG-thumbnail-${versionTag}-DRAFT.png`;
    const persisted = await persistBinary({
      base64: finalPng.toString('base64'),
      ext: 'png',
      driveFilename: filename,
      localHint: `thumb-${episodeId.slice(-8)}-${versionTag}`,
      episodeCode: episodeCode ?? undefined,
      supabase,
    });

    const metadata = {
      provenance: {
        created_by: 'EXEC-THUMB',
        created_by_kind: 'agent' as const,
        created_at: nowIso,
        source: 'plan_driven' as const,
        plan_asset_id: planAssetId,
      },
      provider_id: real.model, // 'fal-ai/ideogram/v3' | 'fal-ai/ideogram/character'
      provider_used: real.model,
      render_mode: renderMode,
      concept: v.concept ?? null,
      prompt: v.prompt,
      ideogram_prompt: buildIdeogramPrompt(v),
      negative_prompt: v.negative_prompt ?? null,
      overlay_text: v.overlay_text ?? null,
      palette: v.palette ?? null,
      seed: real.seed ?? null,
      width: YT_WIDTH,
      height: YT_HEIGHT,
      format: 'PNG',
    };

    const { data: inserted, error } = await supabase
      .from('assets')
      .insert({
        episode_id: episodeId,
        series_id: null,
        agent_id: 'EXEC-THUMB',
        file_type: 'IMG-thumbnail',
        filename,
        description: `Thumbnail variant ${i + 1}/${variants.length} (${v.concept ?? 'concept'}) · 1280×720 · cost $${real.cost_usd.toFixed(4)}`,
        staging_path: persisted.browserUrl,
        drive_path: persisted.browserUrl,
        drive_file_id: persisted.driveFileId,
        drive_web_view_url: persisted.driveWebViewUrl,
        status: 'REVIEW',
        version: nextV,
        content: null,
        metadata: metadata as unknown as Record<string, unknown>,
      } as never)
      .select('id')
      .single();
    if (error) {
      // eslint-disable-next-line no-console
      console.error(`[thumb-render] insert failed for ${filename}: ${error.message}`);
      continue;
    }
    insertedAssetIds.push((inserted as { id: string }).id);
    nextV += 1;
  }

  if (insertedAssetIds.length === 0) {
    throw new ThumbnailRendererError('No thumbnail variants were rendered/inserted');
  }

  return {
    insertedAssetIds,
    totalImages: insertedAssetIds.length,
    costUsd: totalCost,
    description: `${insertedAssetIds.length} thumbnail variant(s) from plan ${planAssetId} · cost $${totalCost.toFixed(4)}`,
  };
}
