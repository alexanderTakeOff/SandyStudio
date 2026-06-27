// ──────────────────────────────────────────────────────────────────────────────
// lib/api/vgen-shot-helpers.ts
// Shared helpers for the VGEN Pilot Pass + per-shot fan-out + Universal Core
// editor surface (purrfect-stirring-hollerith plan, Phase 1).
//
// What lives here:
//   - getApprovedEREFForShot()   — load the approved IMG-episode_ref + base64
//                                  image bytes for a storyboard shot, ready
//                                  to feed Veo 3's referenceImageBase64.
//   - getStoryboardShotById()    — pluck a single StoryboardShotV2 from the
//                                  approved storyboard's content blob.
//   - pickPilotVgenShots()       — choose the 1-2 representative shots for
//                                  the Pilot Pass (1 establishing + 1 action).
//   - buildShotPromptV2()        — compose a real Veo 3 prompt from storyboard
//                                  metadata (action_prose, characters, camera,
//                                  expected_gag) instead of "shot ?" filler.
//   - effectiveDurationSeconds   — re-export from animatic-shotlist for
//                                  one-stop-shop usage in the runner.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';

import {
  effectiveDurationSeconds,
  extractShotsFromStoryboard,
  type AnimaticShot,
} from './animatic-shotlist';

export { effectiveDurationSeconds };

/**
 * Thrown by `loadApprovedMediaOrThrow` when an asset's media cannot be resolved
 * to readable bytes through the canonical Drive-aware reader. Callers that need
 * img2vid bytes (a Director-supplied reference / end-frame) MUST let this
 * propagate — silently dropping the reference turns img2vid into t2v, which is
 * exactly the identity-drift failure this path exists to prevent (I3).
 */
export class ReferenceLoadError extends Error {
  constructor(
    public readonly assetId: string,
    message: string,
  ) {
    super(message);
    this.name = 'ReferenceLoadError';
  }
}

// ── Storyboard v2 shape ──────────────────────────────────────────────────────
//
// Mirrors the parser in animatic-shotlist but exposes more fields the prompt
// builder needs (action_prose, expected_gag, camera_angle, characters[]).

export interface StoryboardShotCharacter {
  bible_slug?: string;
  display_name?: string;
  emotion?: string;
}

export interface StoryboardShotV2 {
  shot_id: string;
  shot_role?: string;
  duration_seconds?: number;
  action?: string;
  /** Prose-style action description (storyboarder@v2). */
  action_prose?: string;
  key_beat?: string;
  /** "WIDE", "MEDIUM", "CLOSE-UP", "OTS"… */
  camera_angle?: string;
  /** Comedy-specific beat metadata. */
  expected_gag?: string;
  expected_emotion?: string;
  characters?: StoryboardShotCharacter[];
  /** v1 fallback. */
  characters_present?: string[];
  /**
   * TD-30 (2026-05-21): bible-locked location object (or flat string for
   * legacy storyboards). Designer reads `location.slug` to look up prior
   * APPROVED IMG-episode_ref in the same location and embed it as a
   * scene_continuity anchor.
   */
  location?: string | { slug?: string; sub_area?: string };
  /**
   * Storyboarder's shot-to-shot carry-over note (pose, prop state, lighting
   * that must match the previous frame). Feeds the WCHK state-ledger
   * extraction (Motor 1, 2026-06-11).
   */
  continuity_notes?: string;
}

interface StoryboardJson {
  acts?: Array<{ shots?: unknown[] }>;
}

function parseStoryboardJson(content: string): StoryboardJson | null {
  const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]?.[1];
  if (!last) return null;
  try {
    return JSON.parse(last.trim()) as StoryboardJson;
  } catch {
    return null;
  }
}

