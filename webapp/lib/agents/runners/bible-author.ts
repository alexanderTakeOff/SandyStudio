// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/bible-author.ts
// EXEC-BIBLE-AUTHOR — enriches a freshly-created Bible DRAFT with:
//   1. A rich, section-appropriate description (Anthropic Sonnet)
//   2. A first reference image (gpt-image-2, anchored on Style Bible)
//   3. Provenance + image_prompt v1 + description_history v1 in metadata
//
// Called inline from POST /api/series/[id]/bible/extensions when Director
// approves a canon extension proposal. Idempotent at the asset level — we
// treat metadata.image_prompt.history.length > 0 as "already enriched"
// and short-circuit.
//
// Failure mode: if either Sonnet or gpt-image-2 fails we still keep the
// DRAFT row alive (caller can retry); we surface the error so the route
// can record a blocker_raised activity_event and let Director retry.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/types.gen';
import { generateAnthropicText, AnthropicTextError } from '../providers/anthropic-text';
import { generateImageOpenAI, OpenAIImageError } from '../providers/openai-image';
import { persistBinary } from '../persist-binary';
import { resolveModelId } from '../registry';
import type {
  AssetMetadataDoc,
  ImagePromptHistoryEntry,
  DescriptionHistoryEntry,
} from '../../api/series-bible';
import { buildProvenance } from '../../api/series-bible';
import { logEvent } from '../../api/events';

export class BibleAuthorError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'BibleAuthorError';
  }
}

export type BibleSection = 'character' | 'location' | 'object' | 'style';

export interface RunBibleAuthorArgs {
  supabase: SupabaseClient<Database>;
  /** Existing DRAFT asset id (from extensions route INSERT). */
  assetId: string;
  /** Parent series UUID. */
  seriesId: string;
  /** Section type — drives prompt template + image framing. */
  section: BibleSection;
  /** Slug (e.g. 'enforcement_booth') used for filename + image hint. */
  slug: string;
  /** Director-supplied seed (from canon proposal); may be empty. */
  seedDescription: string;
  /** Filename of the asset row (kept stable in extensions route). */
  filename: string;
  /** Source bucket for provenance. */
  source: 'canon_extension_approval' | 'manual_add' | 'pipeline';
}

export interface RunBibleAuthorResult {
  contentMd: string;
  imagePrompt: string;
  costUsd: number;
  imageWidth: number;
  imageHeight: number;
  styleAnchorAssetId: string | null;
}

interface SeriesRow {
  id: string;
  code: string;
  title: string;
}

interface StyleAnchorRow {
  id: string;
  description: string | null;
  content: string | null;
}

interface GeneralIdeaRow {
  description: string | null;
  content: string | null;
}

const SECTION_LABEL: Record<BibleSection, string> = {
  character: 'character',
  location: 'location',
  object: 'object / prop',
  style: 'style sample',
};

