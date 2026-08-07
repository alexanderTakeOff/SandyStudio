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
import { generateAnthropicText, AnthropicTextError } from '../../providers/anthropic-text';
import { generateImageOpenAI, OpenAIImageError } from '../../providers/openai-image';
import { persistBinary } from '../../persist-binary';
import { resolveModelId } from '../registry';
import type {
  AssetMetadataDoc,
  ImagePromptHistoryEntry,
  DescriptionHistoryEntry,
} from '../../api/series-bible';
import { buildProvenance, nextVersionFor } from '../../api/series-bible';
import { logEvent } from '../../api/events';
import { resolveBibleImageSize } from '../../api/bible-image-size';
import { getImageGenMultiProvider } from '../../providers/image-gen-multi-registry';
import { assembleBibleImageRequest } from '../series-canon-refs';
import { bibleSlug, parseRenderBrief } from '../../api/series-bible';

/** Per-entry slice of the canon digest handed to the author (chars). */
const CANON_DIGEST_ENTRY_CHARS = 400;
/** Total canon digest budget (chars) — beyond it, entries are named but not quoted. */
const CANON_DIGEST_TOTAL_CHARS = 6000;

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
  /**
   * Director's corrections to an article that already exists. Their presence
   * switches the writer from «compose» to «revise»: `baseContent` becomes the
   * untouchable base and these the delta on top of it.
   */
  notes?: string | null;
  /** The current article, supplied only alongside `notes`. */
  baseContent?: string | null;
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
    '3. **Palette** — dominant colours, finish.',
    // E33 (2026-07-29): a location card that says nothing about light hands the
    // scene's lighting to the reference plate, which is deliberately rendered
    // neutral so it can be reused — i.e. to daylight. Enumerating the states
    // gives the storyboard and the Plan something to CHOOSE, instead of a
    // silence each of them fills differently.
    '4. **Lighting states** — the fixed light sources built into the space (windows and',
    '   where they face, practicals, their colour), then an ENUMERATED list of the lighting',
    '   states this location can be shot in, one line each with its key source and falloff',
    '   (e.g. `day_window` — sun through the back window, soft fill, short shadows;',
    '   `night_practical` — the desk lamp is the only source, the rest of the room falls to',
    '   shadow). Close the section with this sentence verbatim: "The canonical reference',
    '   plate for this location is rendered under neutral even lighting so it can be reused',
    '   — it fixes layout and palette only. Each episode picks one lighting state above, and',
    '   that choice overrides the plate." Never declare one time of day as universal.',
    '5. **Mood & atmosphere** — what the place *feels* like.',
    '6. **Key props / set dressing** — recurring objects that anchor the space.',
    '7. **Sound design hint** — ambient sound texture (1 line).',
    '8. **Visual canon notes** — camera angles that work, signature framing.',
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

/**
 * How the canonical reference frame is FRAMED, per section. Positive only.
 *
 * 2026-07-30: these used to carry their prohibitions inline, up to seven lines
 * of «no …» for objects, inside the positive prompt. That is the attention
 * pollution openai-edits-multi's own comment warns about (2026-05-26 finding:
 * hard negatives placed up front starve the positive prompt). The prohibitions
 * moved to SECTION_NEGATIVE and now travel through the provider's negative
 * channel as one closing clause. Nothing was dropped — it was relocated.
 */
const SECTION_FRAMING: Record<BibleSection, string> = {
  character:
    'Render as a clean reference image — front-facing or three-quarter view, neutral background, full-body. Studio canon, reusable across many shots.',
  // "neutral natural lighting" STAYS — Director, 2026-07-29: «для канона
  // нейтраль как точка отсчёта, не более». A canon plate is a reference card,
  // not a frame; neutral light is what makes one plate reusable by every
  // episode. What must NOT survive is the plate's authority over a scene: the
  // location card enumerates the lighting states (SECTION_GUIDANCE above) and
  // the shot prompt states the scene's light as an explicit override (SCENE
  // LIGHT block in episode-reference-designer). Do not "fix" this line — the
  // defect it was blamed for lives downstream, in the silence around it.
  location:
    'Render as a clean establishing reference of the empty location under neutral natural lighting. Studio canon, reusable across many shots.',
  object:
    'Render exactly ONE clean hero view of ONE canonical object instance — front-facing or three-quarter view, empty neutral backdrop.',
  style:
    'Render as a clean style sample frame illustrating the aesthetic thesis. Neutral subject if applicable.',
};