function shotToV2(s: unknown): StoryboardShotV2 | null {
  if (!s || typeof s !== 'object') return null;
  const sh = s as Record<string, unknown>;
  if (typeof sh.shot_id !== 'string') return null;
  let characters: StoryboardShotCharacter[] | undefined;
  if (Array.isArray(sh.characters)) {
    const parsed: StoryboardShotCharacter[] = [];
    for (const c of sh.characters) {
      if (!c || typeof c !== 'object') continue;
      const obj = c as Record<string, unknown>;
      const entry: StoryboardShotCharacter = {};
      if (typeof obj.bible_slug === 'string') entry.bible_slug = obj.bible_slug;
      if (typeof obj.display_name === 'string') entry.display_name = obj.display_name;
      if (typeof obj.emotion === 'string') entry.emotion = obj.emotion;
      parsed.push(entry);
    }
    characters = parsed;
  }

  return {
    shot_id: sh.shot_id,
    shot_role: typeof sh.shot_role === 'string' ? sh.shot_role : undefined,
    duration_seconds:
      typeof sh.duration_seconds === 'number' && sh.duration_seconds > 0
        ? sh.duration_seconds
        : undefined,
    action: typeof sh.action === 'string' ? sh.action : undefined,
    action_prose: typeof sh.action_prose === 'string' ? sh.action_prose : undefined,
    key_beat: typeof sh.key_beat === 'string' ? sh.key_beat : undefined,
    camera_angle: typeof sh.camera_angle === 'string' ? sh.camera_angle : undefined,
    expected_gag: typeof sh.expected_gag === 'string' ? sh.expected_gag : undefined,
    expected_emotion:
      typeof sh.expected_emotion === 'string' ? sh.expected_emotion : undefined,
    continuity_notes:
      typeof sh.continuity_notes === 'string' ? sh.continuity_notes : undefined,
    characters,
    characters_present: Array.isArray(sh.characters_present)
      ? sh.characters_present.filter((x): x is string => typeof x === 'string')
      : undefined,
    // TD-30: preserve location field (string OR { slug, sub_area } object)
    // so Designer can extract the bible-locked location_slug.
    location:
      typeof sh.location === 'string'
        ? sh.location
        : sh.location && typeof sh.location === 'object'
          ? {
              slug:
                typeof (sh.location as { slug?: unknown }).slug === 'string'
                  ? String((sh.location as { slug?: unknown }).slug)
                  : undefined,
              sub_area:
                typeof (sh.location as { sub_area?: unknown }).sub_area === 'string'
                  ? String((sh.location as { sub_area?: unknown }).sub_area)
                  : undefined,
            }
          : undefined,
  };
}

/**
 * Every shot of the storyboard as full V2 objects in production order.
 * Pure parser — no DB calls. Empty array when content is malformed.
 * Added 2026-06-11 for the WCHK state-ledger extraction (Motor 1): the
 * extraction needs action_prose + continuity_notes + duration of EVERY shot
 * in timeline order, which the Summary shape does not carry.
 */
export function listStoryboardShotsV2(content: string): StoryboardShotV2[] {
  const json = parseStoryboardJson(content);
  if (!json || !Array.isArray(json.acts)) return [];
  const out: StoryboardShotV2[] = [];
  for (const act of json.acts) {
    if (!act || !Array.isArray(act.shots)) continue;
    for (const raw of act.shots) {
      const sh = shotToV2(raw);
      if (sh) out.push(sh);
    }
  }
  return out;
}

/**
 * Find a single shot by id within an approved storyboard's content blob.
 * Returns null when the storyboard cannot be parsed or the shot is missing —
 * the runner translates this into a hard failure (the shot's data is the
 * only authoritative source for the prompt).
 */
export function getStoryboardShotById(
  content: string,
  shotId: string,
): StoryboardShotV2 | null {
  const json = parseStoryboardJson(content);
  if (!json || !Array.isArray(json.acts)) return null;
  const all: StoryboardShotV2[] = [];
  for (const act of json.acts) {
    if (!act || !Array.isArray(act.shots)) continue;
    for (const raw of act.shots) {
      const sh = shotToV2(raw);
      if (sh) all.push(sh);
    }
  }
  // Exact canonical match only. shot_id is now stable identity (S-E-SH), assigned
  // by position and resolved at the dispatch door (resolveShotId) — there is no
  // unstable scene prefix left to misremember, so the old SH-number fallback
  // (which forgave a guessed-wrong scene/act prefix) is deleted. A genuinely
  // wrong id fails loud (null), as it should.
  return all.find((sh) => sh.shot_id === shotId) ?? null;
}