const SECTION_GUIDANCE: Record<BibleSection, string> = {
  character: [
    'Cover (in this exact order):',
    '1. **Identity** — name, role, archetype, age impression.',
    '2. **Silhouette & body** — proportions, materials, distinctive shape.',
    '3. **Face & expression** — eyes, mouth, signature look.',
    '4. **Costume & accessories** — what they wear, key colours.',
    '5. **Movement & posture** — how they stand, walk, gesture.',
    '6. **Voice & speech** — tone, cadence, catchphrases (1-2 lines).',
    '7. **Personality core** — drive, fear, comedic engine.',
    '8. **Visual canon notes** — palette, line weight, lighting that always reads as them.',
  ].join('\n'),
  location: [
    'Cover (in this exact order):',
    '1. **Identity** — name, function, scale.',
    '2. **Architecture & materials** — structure, textures, era.',
    '3. **Palette & lighting** — dominant colours, light sources, time of day if fixed.',
    '4. **Mood & atmosphere** — what the place *feels* like.',
    '5. **Key props / set dressing** — recurring objects that anchor the space.',
    '6. **Sound design hint** — ambient sound texture (1 line).',
    '7. **Visual canon notes** — camera angles that work, signature framing.',
  ].join('\n'),
  object: [
    'Cover (in this exact order):',
    '1. **Identity** — name, function in story. Use the most specific production noun (e.g. "trumeau vanity dresser with mirror", not "mirror"; "flat-strap dog leash", not "rope").',
    '2. **Form & materials** — shape, scale, texture, weight of the SINGLE canonical object.',
    '3. **Palette** — dominant colours, finish.',
    '4. **Visual canon notes** — recurring framing or detail when this object appears on screen.',
    '',
    'After the canonical sections above, you MAY add the following as TEXT-ONLY animation notes (they document behaviour but MUST NOT be drawn into the primary object reference image):',
    '- *Animation notes — state variations* (broken, glowing, hidden, etc.) — text only.',
    '- *Animation notes — character interactions* (held, worn, avoided) — text only.',
    '',
    'Hard rule: the primary object reference is ONE clean hero view of ONE canonical object instance. No characters, hands, animals, silhouettes. No variant sheet, no contact sheet, no rows/columns. State/interaction notes live in TEXT only and do not justify multi-view image output. See ~/.claude/skills/library-style-first-visual-generation-protocol.',
  ].join('\n'),
  style: [
    'Cover (in this exact order):',
    '1. **Direction** — one-line aesthetic thesis.',
    '2. **Line & shape** — outline weight, geometry, silhouette discipline.',
    '3. **Palette** — primary + accent colours, hex if known.',
    '4. **Lighting** — flat / volumetric / dramatic; key & fill behaviour.',
    '5. **Composition** — framing tendencies, negative space, rule of thirds vs centred.',
    '6. **Texture & finish** — grain, gradients, line cleanliness.',
    '7. **References** — adjacent visual languages (one or two named touchstones).',
  ].join('\n'),
};

function buildDescriptionPrompt(args: {
  seriesTitle: string;
  section: BibleSection;
  slug: string;
  seedDescription: string;
  generalIdea: string | null;
  styleGuide: string | null;
}): { systemPrompt: string; userMessage: string } {
  const { seriesTitle, section, slug, seedDescription, generalIdea, styleGuide } = args;
  const systemPrompt = [
    `You are EXEC-BIBLE-AUTHOR, a Pixar-grade story-bible writer for the animated`,
    `series "${seriesTitle}". You produce concise, production-ready ${SECTION_LABEL[section]}`,
    `descriptions that downstream image and animation agents can render reliably.`,
    '',
    'Write in clean markdown. ~250-450 words. No filler. No meta-commentary.',
    'Every sentence must give a visual or behavioural fact a generator can use.',
  ].join('\n');

  const lines: string[] = [];
  lines.push(`Write the canonical Bible entry for ${SECTION_LABEL[section]}: **${slug}**.`);
  lines.push('');
  if (seedDescription.trim()) {
    lines.push('## Seed (from Director / proposing agent)');
    lines.push(seedDescription.trim());
    lines.push('');
  }
  if (generalIdea && generalIdea.trim()) {
    lines.push('## Series general idea (must align with this)');
    lines.push(generalIdea.trim().slice(0, 1500));
    lines.push('');
  }
  if (styleGuide && styleGuide.trim()) {
    lines.push('## Series art direction (must follow this)');
    lines.push(styleGuide.trim().slice(0, 1500));
    lines.push('');
  }
  lines.push('## Required structure');
  lines.push(SECTION_GUIDANCE[section]);
  lines.push('');
  lines.push('Output the full markdown body now. No code fences. No preamble.');
  return { systemPrompt, userMessage: lines.join('\n') };
}

