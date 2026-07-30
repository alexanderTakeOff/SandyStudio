// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/thumbnail-renderer.ts
// EXEC-THUMB executor — renders the approved SPC-thumb_plan into N sibling
// IMG-thumbnail assets (one per design variant), mirroring the EXEC-EREF
// multi-insert pattern (skip_save + inserted_asset_ids).
//
// Provider history:
//   - v1 (2026-06-01) gpt-image-1 @ 3:2 + crop + overlay.
//   - v2 (2026-06-01) Ideogram v3 on fal — native text, but character mode
//     takes ONE reference so Sandy came out "не до конца" (canon half-applied),
//     and quality was boring. Director rejected.
//   - v3 (2026-06-01) THIS — multi-canon gpt-image-2 edits (the same
//     `openai-edits-multi` provider EREF uses): feeds ALL LOCKED Bible
//     character canon (Sandy + Anvil + …) + the style anchor simultaneously
//     so every protagonist stays on-model, not just the first. Text is no
//     longer rendered in-image — it is burned on afterwards with a punchy
//     sharp SVG overlay (heavy font, thick stroke, drop shadow), so negatives
//     can exclude in-image text again.
//
// Per variant:
//   gpt-image-2 multi-ref edit @ 1536×1024 (3:2 — the only landscape the
//     provider emits) → sharp center-crop + resize to the YouTube target
//     (16:9 1280×720) → sharp SVG-text overlay of the variant's overlay_text
//     → persistBinary → insert one IMG-thumbnail row (status REVIEW) with the
//     full prompt / negative / overlay / palette / canon refs persisted in
//     metadata so the Director can compare, reproduce, and revise.
// ──────────────────────────────────────────────────────────────────────────────

import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import { openAIEditsMultiProvider } from '../providers/openai-edits-multi';
import type { MultiImageRef } from '../providers/image-gen-multi';
import { MultiImageGenError } from '../providers/image-gen-multi';
import { readBibleImageAsBase64 } from '../providers/openai-image-edit';
import { downloadFile } from '../providers/drive';
import { seriesIdForEpisode } from '../../api/series-bible';
import { persistBinary } from '../persist-binary';
import type { AgentInputs } from '../types';

// YouTube delivery spec (16:9). Lives here (executor/config layer), not in the
// process skill — see skill-creation abstraction doctrine.
const YT_WIDTH = 1280;
const YT_HEIGHT = 720;
/** Source size requested from gpt-image-2 edits — 1536×1024 is the only 3:2
 *  landscape the provider emits; we center-crop the extra height to 16:9. */
const SRC_SIZE = '1536x1024' as const;
/** Hard ceiling on variants rendered per run (Director directive 2026-06-01). */
const MAX_VARIANTS = 10;
/** Cap on canon reference images fed per variant. Provider allows 16; more
 *  refs dilute attention, so keep the hero cast + style only. */
const MAX_CANON_REFS = 6;

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