/**
 * 2026-05-22 — `listStoryboardShots(content)` returns every shot from the
 * storyboard in production order, paired with its act number and the index
 * inside that act. Used by the PA `listShots` tool so Polina can answer
 * questions like "give me the shotId of SH09" without asking the Director.
 *
 * Pure parser — no DB calls. Returns empty array when content is malformed
 * or has no acts/shots.
 */
export interface StoryboardShotSummary {
  shotId: string;
  act: number;
  shotIndex: number; // 0-based within the act
  globalIndex: number; // 0-based across the whole episode
  shotRole?: string;
  durationSeconds?: number;
  /** Truncated action prose for at-a-glance recognition (≤120 chars). */
  actionPreview?: string;
  expectedGag?: string | null;
  cameraAngle?: string;
  charactersPresent: string[];
  /** Either the flat string location or the bible-locked slug. */
  location?: string;
}

/**
 * 2026-05-22 — extract a short, human-friendly shot label from a full
 * canonical shotId. Used by per-shot agent functions to surface readable
 * context in `agent_started` / `agent_completed` activity titles.
 *
 *   "SS-S15-E01-A2-SC04-SH08"  → "A2-SC04-SH08"
 *   "SS-S15-E01-A2-SC04-SH123" → "A2-SC04-SH123"
 *   "A2-SC04-SH08"             → "A2-SC04-SH08"
 *   "SH08"                     → "SH08" (legacy fallback)
 *   ""                          → ""
 *   "random-string"             → "random-string" (passthrough)
 *
 * 2026-06-22 (Director q1a): the label MUST be the scene-qualified key, not
 * bare "SH08". SH numbering resets per scene, so dozens of shots share
 * "SH01" — the bare label made the activity feed (and Polina, who reads it)
 * conflate different shots into one. Prefer the full A#-SC##-SH## key.
 *
 * Pure function. Director sees "A2-SC04-SH08", never the UUID-shaped full id.
 */
export function shortShotLabel(shotId: string | null | undefined): string {
  if (!shotId || typeof shotId !== 'string') return '';
  const full = shotId.match(/A\d+-SC\d+-SH\d+/i);
  if (full) return full[0].toUpperCase();
  const shOnly = shotId.match(/SH\d+/i);
  return shOnly ? shOnly[0].toUpperCase() : shotId;
}

// DELETED 2026-06-26 (shot-identity refactor Phase 2): shotIdsMatchLoose,
// FULL_SHOT_ID_RE, BARE_SHOT_SUFFIX_RE, normalizeShotId. These were the
// "normalize / loose-match the unstable scene prefix at the door" band-aids.
// With identity = S-E-SH (no act/scene to misremember) and resolveShotId at the
// single dispatch door (lib/api/shot-id.ts), every downstream comparison is an
// exact `===` on a canonical id. Nothing left to normalize — the class is gone.