function buildImagePrompt(args: {
  seriesTitle: string;
  section: BibleSection;
  description: string;
  styleGuide: string | null;
}): string {
  const { seriesTitle, section, description, styleGuide } = args;
  const sectionWord =
    section === 'character' ? 'character'
      : section === 'location' ? 'location'
      : section === 'object' ? 'prop'
      : 'style sample frame';
  const lines = [
    `Canonical ${sectionWord} reference for the animated series "${seriesTitle}".`,
    '',
    'Description:',
    description.slice(0, 2400),
  ];
  if (styleGuide && styleGuide.trim()) {
    lines.push('', 'Series art direction (must follow):');
    lines.push(styleGuide.trim().slice(0, 1200));
  }
  // Per-section closing instruction. Objects MUST be single-hero-view without
  // characters/variants — the description may contain *Animation notes — state
  // variations* and *Animation notes — character interactions* sections, those
  // are TEXT canon only and must not be drawn. The primary object reference
  // exists to be consumed as identity canon downstream; variants pollute it.
  // See ~/.claude/skills/library-style-first-visual-generation-protocol.
  if (section === 'object') {
    lines.push(
      '',
      'Render exactly ONE clean hero view of ONE canonical object instance — front-facing or three-quarter view, neutral background, no text overlay, no logo, no watermark.',
      'HARD CONSTRAINTS for this primary object reference (violation = unusable canon):',
      '- no characters, no humans, no animals, no squirrels, no dogs, no hands, no arms, no silhouettes, no reflected characters in mirrors/glass.',
      '- no multi-view sheet, no contact sheet, no turnaround grid, no rows/columns of variants, no scale chart, no exploded view.',
      '- no state variations in the image (broken, damaged, hidden, glowing). Even if the Description mentions them as *Animation notes*, those are TEXT only — do NOT depict.',
      '- no surrounding props, no scene context. Empty / neutral backdrop only.',
      'If the Description includes sections titled "Animation notes — state variations" or "Animation notes — character interactions", treat them as text canon for downstream animation only. They are NOT permission to add characters or variants to this primary reference.',
    );
  } else if (section === 'character') {
    lines.push(
      '',
      'Render as a clean reference image — front-facing or three-quarter view, neutral background, full-body, no text overlay, no logo, no watermark. Studio canon — should be reusable across many shots.',
    );
  } else if (section === 'location') {
    lines.push(
      '',
      'Render as a clean establishing reference of the empty location — no characters present, neutral natural lighting, no text overlay, no logo, no watermark. Studio canon — should be reusable across many shots.',
    );
  } else {
    // style sample
    lines.push(
      '',
      'Render as a clean style sample frame illustrating the aesthetic thesis. Neutral subject if applicable. No text overlay, no logo, no watermark.',
    );
  }
  return lines.join('\n');
}

async function loadSeriesContext(
  supabase: SupabaseClient<Database>,
  seriesId: string,
): Promise<{
  series: SeriesRow;
  styleAnchor: StyleAnchorRow | null;
  generalIdea: string | null;
}> {
  const { data: seriesRow, error: serr } = await supabase
    .from('series')
    .select('id,code,title')
    .eq('id', seriesId)
    .maybeSingle();
  if (serr) throw new BibleAuthorError(`series fetch: ${serr.message}`);
  if (!seriesRow) throw new BibleAuthorError(`series not found: ${seriesId}`);

  // Prefer LOCKED style anchor; fall back to APPROVED then DRAFT to keep the
  // pipeline unblocked when the director hasn't yet locked a style.
  const styleQuery = await supabase
    .from('assets')
    .select('id,description,content,status')
    .eq('series_id', seriesId)
    .like('file_type', 'SBL-style%')
    .order('updated_at', { ascending: false });
  let styleAnchor: StyleAnchorRow | null = null;
  if (!styleQuery.error && styleQuery.data) {
    const rows = styleQuery.data as Array<{
      id: string;
      description: string | null;
      content: string | null;
      status: string;
    }>;
    const lockedFirst =
      rows.find((r) => r.status === 'LOCKED') ??
      rows.find((r) => r.status === 'APPROVED') ??
      rows[0];
    if (lockedFirst) {
      styleAnchor = {
        id: lockedFirst.id,
        description: lockedFirst.description,
        content: lockedFirst.content,
      };
    }
  }

  const giQuery = await supabase
    .from('assets')
    .select('description,content')
    .eq('series_id', seriesId)
    .like('file_type', 'SBL-general_idea%')
    .limit(1);
  let generalIdea: string | null = null;
  if (!giQuery.error && giQuery.data && giQuery.data[0]) {
    const row = giQuery.data[0] as GeneralIdeaRow;
    generalIdea = row.content || row.description || null;
  }

  return { series: seriesRow as SeriesRow, styleAnchor, generalIdea };
}

