// ──────────────────────────────────────────────────────────────────────────────
// lib/api/asset-prompt-builder.ts
// Single source of truth for "given an asset row, what initial prompt do we
// send to gpt-image-1?" This is used for FIRST-pass generation (enrich,
// EXEC-EREF first run, EXEC-THUMB first run). Subsequent regenerations use
// Director-edited prompts directly — no rebuild needed.
//
// Routing key: asset.file_type prefix.
//   SBL-character_*     → Bible character — section-specific template
//   SBL-location_*      → Bible location  — section-specific template
//   SBL-object_*        → Bible object    — section-specific template
//   SBL-style_*         → Bible style sample
//   IMG-episode_ref_*   → episode-level reference (uses storyboard shot context)
//   IMG-thumbnail       → episode thumbnail (uses brief + script)
//
// Each builder returns:
//   - prompt: string (ready for gpt-image-1)
//   - styleAnchorAssetId: id of the SBL-style asset that anchored the prompt
//                         (null if no LOCKED style available)
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';
import { bibleSlugFromFileType, type SbSection } from './series-bible';

export interface AssetForPrompt {
  id: string;
  file_type: string;
  filename: string;
  description: string | null;
  content: string | null;
  series_id: string | null;
  episode_id: string | null;
}

export interface BuiltPrompt {
  prompt: string;
  /** SBL-style asset id used as anchor, or null when none available. */
  styleAnchorAssetId: string | null;
  /** Optional list of Bible character/location asset ids referenced in prompt. */
  sourceBibleRefIds: string[];
}

interface SeriesContext {
  title: string;
  generalIdea: string | null;
  styleGuide: { id: string; text: string } | null;
}

async function loadSeriesContext(
  supabase: SupabaseClient<Database>,
  seriesId: string,
): Promise<SeriesContext | null> {
  const { data: seriesRow } = await supabase
    .from('series')
    .select('id,title')
    .eq('id', seriesId)
    .maybeSingle();
  if (!seriesRow) return null;

  // Prefer LOCKED style → APPROVED → DRAFT (so unblocked early in production).
  const { data: styleRows } = await supabase
    .from('assets')
    .select('id,description,content,status')
    .eq('series_id', seriesId)
    .like('file_type', 'SBL-style%')
    .order('updated_at', { ascending: false });
  let styleAnchor: SeriesContext['styleGuide'] = null;
  if (styleRows && styleRows.length > 0) {
    const rows = styleRows as Array<{ id: string; description: string | null; content: string | null; status: string }>;
    const pick = rows.find((r) => r.status === 'LOCKED') ?? rows.find((r) => r.status === 'APPROVED') ?? rows[0];
    if (pick) {
      const text = pick.content || pick.description || '';
      if (text.trim()) styleAnchor = { id: pick.id, text };
    }
  }

  // General idea — first row matching SBL-general_idea.
  const { data: giRows } = await supabase
    .from('assets')
    .select('description,content')
    .eq('series_id', seriesId)
    .like('file_type', 'SBL-general_idea%')
    .limit(1);
  const giRow = (giRows ?? [])[0] as { description: string | null; content: string | null } | undefined;
  const generalIdea = giRow ? giRow.content || giRow.description : null;

  return { title: seriesRow.title ?? '', generalIdea, styleGuide: styleAnchor };
}

// ── Bible asset prompt (SBL-*) ───────────────────────────────────────────────

const BIBLE_SECTION_LABEL: Record<SbSection, string> = {
  character: 'character',
  location: 'location',
  object: 'prop',
  style: 'style sample frame',
  audio: 'audio sample',
  video: 'brand video',
  general_idea: 'general idea',
};

function buildBibleAssetPrompt(args: {
  section: SbSection;
  slug: string;
  description: string;
  series: SeriesContext;
}): string {
  const { section, slug, description, series } = args;
  const sectionWord = BIBLE_SECTION_LABEL[section] ?? 'asset';
  const lines = [
    `Canonical ${sectionWord} reference for the animated series "${series.title}".`,
    '',
    'Description:',
    description.slice(0, 2400) || `(no description provided — generic ${sectionWord} ${slug})`,
  ];
  if (series.styleGuide && series.styleGuide.text.trim()) {
    lines.push('', 'Series art direction (must follow):');
    lines.push(series.styleGuide.text.slice(0, 1200));
  }
  lines.push(
    '',
    `Render as a clean reference image — front-facing or three-quarter view, neutral background, full-body if a character, no text overlay, no logo, no watermark. Studio canon — should be reusable across many shots.`,
  );
  return lines.join('\n');
}

// ── Episode reference prompt (IMG-episode_ref_*) ─────────────────────────────

interface ShotContext {
  shot_id: string;
  act?: number;
  location: string;
  characters_present: string[];
  action: string;
  duration_seconds?: number;
  key_beat?: string;
}

interface BibleRefForPrompt {
  id: string;
  kind: 'character' | 'location' | 'style';
  name: string;
  description: string;
}