export function listStoryboardShots(
  content: string,
): StoryboardShotSummary[] {
  const json = parseStoryboardJson(content);
  if (!json || !Array.isArray(json.acts)) return [];
  const out: StoryboardShotSummary[] = [];
  let globalIndex = 0;
  for (const act of json.acts) {
    if (!act || typeof act !== 'object') continue;
    const a = act as { act?: unknown; shots?: unknown };
    const actNum = typeof a.act === 'number' ? a.act : 0;
    if (!Array.isArray(a.shots)) continue;
    let idxInAct = 0;
    for (const raw of a.shots) {
      const sh = shotToV2(raw);
      if (!sh) continue;
      // Pull a couple of extra fields not already on StoryboardShotV2 for
      // a richer summary.
      const rawObj = raw as Record<string, unknown>;
      const charactersPresent: string[] = [];
      if (Array.isArray(sh.characters)) {
        for (const c of sh.characters) {
          if (c.bible_slug) charactersPresent.push(c.bible_slug);
        }
      } else if (Array.isArray(sh.characters_present)) {
        for (const slug of sh.characters_present) {
          if (typeof slug === 'string' && slug) charactersPresent.push(slug);
        }
      }
      let locationStr: string | undefined;
      const locRaw = rawObj.location;
      if (typeof locRaw === 'string') {
        locationStr = locRaw;
      } else if (locRaw && typeof locRaw === 'object') {
        const slug = (locRaw as { slug?: unknown }).slug;
        if (typeof slug === 'string' && slug.length > 0) locationStr = slug;
      }
      const action = sh.action_prose ?? sh.action ?? sh.key_beat ?? undefined;
      out.push({
        shotId: sh.shot_id,
        act: actNum,
        shotIndex: idxInAct,
        globalIndex,
        shotRole: sh.shot_role,
        durationSeconds: sh.duration_seconds,
        actionPreview:
          typeof action === 'string' && action.length > 0
            ? action.length <= 120
              ? action
              : `${action.slice(0, 119).trimEnd()}…`
            : undefined,
        expectedGag:
          typeof sh.expected_gag === 'string' ? sh.expected_gag : null,
        cameraAngle: sh.camera_angle,
        charactersPresent,
        location: locationStr,
      });
      idxInAct += 1;
      globalIndex += 1;
    }
  }
  return out;
}

// ── Pilot picker ─────────────────────────────────────────────────────────────

/**
 * Pick the 1-2 representative shots for the Pilot Pass.
 *
 * Strategy:
 *   1. First "establishing" shot (or shot_role == "wide", "intro").
 *   2. First "action" / "gag" / "punchline" shot (whichever appears earliest).
 *   3. If shot_role variety is missing, take the first 2 shots in order.
 *
 * Returns a stable, ordered list of {shotId, durationSeconds, shotRole}
 * suitable for emitting `sandystudio/exec-vgen/start` events directly.
 */
export interface PilotShotPick {
  shotId: string;
  durationSeconds: number;
  shotRole?: string;
}

const ESTABLISHING_ROLES = new Set(['establishing', 'wide', 'intro', 'opener']);
const ACTION_ROLES = new Set([
  'action',
  'gag',
  'punchline',
  'beat',
  'climax',
  'reaction',
]);

export function pickPilotVgenShots(shotList: AnimaticShot[]): PilotShotPick[] {
  if (shotList.length === 0) return [];

  const findFirst = (predicate: (s: AnimaticShot) => boolean): AnimaticShot | undefined =>
    shotList.find(predicate);

  const establishing = findFirst((s) =>
    s.shot_role ? ESTABLISHING_ROLES.has(s.shot_role.toLowerCase()) : false,
  );
  const action = findFirst((s) => {
    if (!s.shot_role) return false;
    if (establishing && s.shot_id === establishing.shot_id) return false;
    return ACTION_ROLES.has(s.shot_role.toLowerCase());
  });

  const picks: AnimaticShot[] = [];
  if (establishing) picks.push(establishing);
  if (action) picks.push(action);

  // Fallback: if we couldn't find role variety, take first 2 distinct shots.
  if (picks.length === 0) {
    picks.push(shotList[0]!);
    if (shotList.length > 1) picks.push(shotList[1]!);
  } else if (picks.length === 1 && shotList.length > 1) {
    const second = shotList.find((s) => s.shot_id !== picks[0]!.shot_id);
    if (second) picks.push(second);
  }

  return picks.map((s) => ({
    shotId: s.shot_id,
    durationSeconds: s.duration_seconds,
    shotRole: s.shot_role,
  }));
}

// ── EREF reference loader ────────────────────────────────────────────────────