/** A LOCKED Bible canon reference resolved to bytes, ready for the multi-ref edit. */
interface CanonRef {
  kind: 'identity' | 'style';
  bibleAssetId: string;
  slug: string;
  imageB64: string;
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

const slugFromFileType = (fileType: string): string => {
  // 'SBL-character_sandy' → 'sandy'; 'SBL-style_main' → 'style'.
  const m = /^SBL-(?:character|style)_([a-z0-9_]+)/i.exec(fileType);
  return m ? m[1].toLowerCase() : fileType.toLowerCase();
};

/**
 * Resolve every LOCKED Bible character canon (Sandy, Anvil, …) plus the LOCKED
 * style anchor for the episode's series, as multi-ref edit inputs. This is the
 * fix for the Ideogram single-ref miss: gpt-image-2 edits accepts up to 16
 * references and treats them as composite identity anchors, so ALL recurring
 * characters stay on-model at once.
 *
 * Order: identity refs first, style last — matches EREF's buildMultiImageRefs
 * convention (earlier refs weigh higher for identity lock). Bytes come from the
 * local staging cache when present, else a Google Drive download (works from a
 * fresh worktree / smoke). Refs without resolvable bytes are skipped.
 */
async function resolveCanonRefs(
  supabase: SupabaseClient,
  episodeId: string,
): Promise<CanonRef[]> {
  const seriesId = await seriesIdForEpisode(
    supabase as Parameters<typeof seriesIdForEpisode>[0],
    episodeId,
  );
  if (!seriesId) {
    throw new ThumbnailRendererError(
      `Episode ${episodeId} has no parent series_id — cannot load Bible canon`,
    );
  }

  const { data, error } = await supabase
    .from('assets')
    .select('id,file_type,staging_path,drive_file_id')
    .eq('series_id', seriesId)
    .eq('status', 'LOCKED')
    .like('file_type', 'SBL-%')
    // Deterministic order (2026-07-31) — see loadBibleCanon in episode-references.
    .order('created_at', { ascending: true });
  if (error) {
    throw new ThumbnailRendererError(`Bible canon fetch failed: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    file_type: string;
    staging_path?: string | null;
    drive_file_id?: string | null;
  }>;
  const characters = rows.filter((r) => r.file_type.startsWith('SBL-character_'));
  const styles = rows.filter((r) => r.file_type.startsWith('SBL-style_'));

  async function bytesFor(row: {
    staging_path?: string | null;
    drive_file_id?: string | null;
  }): Promise<string | null> {
    if (row.staging_path) {
      const b64 = await readBibleImageAsBase64(row.staging_path);
      if (b64) return b64;
    }
    if (row.drive_file_id) {
      try {
        return Buffer.from(await downloadFile(row.drive_file_id)).toString('base64');
      } catch {
        return null;
      }
    }
    return null;
  }

  const refs: CanonRef[] = [];
  for (const c of characters) {
    if (refs.length >= MAX_CANON_REFS - 1) break; // leave room for the style ref
    const b64 = await bytesFor(c);
    if (b64) {
      refs.push({
        kind: 'identity',
        bibleAssetId: c.id,
        slug: slugFromFileType(c.file_type),
        imageB64: b64,
      });
    }
  }
  const styleRow = styles[0];
  if (styleRow) {
    const b64 = await bytesFor(styleRow);
    if (b64) {
      refs.push({
        kind: 'style',
        bibleAssetId: styleRow.id,
        slug: slugFromFileType(styleRow.file_type),
        imageB64: b64,
      });
    }
  }
  return refs;
}

/**
 * Build the positive edit prompt for a variant. Text is overlaid afterward, so
 * the prompt explicitly asks for NO in-image text and reserves clear space in
 * the lower third for the caption — this stops the model burning garbled words
 * into the art and keeps the overlay legible.
 */
export function buildEditPrompt(v: ThumbnailVariant, identitySlugs: readonly string[] = []): string {
  const parts: string[] = [];
  // Identity lock (E25 2026-07-10, Director): the multi-ref edit already FEEDS
  // the LOCKED character canon, but without an explicit clause the text prompt
  // overpowers the references and the protagonist drifts off-model (generic
  // "Sandy"). Mirror EREF's reference-as-canon instruction: name the characters
  // and demand they match the model sheets exactly. Goes FIRST so it anchors.
  if (identitySlugs.length > 0) {
    const named = identitySlugs.join(', ');
    parts.push(
      `The provided reference images are the CANONICAL model sheets for the recurring characters (${named}). ` +
        `Any of these characters that appears in this key art MUST be rendered EXACTLY on-model as in its reference — ` +
        `identical proportions, materials, colours, and silhouette. Do NOT restyle, redesign, simplify, or substitute ` +
        `a generic figure; the reference identity is non-negotiable. (Do not force in a character the concept does not call for.)`,
    );
  }
  parts.push(v.prompt.trim());
  if (v.composition_notes && v.composition_notes.trim()) {
    parts.push(`Composition: ${v.composition_notes.trim()}`);
  }
  parts.push(
    'Render as poster-grade YouTube key art: one bold focal subject, dramatic key/rim light, high subject-to-background contrast.',
  );
  if ((v.overlay_text ?? '').trim()) {
    parts.push(
      'Leave the lower third of the frame visually simple (clear of faces and busy detail) so a large caption can be overlaid there afterward.',
    );
  }
  parts.push('Do NOT render any text, letters, words, captions, logos, or watermarks inside the image.');
  return parts.join(' ');
}

/** Center-crop + resize the 3:2 source to the exact 16:9 YouTube target. */
async function resizeToYouTube(b64: string): Promise<Buffer> {
  return sharp(Buffer.from(b64, 'base64'))
    .resize(YT_WIDTH, YT_HEIGHT, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      default: return '&quot;';
    }
  });
}

/**
 * Burn a punchy caption onto the lower third: heavy weight, thick black stroke,
 * drop shadow — legible at ~120px mobile width and survives any background.
 * Font size scales down for longer captions. Returns the base image unchanged
 * when there is no caption. Single line (designer keeps overlay_text ≤5 words).
 */
export async function overlayCaption(basePng: Buffer, rawText: string): Promise<Buffer> {
  const text = rawText.trim().toUpperCase();
  if (!text) return basePng;

  const maxCaptionWidth = YT_WIDTH * 0.92;
  // Arial Black advance ≈ 0.62·fontSize per glyph — size to fit one line.
  let fontSize = Math.floor(maxCaptionWidth / Math.max(1, text.length * 0.62));
  fontSize = Math.max(44, Math.min(150, fontSize));
  const strokeWidth = Math.max(4, Math.round(fontSize / 12));
  const baselineY = YT_HEIGHT - Math.round(fontSize * 0.5);
  const shadowDy = Math.max(2, Math.round(fontSize / 16));
  const shadowBlur = Math.max(2, Math.round(fontSize / 14));

  const svg = `<svg width="${YT_WIDTH}" height="${YT_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="ds" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="${shadowDy}" stdDeviation="${shadowBlur}" flood-color="#000000" flood-opacity="0.9"/>
    </filter>
  </defs>
  <text x="50%" y="${baselineY}" text-anchor="middle"
        font-family="Arial Black, Arial Bold, Impact, Helvetica, sans-serif"
        font-weight="900" font-size="${fontSize}"
        fill="#FFFFFF" stroke="#000000" stroke-width="${strokeWidth}"
        paint-order="stroke" filter="url(#ds)">${escapeXml(text)}</text>
</svg>`;

  return sharp(basePng)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
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

  // Multi-canon anchoring — ALL LOCKED character refs + style, fed together so
  // every protagonist (Sandy + Anvil + …) stays on-model. Fail fast when canon
  // is missing: the whole point of v3 is on-model thumbnails (Director #1).
  const canonRefs = await resolveCanonRefs(supabase, episodeId);
  if (canonRefs.length === 0) {
    throw new ThumbnailRendererError(
      'No LOCKED Bible canon refs (SBL-character_* / SBL-style_*) resolved — lock the Bible before rendering thumbnails',
    );
  }
  const identitySlugs = canonRefs.filter((r) => r.kind === 'identity').map((r) => r.slug);
  const multiRefs: MultiImageRef[] = canonRefs.map((r) => ({
    kind: r.kind,
    bible_asset_id: r.bibleAssetId,
    image_b64: r.imageB64,
  }));
  console.log(
    `[thumb-render] provider=openai-edits-multi refs=${canonRefs.length} (identity: ${identitySlugs.join(', ') || 'none'}) variants=${variants.length}`,
  );

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

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const editPrompt = buildEditPrompt(v, identitySlugs);
    let real;
    try {
      real = await openAIEditsMultiProvider.generate({
        prompt: editPrompt,
        references: multiRefs,
        size: SRC_SIZE,
        quality: 'medium',
      });
    } catch (err) {
      if (err instanceof MultiImageGenError) {
        // eslint-disable-next-line no-console
        console.error(`[thumb-render] variant ${i} (${v.concept ?? '?'}) gen failed: ${err.message}`);
        continue;
      }
      throw err;
    }
    totalCost += real.cost_usd;

    let finalPng: Buffer;
    try {
      const cropped = await resizeToYouTube(real.b64_data);
      finalPng = await overlayCaption(cropped, v.overlay_text ?? '');
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
      provider_id: real.provider_id, // 'openai-edits-multi'
      provider_used: real.model, // 'gpt-image-2'
      render_mode: 'openai-edits-multi/canon',
      identity_character_slugs: identitySlugs,
      canon_ref_asset_ids: canonRefs.map((r) => r.bibleAssetId),
      concept: v.concept ?? null,
      prompt: v.prompt,
      edit_prompt: editPrompt,
      negative_prompt: v.negative_prompt ?? null,
      overlay_text: v.overlay_text ?? null,
      overlay_burned_in: Boolean((v.overlay_text ?? '').trim()),
      palette: v.palette ?? null,
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
        description: `Thumbnail variant ${i + 1}/${variants.length} (${v.concept ?? 'concept'}) · 1280×720 · canon[${identitySlugs.join('+') || 'none'}] · cost $${real.cost_usd.toFixed(4)}`,
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
    description: `${insertedAssetIds.length} thumbnail variant(s) from plan ${planAssetId} · canon[${identitySlugs.join('+') || 'none'}] · cost $${totalCost.toFixed(4)}`,
  };
}