export function buildEpisodeRefPrompt(args: {
  shot: ShotContext;
  bibleRefs: BibleRefForPrompt[];
  series: Pick<SeriesContext, 'title' | 'styleGuide'>;
}): string {
  const { shot, bibleRefs, series } = args;
  const charBlocks = bibleRefs
    .filter((r) => r.kind === 'character')
    .map((r) => `Character "${r.name}" — ${r.description.slice(0, 600)}`);
  const locBlocks = bibleRefs
    .filter((r) => r.kind === 'location')
    .map((r) => `Location "${r.name}" — ${r.description.slice(0, 600)}`);
  const styleBlocks = bibleRefs
    .filter((r) => r.kind === 'style')
    .map((r) => `Series art direction — ${r.description.slice(0, 600)}`);
  const styleFromSeries = series.styleGuide?.text;
  if (!styleBlocks.length && styleFromSeries) {
    styleBlocks.push(`Series art direction — ${styleFromSeries.slice(0, 600)}`);
  }
  return [
    `Episode reference image for shot ${shot.shot_id} (Act ${shot.act ?? '?'}) of "${series.title}".`,
    `Camera/action: ${shot.action}`,
    shot.key_beat ? `Beat: ${shot.key_beat}` : '',
    '',
    'Canonical references (must match exactly):',
    ...charBlocks.map((b) => `- ${b}`),
    ...locBlocks.map((b) => `- ${b}`),
    '',
    'Series art direction (must follow):',
    ...styleBlocks.map((b) => `- ${b}`),
    '',
    'Render as a single key frame of this shot. Composition follows the action.',
    'No text overlay, no logo, no watermark. Single coherent scene.',
  ]
    .filter(Boolean)
    .join('\n');
}

// ── Thumbnail prompt (IMG-thumbnail) ─────────────────────────────────────────

export function buildThumbnailPrompt(args: {
  episodeCode: string;
  episodeTitle: string;
  briefSummary: string;
  series: Pick<SeriesContext, 'title' | 'styleGuide'>;
}): string {
  const { episodeCode, episodeTitle, briefSummary, series } = args;
  const lines = [
    `YouTube thumbnail for animated comedy short titled "${episodeTitle}" (${episodeCode}) of series "${series.title}".`,
    '',
    'Brief summary:',
    briefSummary.slice(0, 1500),
  ];
  if (series.styleGuide?.text) {
    lines.push('', 'Series art direction (must follow):');
    lines.push(series.styleGuide.text.slice(0, 1200));
  }
  lines.push(
    '',
    'Style: vibrant colours, dynamic composition, a clear focal subject readable at 320×180, comedy/sketch art direction. No text, no watermark, 16:9 framing, high contrast.',
  );
  return lines.join('\n');
}

// ── Generic dispatcher ───────────────────────────────────────────────────────

export async function buildPromptForAsset(args: {
  supabase: SupabaseClient<Database>;
  asset: AssetForPrompt;
}): Promise<BuiltPrompt> {
  const { supabase, asset } = args;
  const sourceBibleRefIds: string[] = [];

  // Bible asset (SBL-*) ──────────────────────────────────────────────────────
  if (asset.file_type.startsWith('SBL-')) {
    const sb = bibleSlugFromFileType(asset.file_type);
    if (!sb) {
      throw new Error(`Cannot parse Bible file_type: ${asset.file_type}`);
    }
    if (!asset.series_id) {
      throw new Error(`Bible asset ${asset.id} missing series_id`);
    }
    const series = await loadSeriesContext(supabase, asset.series_id);
    if (!series) throw new Error(`Series ${asset.series_id} not found`);
    return {
      prompt: buildBibleAssetPrompt({
        section: sb.section,
        slug: sb.slug,
        description: asset.content || asset.description || '',
        series,
      }),
      styleAnchorAssetId: series.styleGuide?.id ?? null,
      sourceBibleRefIds,
    };
  }

  // Episode reference — needs storyboard context. For Slice A we use a degraded
  // prompt because the storyboard shot context isn't passed in. EREF runner
  // (Slice D) uses `buildEpisodeRefPrompt` directly with full context.
  // Director-driven Regenerate from Drawer → Director typically edits the
  // existing prompt; first-pass not needed for episode_ref this way.
  if (asset.file_type.startsWith('IMG-episode_ref')) {
    if (!asset.series_id && !asset.episode_id) {
      throw new Error(`Episode ref ${asset.id} missing series_id and episode_id`);
    }
    return {
      prompt:
        `Episode reference for ${asset.filename}. ` +
        `Stored description: ${(asset.content || asset.description || '').slice(0, 800)}. ` +
        `Render as a single key frame, no text overlay, 16:9.`,
      styleAnchorAssetId: null,
      sourceBibleRefIds,
    };
  }

  // Thumbnail
  if (asset.file_type === 'IMG-thumbnail') {
    if (!asset.episode_id) {
      throw new Error(`Thumbnail ${asset.id} missing episode_id`);
    }
    const { data: ep } = await supabase
      .from('episodes')
      .select('id,episode_code,title_working,series_id')
      .eq('id', asset.episode_id)
      .maybeSingle();
    if (!ep) throw new Error(`Episode ${asset.episode_id} not found`);
    const series = ep.series_id
      ? await loadSeriesContext(supabase, ep.series_id)
      : { title: '', generalIdea: null, styleGuide: null };
    if (!series) throw new Error(`Series ${ep.series_id} not found`);
    return {
      prompt: buildThumbnailPrompt({
        episodeCode: ep.episode_code ?? '',
        episodeTitle: ep.title_working ?? '',
        briefSummary: asset.content || asset.description || '',
        series,
      }),
      styleAnchorAssetId: series.styleGuide?.id ?? null,
      sourceBibleRefIds,
    };
  }

  // Generic visual asset — fall back to description as prompt.
  return {
    prompt:
      (asset.content || asset.description || `Reference image for ${asset.filename}.`).slice(0, 2400),
    styleAnchorAssetId: null,
    sourceBibleRefIds,
  };
}