interface ApprovedAssetRow {
  id: string;
  file_type: string;
  status: string;
  filename: string;
  staging_path: string | null;
  drive_path: string | null;
  drive_web_view_url: string | null;
  metadata: unknown;
}

export interface ApprovedEREFForShot {
  asset: ApprovedAssetRow;
  /** Base64-encoded PNG, ready for Veo 3 referenceImageBase64. Null when the
   *  asset only has a Drive URL and the local staging cache miss. */
  image_b64: string | null;
}

function shotIdFromMetadata(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const sr = (meta as { shot_reference?: { shot_id?: unknown } }).shot_reference;
  if (!sr || typeof sr !== 'object') return null;
  const id = sr.shot_id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Load the approved IMG-episode_ref for a given storyboard shot, plus the
 * image bytes ready for img2vid. Returns null if no APPROVED EREF exists for
 * the shot — the runner should hard-fail in that case (every shot must have
 * one before VGEN runs).
 */
export async function getApprovedEREFForShot(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  shotId: string,
): Promise<ApprovedEREFForShot | null> {
  const { data, error } = await supabase
    .from('assets')
    .select(
      'id,file_type,status,filename,staging_path,drive_path,drive_web_view_url,drive_file_id,metadata',
    )
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED')
    .like('file_type', 'IMG-episode_ref%')
    // Transitional safety until single-approved EREF is enforced: when several
    // rows match a shot, prefer the highest version, then the most recent.
    .order('version', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(`approved EREF fetch failed: ${error.message}`);
  }
  const refs = (data ?? []) as ApprovedAssetRow[];
  const match = refs.find((row) => shotIdFromMetadata(row.metadata) === shotId);
  if (!match) return null;

  // Resolve image bytes via the Drive-backed reader (disk-cache → Drive →
  // legacy /staging). Post-media-migration the asset's staging_path is an
  // /api/media/<id> URL, NOT a /staging file — reading it as a local file (the
  // old behaviour) returned null and starved img2vid of its start frame (422).
  const { readAssetMediaAsBase64 } = await import('@/lib/media-cache');
  const imageB64 = await readAssetMediaAsBase64({
    filename: match.filename,
    driveFileId: (match as { drive_file_id?: string | null }).drive_file_id ?? null,
    stagingPath: match.staging_path,
  });
  return { asset: match, image_b64: imageB64 };
}

/**
 * Load an asset's media bytes through the canonical Drive-aware reader and
 * THROW `ReferenceLoadError` when nothing resolves. This is the LOUD path (I3):
 * use it whenever a missing reference must abort the operation rather than
 * silently degrade (e.g. a Director-supplied img2vid reference / end-frame).
 *
 * Widens the asset select to `filename, drive_file_id, staging_path` so the
 * reader can try every resolution tier, not just legacy staging.
 */
export async function loadApprovedMediaOrThrow(
  supabase: SupabaseClient<Database>,
  assetId: string,
): Promise<{ base64: string; mime: 'image/png' | 'image/jpeg' }> {
  const { data, error } = await supabase
    .from('assets')
    .select('id,filename,staging_path,drive_file_id,file_type')
    .eq('id', assetId)
    .maybeSingle();
  if (error) {
    throw new ReferenceLoadError(
      assetId,
      `asset fetch failed for reference ${assetId}: ${error.message}`,
    );
  }
  if (!data) {
    throw new ReferenceLoadError(assetId, `reference asset ${assetId} not found`);
  }
  const row = data as {
    filename?: string | null;
    staging_path?: string | null;
    drive_file_id?: string | null;
  };
  const { readAssetMediaAsBase64 } = await import('@/lib/media-cache');
  const base64 = await readAssetMediaAsBase64({
    filename: row.filename ?? null,
    driveFileId: row.drive_file_id ?? null,
    stagingPath: row.staging_path ?? null,
  });
  if (!base64 || base64.length === 0) {
    throw new ReferenceLoadError(
      assetId,
      `reference asset ${assetId} has no resolvable media (no disk-cache hit, no Drive bytes, no legacy staging file)`,
    );
  }
  const looksJpeg =
    (row.filename ?? '').toLowerCase().endsWith('.jpg') ||
    (row.filename ?? '').toLowerCase().endsWith('.jpeg') ||
    (row.staging_path ?? '').toLowerCase().endsWith('.jpg') ||
    (row.staging_path ?? '').toLowerCase().endsWith('.jpeg');
  const mime: 'image/png' | 'image/jpeg' = looksJpeg ? 'image/jpeg' : 'image/png';
  return { base64, mime };
}

/**
 * TD-33 (2026-05-22): load an asset's image bytes by id alone. Used by the
 * EXEC-VGEN plan-driven branch to fetch the Animator's `end_image.asset_id`
 * for Seedance's end-frame img2vid feature. Returns null when the asset row
 * has no staging_path or the file can't be read — caller degrades to
 * start-frame-only video (no end-frame anchor).
 *
 * 2026-06-03: resolves bytes via the Drive-backed reader (disk-cache → Drive →
 * legacy /staging). The old /staging-only read returned null for Drive-backed
 * assets (staging_path = /api/media/<id> URL post-migration), which starved
 * Seedance of image_url and produced a fal 422.
 */
export async function getAssetImageBase64ById(
  supabase: SupabaseClient<Database>,
  assetId: string,
): Promise<{ base64: string; mime: 'image/png' | 'image/jpeg' } | null> {
  const { data, error } = await supabase
    .from('assets')
    .select('id,staging_path,filename,drive_file_id,file_type')
    .eq('id', assetId)
    .maybeSingle();
  if (error || !data) return null;
  const filename = (data as { filename?: string | null }).filename ?? null;
  const { readAssetMediaAsBase64 } = await import('@/lib/media-cache');
  const base64 = await readAssetMediaAsBase64({
    filename,
    driveFileId: (data as { drive_file_id?: string | null }).drive_file_id ?? null,
    stagingPath: data.staging_path,
  });
  if (!base64) return null;
  const lower = (filename ?? data.staging_path ?? '').toLowerCase();
  const mime: 'image/png' | 'image/jpeg' =
    lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
  return { base64, mime };
}

// ── Prompt builder ───────────────────────────────────────────────────────────

function characterLine(c: StoryboardShotCharacter): string | null {
  const name = c.display_name ?? c.bible_slug;
  if (!name) return null;
  return c.emotion ? `${name} (${c.emotion})` : name;
}

const NEGATIVE_PROMPT =
  'Avoid: on-screen text, captions, subtitles, watermarks, logos, distorted faces, extra limbs.';
const POSITIVE_STYLE =
  'Vibrant colours, smooth comedic timing, expressive 2D animation, clean line art.';

/** Map a storyboard `camera_angle` to a Veo-friendly camera description.
 * Veo responds well to explicit framing + (optional) movement hints; raw
 * abbreviations like "OTS" or "POV" tend to confuse it. */
function describeCamera(rawAngle: string | undefined): string {
  const a = (rawAngle ?? '').trim().toUpperCase();
  if (!a) return 'static medium shot';
  switch (a) {
    case 'WIDE':
    case 'LONG':
    case 'ESTABLISHING':
      return 'static wide establishing shot';
    case 'MEDIUM':
    case 'MS':
      return 'static medium shot';
    case 'CLOSE':
    case 'CLOSE-UP':
    case 'CLOSEUP':
    case 'CU':
      return 'static close-up';
    case 'EXTREME-CLOSEUP':
    case 'ECU':
      return 'static extreme close-up';
    case 'OTS':
    case 'OVER-SHOULDER':
      return 'over-the-shoulder medium shot';
    case 'POV':
      return 'first-person point-of-view shot';
    case 'LOW':
    case 'LOW-ANGLE':
      return 'low-angle shot looking up';
    case 'HIGH':
    case 'HIGH-ANGLE':
      return 'high-angle shot looking down';
    case 'AERIAL':
    case 'BIRDS-EYE':
      return "bird's-eye aerial shot";
    case 'DUTCH':
      return 'tilted dutch-angle shot';
    default:
      // Unknown / free-form value — pass through, capitalised as a phrase.
      return a.toLowerCase().replace(/_/g, ' ');
  }
}

// describeRole(...) removed 2026-05-13 — role labels ("Reaction shot:")
// were appearing as on-screen annotations in some Veo outputs and added
// no information the EREF didn't already carry.

/** Compact visual snippet for one character (Bible character description
 *  shortened to 1–2 sentences). Used by the prompt builder to anchor character
 *  appearance in TEXT alongside the EREF reference image — Phase A.1 directive
 *  2026-05-07: improve character consistency across VGEN. */
export interface CharacterCanonSnippet {
  /** Bible slug (e.g. `sandy_hourglass`) — must match the slug found on
   *  `characters[i].bible_slug` in the storyboard shot. */
  slug: string;
  /** Short visual blurb (~1–2 sentences). Pre-extracted upstream. */
  description: string;
}

/** Pull the first N sentences from a longer description. Defaults to 2 — long
 *  enough for "young woman, curly red hair, freckles, yellow raincoat" without
 *  bloating the prompt with backstory. */
function firstSentences(text: string, n: number = 2): string {
  if (!text) return '';
  const parts = text.split(/(?<=[.!?])\s+/).filter((p) => p.trim().length > 0);
  return parts.slice(0, n).join(' ').trim();
}

/** Build CharacterCanonSnippets from a list of full Bible character entries.
 *  Caller passes Bible.characters; this helper truncates each description. */
export function makeCharacterCanonSnippets(
  bibleCharacters: ReadonlyArray<{ slug: string; description: string }>,
  sentenceCount: number = 2,
): CharacterCanonSnippet[] {
  return bibleCharacters
    .filter((c) => c.slug && c.description)
    .map((c) => ({
      slug: c.slug,
      description: firstSentences(c.description, sentenceCount),
    }))
    .filter((c) => c.description.length > 0);
}

/**
 * Build a Veo 3.1 prompt for a single shot from the storyboard contract.
 * Replaces the legacy "shot ?" filler that ignored every storyboard field.
 *
 * Output shape (natural language, no bracket prefix — Veo prefers prose):
 *   <setting>. <Role hint, if any>: <action>. Characters: ... .
 *   Visual canon: <slug>: <1–2 sentence Bible description>; <slug>: ... .
 *   Camera: <static/over-the-shoulder/etc.>.
 *   Beat: <gag, if any>. Mood: <emotion, if any>.
 *   Style: <positive style anchors>. Avoid: <negative anchors>.
 *
 * Splitting beat (gag) and mood (emotion) gives the model two distinct slots
 * — combining them as one "Mood" line was confusing in earlier smoke. The
 * episode title is included only as setting flavour, never as a literal
 * label, so titles never leak as on-screen text.
 *
 * `characterCanon` (Phase A.1, optional) injects Bible character visual
 * descriptions so prompt + image-to-video both pull in the same direction.
 * Only characters actually present in this shot are injected to keep the
 * prompt focused — the entire series cast never lands here.
 */
export function buildShotPromptV2(
  shot: StoryboardShotV2,
  episodeTitle: string,
  characterCanon?: ReadonlyArray<CharacterCanonSnippet>,
): string {
  // Trim action_prose to the first clean sentence — long literary prose with
  // metaphors like "rendered as negative space" or "Precise. Unbridgeable.."
  // confuses Veo (it does not parse abstractions) and the unused fragments
  // hog the token budget. Director surfaced this 2026-05-13 evening.
  const rawAction = (shot.action_prose ?? shot.action ?? shot.key_beat ?? '').trim();
  const action = firstSentence(rawAction);
  const camera = describeCamera(shot.camera_angle);
  const gag = (shot.expected_gag ?? '').trim();
  const emotion = (shot.expected_emotion ?? '').trim();

  const charLines: string[] = [];
  if (Array.isArray(shot.characters)) {
    for (const c of shot.characters) {
      const line = characterLine(c);
      if (line) charLines.push(line);
    }
  } else if (Array.isArray(shot.characters_present)) {
    for (const slug of shot.characters_present) {
      if (typeof slug === 'string' && slug) charLines.push(slug);
    }
  }
  const charPhrase = charLines.length > 0 ? `Characters: ${charLines.join(', ')}.` : '';

  // Bible canon snippets — only for characters actually present in this shot.
  // Prevents stuffing the prompt with the entire cast every time.
  const presentSlugs = new Set<string>();
  if (Array.isArray(shot.characters)) {
    for (const c of shot.characters) {
      if (c.bible_slug) presentSlugs.add(c.bible_slug);
    }
  }
  if (Array.isArray(shot.characters_present)) {
    for (const slug of shot.characters_present) {
      if (typeof slug === 'string' && slug) presentSlugs.add(slug);
    }
  }
  const canonLines: string[] = [];
  if (characterCanon && presentSlugs.size > 0) {
    for (const snip of characterCanon) {
      if (presentSlugs.has(snip.slug)) {
        canonLines.push(`${snip.slug}: ${snip.description}`);
      }
    }
  }
  const canonPhrase = canonLines.length > 0
    ? `Visual canon: ${canonLines.join(' ')}`
    : '';

  // Setting prefix kept short and label-free. Earlier "set in the world of
  // '<title>'" caused Veo to occasionally render the episode title as
  // on-screen text. shot_role ("Reaction shot:") prefix dropped — the EREF
  // already encodes framing, role-as-text adds nothing for the model.
  const setting = '2D animated comedy short.';
  // Reuse `episodeTitle` only as a discreet style hint, not as quoted text.
  // (Keeps the symbol used so callers that still pass it don't warn.)
  void episodeTitle;

  const segments: string[] = [setting];
  if (action) segments.push(`${action}.`);
  if (charPhrase) segments.push(charPhrase);
  if (canonPhrase) segments.push(canonPhrase);
  segments.push(`Camera: ${camera}.`);
  // Beat/Mood are absorbed into the EREF + action sentence — adding them as
  // separate `Beat:` / `Mood:` labels invited Veo to treat them as on-screen
  // annotation (the model printed "Beat:" text in a couple of pilots).
  // Keep the substance but drop the label so the model reads it as flow.
  // Each fragment is normalised to end with a period so neighbouring segments
  // don't run together when joined with a space.
  if (gag) segments.push(endWithPeriod(gag));
  if (emotion) segments.push(endWithPeriod(emotion));
  // Force native 16:9 composition so the model doesn't anchor on the
  // square EREF crop and then "expand" mid-shot (Director report
  // 2026-05-13: square-inside-wide-canvas artifact).
  segments.push('16:9 widescreen landscape composition from the very first frame.');
  segments.push(`Style: ${POSITIVE_STYLE}`);
  segments.push(NEGATIVE_PROMPT);
  return segments.join(' ');
}

/**
 * Return the first complete sentence in a paragraph. Splits on the canonical
 * end-of-sentence punctuation (`.`, `!`, `?`) followed by whitespace; falls
 * back to the input itself when the paragraph has no sentence terminators.
 * Also collapses double-periods into single (avoids `Unbridgeable..` in the
 * Veo prompt — a real artifact observed 2026-05-13).
 */
function endWithPeriod(s: string): string {
  const t = s.trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function firstSentence(input: string): string {
  const cleaned = input.replace(/\.{2,}/g, '.').trim();
  if (!cleaned) return '';
  const match = cleaned.match(/^([^.!?]+[.!?])\s/);
  if (match) return match[1]!.trim().replace(/[.!?]+$/, '');
  // No mid-text terminator — strip a trailing terminator if any so the
  // caller's `${action}.` doesn't produce "..".
  return cleaned.replace(/[.!?]+$/, '').trim();
}