/**
 * Default prohibitions per section, fed to the provider's `negative` channel
 * and merged with whatever the entry's own `## NEGATIVE` block declares.
 *
 * The object list is the longest for a reason recorded in
 * ~/.claude/skills/library-style-first-visual-generation-protocol: a primary
 * object reference is consumed downstream as identity canon, so a variant sheet
 * or a stray hand in it poisons every later shot. The Bible entry may describe
 * state variations and character interactions as *Animation notes* — those are
 * TEXT canon for the animator and must never be drawn into this plate.
 */
// Trimmed the same evening it shipped: the first list carried «logo, watermark,
// lettering» on every section — boilerplate that prevents a defect nobody has
// ever seen here, while every term in the negative clause costs attention the
// description needs. What stays is what has actually broken canon in this studio.
const SECTION_NEGATIVE: Record<BibleSection, readonly string[]> = {
  character: [],
  location: ['characters', 'people'],
  object: [
    'characters', 'humans', 'animals', 'hands',
    'multi-view sheet', 'contact sheet', 'turnaround grid', 'rows or columns of variants',
    'state variations such as broken damaged hidden or glowing',
    'scene context',
  ],
  style: [],
};

export function buildDescriptionPrompt(args: {
  seriesTitle: string;
  section: BibleSection;
  slug: string;
  seedDescription: string;
  generalIdea: string | null;
  styleGuide: string | null;
  /** RENDER blocks of canon already written for this series — must not be contradicted. */
  canonDigest?: string | null;
  /** The article as it stands today. Present only on a revision. */
  baseContent?: string | null;
  /** Director's corrections to that article. Present only on a revision. */
  notes?: string | null;
}): { systemPrompt: string; userMessage: string } {
  const { seriesTitle, section, slug, seedDescription, generalIdea, styleGuide, canonDigest } = args;
  const baseContent = args.baseContent?.trim() ?? '';
  const notes = args.notes?.trim() ?? '';
  const isRevision = Boolean(notes && baseContent);
  const systemPrompt = [
    `You are EXEC-BIBLE-AUTHOR, a Pixar-grade story-bible writer for the animated`,
    `series "${seriesTitle}". You produce concise, production-ready ${SECTION_LABEL[section]}`,
    `descriptions that downstream image and animation agents can render reliably.`,
    '',
    'Write in clean markdown. ~250-450 words. No filler. No meta-commentary.',
    'Every sentence must give a visual or behavioural fact a generator can use.',
    '',
    // 2026-07-30. The entry has two readers and mixing them is what poisoned
    // canon for months: the whole document used to be handed to the image model
    // verbatim, so canon ids, role labels and production arguments arrived as
    // things to draw. Asked to render «the body is never fully shown», the model
    // drew the body. Split the readers here, at the source.
    'The entry MUST end with these two sections, exactly these ASCII headings, in this order:',
    '',
    '## RENDER',
    'Three to eight sentences addressed to an image model, describing ONLY the canonical',
    'reference frame: subject, geometry, materials, palette, light, framing —',
    'AND its atmosphere. State only what IS there; never what must not be.',
    '',
    'Keep OUT: canon ids, version numbers, role or archetype labels, animation notes,',
    'production reasoning, any explanation of WHY a rule exists. If a rule has a production',
    'reason, state its visible consequence and drop the reason.',
    '',
    // 2026-07-30, same evening the split shipped. «Drawable nouns only» swept out
    // the mood along with the meta, and the first frame written under it came
    // back correct and dull — the Director's word. Atmosphere is not reasoning:
    // «ominous stillness», «geological, older than context» steer exposure,
    // contrast and composition as directly as geometry does. The line runs
    // between MOOD and META, not between nouns and everything else.
    'Keep IN — mood is a drawing instruction, not commentary. Devote at least one sentence to',
    'what the frame should FEEL like: its register, its stillness or menace, its age. A frame',
    'described only as geometry renders correct and lifeless.',
    'END the RENDER block with a `Refs:` line whenever the canon digest contains an entry this',
    'frame has to agree with — the interior of a vehicle must declare that vehicle, a prop held',
    'by a character must declare that character. Format: `Refs: slug_a, slug_b`, at most four',
    'slugs. Only those entries are attached as reference images, so an undeclared dependency is',
    'simply not seen by the renderer; the first entry written under this contract omitted the',
    'line and drew an interior that could not see its own hull. Declare only true dependencies —',
    'every reference dilutes the others equally. Omit the line only when the frame truly',
    'depends on nothing but the style anchor.',
    '',
    '## NEGATIVE',
    'A markdown list of short terms that must NOT appear. Terms only — no sentences, no',
    'justification. This list travels to the generator through a dedicated channel, so',
    'prohibitions belong here and NOWHERE else in the entry.',
    ...(isRevision
      ? [
          '',
          // 2026-07-30. The same shape that fixed the shot plan being replaced by
          // a critic's 2000-character retelling: the base is untouchable and the
          // note is a DELTA on top of it. A reviser that re-words what nobody
          // complained about silently discards decisions made earlier for reasons
          // the corrections do not restate.
          'REVISION. An article for this entry already exists and is given below as BASE.',
          'The BASE is authoritative and largely correct. Reproduce it IN FULL — every section,',
          'in the same order — changing ONLY what the CORRECTIONS name. Do not re-word untouched',
          'sentences, do not drop or merge sections, do not add ideas of your own. Where a',
          'correction contradicts the BASE, the correction wins and the surrounding text is',
          'adjusted just enough to stay consistent with it.',
        ]
      : []),
  ].join('\n');

  const lines: string[] = [];
  lines.push(
    isRevision
      ? `Revise the canonical Bible entry for ${SECTION_LABEL[section]}: **${slug}**.`
      : `Write the canonical Bible entry for ${SECTION_LABEL[section]}: **${slug}**.`,
  );
  lines.push('');
  // On a revision the seed is the stale one-line summary derived from the very
  // article being revised — feeding it back adds noise and an older truth.
  if (!isRevision && seedDescription.trim()) {
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
  if (canonDigest && canonDigest.trim()) {
    // Director's rule, 2026-07-30: whoever authors a canon entry must first READ
    // the canon already written for this series. That day's blister-versus-
    // porthole contradiction came from writing the interior entry without
    // re-reading the vehicle entry. Feeding the digest here turns the rule from
    // a habit the author must remember into an input it cannot miss — there is
    // no path into this function that skips it.
    lines.push('## Canon ALREADY WRITTEN for this series — you may not contradict it');
    lines.push(
      'Read this before writing. An entry that disagrees with existing canon is a defect, not a variation.',
      'If your entry genuinely depends on one of these, name its slug on the `Refs:` line of your RENDER block.',
      '',
      canonDigest.trim(),
      '',
    );
  }
  lines.push('## Required structure');
  lines.push(SECTION_GUIDANCE[section]);
  lines.push('');
  if (isRevision) {
    lines.push('## BASE — the article as it stands. Reproduce it; do not re-invent it.');
    lines.push(baseContent);
    lines.push('');
    // Corrections go LAST, after everything else, because the tail of a prompt
    // is where an instruction is least likely to be diluted.
    lines.push('## CORRECTIONS from the Director — apply exactly these, and nothing beyond them.');
    lines.push(notes);
    lines.push('');
  }
  lines.push('Output the full markdown body now. No code fences. No preamble.');
  return { systemPrompt, userMessage: lines.join('\n') };
}

/** Opening line of any Bible image prompt — shared by the RENDER path and the fallback. */
function sectionHeaderLine(seriesTitle: string, section: BibleSection): string {
  const sectionWord =
    section === 'character' ? 'character'
      : section === 'location' ? 'location'
      : section === 'object' ? 'prop'
      : 'style sample frame';
  return `Canonical ${sectionWord} reference for the animated series "${seriesTitle}".`;
}

function buildImagePrompt(args: {
  seriesTitle: string;
  section: BibleSection;
  description: string;
  styleGuide: string | null;
}): string {
  const { seriesTitle, section, description, styleGuide } = args;
  const lines = [
    sectionHeaderLine(seriesTitle, section),
    '',
    'Description:',
    description.slice(0, 2400),
  ];
  if (styleGuide && styleGuide.trim()) {
    lines.push('', 'Series art direction (must follow):');
    lines.push(styleGuide.trim().slice(0, 1200));
  }
  // Per-section closing instruction — POSITIVE framing only. Everything that
  // used to be phrased here as a prohibition («no characters, no humans, no
  // animals, no squirrels…») now lives in SECTION_NEGATIVE and rides the
  // provider's dedicated negative channel. See the comment on SECTION_NEGATIVE.
  lines.push('', SECTION_FRAMING[section]);
  return lines.join('\n');
}

async function loadSeriesContext(
  supabase: SupabaseClient<Database>,
  seriesId: string,
): Promise<{
  series: SeriesRow;
  styleAnchor: StyleAnchorRow | null;
  generalIdea: string | null;
  /** RENDER blocks of canon already written for this series — see the assembly below. */
  canonDigest: string | null;
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

  // Canon digest — the mechanism behind «read what is already written».
  // Only RENDER blocks: they are short, they are the drawable axis, and they are
  // exactly where «blister canopy» and «porthole rim» collide. Full prose would
  // blow the context and re-import the human half we just separated out.
  // LOCKED outranks APPROVED; DRAFT is excluded because a draft is not canon and
  // anchoring to it manufactures false conflicts.
  const canonQuery = await supabase
    .from('assets')
    .select('file_type,content,status')
    .eq('series_id', seriesId)
    .in('status', ['LOCKED', 'APPROVED'])
    .like('file_type', 'SBL-%')
    .order('status', { ascending: true });
  let canonDigest: string | null = null;
  if (!canonQuery.error && canonQuery.data) {
    const rows = (canonQuery.data as Array<{ file_type: string; content: string | null }>).filter(
      // Style and general idea already ride in their own dedicated blocks above.
      (r) => !/^SBL-(style|general_idea)/.test(r.file_type),
    );
    const parts: string[] = [];
    const omitted: string[] = [];
    let budget = CANON_DIGEST_TOTAL_CHARS;
    for (const r of rows) {
      // Label with the SLUG the author must write back on the `Refs:` line.
      // Labelling with the section-qualified name taught the wrong token and
      // the first declared reference HALTed on a slug that does not exist.
      const label = bibleSlug(r.file_type) || r.file_type.replace(/^SBL-/, '');
      const brief = parseRenderBrief(r.content);
      // Entries written before the RENDER convention (all of SS-S15) degrade to
      // their opening line rather than vanishing from the author's view.
      const body = (brief?.render ?? (r.content ?? '').trim().split('\n').find((l) => l.trim()) ?? '')
        .trim()
        .slice(0, CANON_DIGEST_ENTRY_CHARS);
      if (!body) continue;
      const chunk = `### ${label}\n${body}`;
      if (chunk.length > budget) {
        // Named, not silently dropped: the author must know the entry exists.
        omitted.push(label);
        continue;
      }
      budget -= chunk.length;
      parts.push(chunk);
    }
    if (omitted.length > 0) {
      parts.push(
        `### (not shown, ask before contradicting)\n${omitted.join(', ')}`,
      );
    }
    canonDigest = parts.length > 0 ? parts.join('\n\n') : null;
  }

  return { series: seriesRow as SeriesRow, styleAnchor, generalIdea, canonDigest };
}

export async function runBibleAuthor(
  args: RunBibleAuthorArgs,
): Promise<RunBibleAuthorResult> {
  const { supabase, assetId, seriesId, section, slug, seedDescription, filename, source } = args;
  const notes = args.notes?.trim() ?? '';
  const baseContent = args.baseContent?.trim() ?? '';
  const isRevision = Boolean(notes && baseContent);

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
  // A revision is the deliberate case this guard was never aimed at: the caller
  // has read what exists and named what to change. Only the accidental repeat
  // is refused.
  if (!isRevision && existingMeta.image_prompt && existingMeta.image_prompt.history.length > 0) {
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
    canonDigest: ctx.canonDigest,
    baseContent: isRevision ? baseContent : null,
    notes: isRevision ? notes : null,
  });
  let descriptionMd: string;
  let textCost = 0;
  try {
    const text = await generateAnthropicText({
      systemPrompt,
      userMessage,
      model,
      // 1200 was sized for the pre-2026-07-30 structure. With RENDER + NEGATIVE
      // required at the end, the first entry written under the new contract ran
      // out mid-sentence and never reached NEGATIVE — the list came back empty
      // and only the section defaults applied. The ceiling has to clear the
      // whole document, sections included. A revision must additionally
      // reproduce the entire base article before it can change anything in it,
      // so it needs roughly double — truncation there would silently amputate
      // the sections the corrections never mentioned.
      maxOutputTokens: isRevision ? 4000 : 2000,
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
  // `imagePrompt` is the pre-2026-07-30 shape — the whole entry handed to the
  // renderer. It survives ONLY as the fallback for entries with no RENDER block
  // (every SS-S15 entry), which is what keeps their behaviour byte-identical.
  const imagePrompt = buildImagePrompt({
    seriesTitle: ctx.series.title,
    section,
    description: descriptionMd,
    styleGuide,
  });
  const imagePromptHeader = sectionHeaderLine(ctx.series.title, section);
  // Director 2026-05-20 — was hardcoded 1024×1024 (1:1), which did not suit
  // landscape shows. Section-aware default: characters/objects → square
  // (best for a single hero specimen on neutral backdrop), locations/style
  // → landscape (environment + framing references match show format).
  // series.metadata.delivery_targets is not a column today; if it becomes
  // one later, callers can pass it through resolveBibleImageSize.
  const resolvedSize = resolveBibleImageSize({ section });

  // One assembler for all three Bible image paths — positive prompt, negative
  // channel, and the canon this entry declared it must agree with. See
  // lib/agents/series-canon-refs.ts for why this lives in one place.
  const assembled = await assembleBibleImageRequest(supabase as never, {
    seriesId,
    assetId,
    content: descriptionMd,
    fallbackPrompt: imagePrompt,
    // With a RENDER block the entry states its own framing and light, so only
    // the invariant is prefixed. SECTION_FRAMING carries section assumptions —
    // «empty location under neutral natural lighting» — which contradicted an
    // entry whose canon is a dark, beam-lit frame. Those assumptions belong to
    // the legacy fallback, where nobody stated anything.
    renderPrefix: `${imagePromptHeader}\n\nStudio canon reference plate — reusable across many shots.`,
    defaultNegative: SECTION_NEGATIVE[section],
  });

  // A reference the author DECLARED is load-bearing. Drawing without it produces
  // canon that is off-model by construction, and canon is the thing every later
  // frame anchors on — so stop before spending, the way a conflicting source of
  // truth is always handled here: escalate, never reconcile silently.
  if (assembled.halt) {
    throw new BibleAuthorError(assembled.halt);
  }

  const finalImagePrompt = assembled.prompt;
  let imgResult: {
    b64_data: string;
    cost_usd: number;
    width: number;
    height: number;
    provider: string;
  };
  try {
    if (assembled.refs.length > 0) {
      const provider = getImageGenMultiProvider('openai-edits-multi');
      const multi = await provider.generate({
        prompt: finalImagePrompt,
        references: assembled.refs,
        negative: assembled.negative,
        size: resolvedSize,
        quality: 'medium',
      });
      imgResult = {
        b64_data: multi.b64_data,
        cost_usd: multi.cost_usd,
        width: multi.width,
        height: multi.height,
        provider: multi.provider_id,
      };
    } else {
      // No canon to anchor on yet — the series' first entry, by definition.
      // gpt-image's text-to-image endpoint has no negative parameter, so the
      // terms are appended the way the multi-ref provider does it: one closing
      // clause, never up front where it would starve the description.
      const withNegative =
        assembled.negative.length > 0
          ? `${finalImagePrompt}\n\nAvoid depicting: ${assembled.negative.join('; ')}.`
          : finalImagePrompt;
      imgResult = await generateImageOpenAI({
        prompt: withNegative,
        size: resolvedSize,
        quality: 'medium',
      });
    }
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
    // Director directive 2026-05-20 — new layout for S15+:
    //   /SandyStudio/<seriesCode>/bible/images/<file>
    // S14 Bible files already in /SandyStudio/<root> stay there (not touched).
    seriesCode: ctx.series.code,
    bucket: 'bible',
    assetType: 'images',
    supabase,
  });

  const totalCost = textCost + imgResult.cost_usd;
  const nowIso = new Date().toISOString();

  // ── 3. Build metadata sub-docs ──────────────────────────────────────────────
  // A revision must ADD a version, never replace one. Before 2026-07-30 both
  // sub-docs were rebuilt from scratch at version 1, so the article and the
  // prompt that produced the previous frame were destroyed by the very call
  // meant to improve on them.
  const promptVersion = nextVersionFor(existingMeta.image_prompt);
  const descriptionVersion = nextVersionFor(existingMeta.description_history);

  const promptEntry: ImagePromptHistoryEntry = {
    version: promptVersion,
    prompt: finalImagePrompt,
    source: 'EXEC-BIBLE-AUTHOR',
    at: nowIso,
    cost_usd: imgResult.cost_usd,
    // Audit (2026-07-30): without these the question «did the model actually see
    // the hero reference?» is unanswerable after the fact — it had to be
    // re-derived by calling the loader by hand.
    provider_id: imgResult.provider,
    model: imgResult.provider,
    references_used: assembled.refs.map((r) => ({
      kind: r.kind,
      bible_asset_id: r.bible_asset_id,
    })),
    references_dropped: assembled.dropped,
    negative: assembled.negative,
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
    version: descriptionVersion,
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
      current_version: promptVersion,
      style_anchor_asset_id: ctx.styleAnchor?.id ?? null,
      history: [...(existingMeta.image_prompt?.history ?? []), promptEntry],
    },
    description_history: {
      current_version: descriptionVersion,
      history: [...(existingMeta.description_history?.history ?? []), descriptionEntry],
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