export async function runBibleAuthor(
  args: RunBibleAuthorArgs,
): Promise<RunBibleAuthorResult> {
  const { supabase, assetId, seriesId, section, slug, seedDescription, filename, source } = args;

  // Idempotency check — if metadata.image_prompt already has history entries,
  // do not re-enrich. This protects against double approval / retries.
  const existing = await supabase
    .from('assets')
    .select('*')
    .eq('id', assetId)
    .maybeSingle();
  if (existing.error) {
    throw new BibleAuthorError(`asset lookup: ${existing.error.message}`);
  }
  if (!existing.data) {
    throw new BibleAuthorError(`asset not found: ${assetId}`);
  }
  const existingRow = existing.data as unknown as {
    status: string;
    metadata: AssetMetadataDoc | null;
  };
  const existingMeta = (existingRow.metadata ?? {}) as AssetMetadataDoc;
  if (existingMeta.image_prompt && existingMeta.image_prompt.history.length > 0) {
    throw new BibleAuthorError(`asset ${assetId} already enriched (image_prompt v${existingMeta.image_prompt.current_version})`);
  }
  if (existingRow.status === 'LOCKED') {
    throw new BibleAuthorError(`asset ${assetId} is LOCKED — refusing to enrich`);
  }

  const ctx = await loadSeriesContext(supabase, seriesId);
  const styleGuide = ctx.styleAnchor
    ? ctx.styleAnchor.content || ctx.styleAnchor.description
    : null;

  // ── 1. Description via Anthropic Sonnet ─────────────────────────────────────
  const model = resolveModelId('EXEC-BIBLE-AUTHOR');
  const { systemPrompt, userMessage } = buildDescriptionPrompt({
    seriesTitle: ctx.series.title,
    section,
    slug,
    seedDescription,
    generalIdea: ctx.generalIdea,
    styleGuide,
  });
  let descriptionMd: string;
  let textCost = 0;
  try {
    const text = await generateAnthropicText({
      systemPrompt,
      userMessage,
      model,
      maxOutputTokens: 1200,
      expectsJson: false,
    });
    descriptionMd = text.markdown.trim();
    textCost = text.costUsd;
  } catch (err: unknown) {
    if (err instanceof AnthropicTextError) {
      throw new BibleAuthorError(`description generation failed: ${err.message}`, err);
    }
    throw err;
  }

  // ── 2. First reference image via gpt-image-2 ────────────────────────────────
  const imagePrompt = buildImagePrompt({
    seriesTitle: ctx.series.title,
    section,
    description: descriptionMd,
    styleGuide,
  });
  let imgResult;
  try {
    imgResult = await generateImageOpenAI({
      prompt: imagePrompt,
      size: '1024x1024',
      quality: 'medium',
    });
  } catch (err: unknown) {
    if (err instanceof OpenAIImageError) {
      throw new BibleAuthorError(`image generation failed: ${err.message}`, err);
    }
    throw err;
  }

  const persisted = await persistBinary({
    base64: imgResult.b64_data,
    ext: 'png',
    driveFilename: filename.replace(/\.md$/, '.png'),
    localHint: `bible-${section}-${slug}`,
    episodeCode: undefined,
    supabase,
  });

  const totalCost = textCost + imgResult.cost_usd;
  const nowIso = new Date().toISOString();

  // ── 3. Build metadata sub-docs ──────────────────────────────────────────────
  const promptEntry: ImagePromptHistoryEntry = {
    version: 1,
    prompt: imagePrompt,
    source: 'EXEC-BIBLE-AUTHOR',
    at: nowIso,
    cost_usd: imgResult.cost_usd,
    // Store browser-loadable url; absolutePath is OS-specific and breaks <img>.
    // seed-sandy-bible.ts uses the same convention.
    staging_path: persisted.browserUrl,
    drive_file_id: persisted.driveFileId,
    drive_web_view_url: persisted.driveWebViewUrl,
    width: imgResult.width,
    height: imgResult.height,
    quality: 'medium',
  };
  const descriptionEntry: DescriptionHistoryEntry = {
    version: 1,
    content: descriptionMd,
    source: 'EXEC-BIBLE-AUTHOR',
    at: nowIso,
  };

  const provenance =
    existingMeta.provenance ??
    buildProvenance({
      by: 'EXEC-BIBLE-AUTHOR',
      byKind: 'agent',
      source,
      at: nowIso,
    });

  const newMeta: AssetMetadataDoc = {
    ...existingMeta,
    provenance: {
      ...provenance,
      // Stamp last_modified to record the enrichment pass.
      last_modified_by: 'EXEC-BIBLE-AUTHOR',
      last_modified_by_kind: 'agent',
      last_modified_at: nowIso,
    },
    image_prompt: {
      current_version: 1,
      style_anchor_asset_id: ctx.styleAnchor?.id ?? null,
      history: [promptEntry],
    },
    description_history: {
      current_version: 1,
      history: [descriptionEntry],
    },
  };

  // ── 4. Update the existing DRAFT row ───────────────────────────────────────
  // Cast: types.gen lags behind migration 0020 (metadata column). The shape is
  // strictly AssetMetadataDoc above — the cast is type-system-only.
  const update = await supabase
    .from('assets')
    .update({
      content: descriptionMd,
      // Keep `description` as a short summary line for list views; markdown
      // body lives in `content`. Truncate to fit the 2000-char description cap.
      description: descriptionMd.slice(0, 280).split('\n')[0] ?? '',
      // staging_path = browser-loadable url, NOT OS-specific absolutePath.
      staging_path: persisted.browserUrl,
      drive_file_id: persisted.driveFileId,
      drive_web_view_url: persisted.driveWebViewUrl,
      drive_path: persisted.browserUrl,
      metadata: newMeta as unknown as Record<string, unknown>,
    } as never)
    .eq('id', assetId);

  if (update.error) {
    throw new BibleAuthorError(`asset update failed: ${update.error.message}`);
  }

  // TD-20.B 2026-05-20 — emit agent_completed so Polina auto-reacts to her
  // own Library enrichment completing. Without this the runner finished
  // silently and Director's expectation "the asset appeared, she should
  // notice" was never met. Fire-and-forget; logEvent itself sends
  // `pa/notify-needed` via Inngest after a successful row insert.
  await logEvent(supabase, {
    event_type: 'agent_completed',
    severity: 'info',
    title: `Bible Editor enriched: ${section}/${slug}`,
    description: `Library asset ready (${imgResult.width}×${imgResult.height}, $${totalCost.toFixed(4)})`,
    actor: 'EXEC-BIBLE-AUTHOR',
    asset_id: assetId,
    episode_id: null,
    metadata: {
      kind: 'bible_enrichment',
      section,
      slug,
      cost_usd: totalCost,
      width: imgResult.width,
      height: imgResult.height,
      style_anchor_asset_id: ctx.styleAnchor?.id ?? null,
      filename,
      source,
    },
  });

  return {
    contentMd: descriptionMd,
    imagePrompt,
    costUsd: totalCost,
    imageWidth: imgResult.width,
    imageHeight: imgResult.height,
    styleAnchorAssetId: ctx.styleAnchor?.id ?? null,
  };
}
