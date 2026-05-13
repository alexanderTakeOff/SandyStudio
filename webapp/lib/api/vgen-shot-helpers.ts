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
    characters,
    characters_present: Array.isArray(sh.characters_present)
      ? sh.characters_present.filter((x): x is string => typeof x === 'string')
      : undefined,
  };
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
  for (const act of json.acts) {
    if (!act || !Array.isArray(act.shots)) continue;
    for (const raw of act.shots) {
      const sh = shotToV2(raw);
      if (sh && sh.shot_id === shotId) return sh;
    }
  }
  return null;
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
      'id,file_type,status,filename,staging_path,drive_path,drive_web_view_url,metadata',
    )
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED')
    .like('file_type', 'IMG-episode_ref%');
  if (error) {
    throw new Error(`approved EREF fetch failed: ${error.message}`);
  }
  const refs = (data ?? []) as ApprovedAssetRow[];
  const match = refs.find((row) => shotIdFromMetadata(row.metadata) === shotId);
  if (!match) return null;

  // Lazy import to keep this module loadable in non-Node test environments.
  const stagingPath = match.staging_path;
  let imageB64: string | null = null;
  if (stagingPath && stagingPath.startsWith('/staging/')) {
    try {
      const path = await import('node:path');
      const fs = await import('node:fs/promises');
      const abs = path.join(process.cwd(), 'public', stagingPath.slice(1));
      const buf = await fs.readFile(abs);
      imageB64 = buf.toString('base64');
    } catch {
      imageB64 = null;
    }
  }
  return { asset: match, image_b64: imageB64 };
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

/** Map shot_role to an opening framing cue that primes the model on intent. */
function describeRole(role: string | undefined): string | null {
  const r = (role ?? '').trim().toLowerCase();
  if (!r) return null;
  if (r === 'establishing') return 'Establishing the scene';
  if (r === 'action') return 'Dynamic action moment';
  if (r === 'reaction') return 'Reaction shot';
  if (r === 'punchline' || r === 'gag-payoff' || r === 'gag_payoff')
    return 'Punchline payoff';
  if (r === 'transition') return 'Transition cut';
  if (r === 'closer' || r === 'tag') return 'Closing tag';
  return null;
}

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
  // separate labels invited the model to treat them as on-screen annotation
  // (e.g. printing "Beat:" or "Mood:"). Re-enable only if a future eval
  // shows they're load-bearing.
  if (gag) segments.push(gag);
  if (emotion) segments.push(emotion);
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
function firstSentence(input: string): string {
  const cleaned = input.replace(/\.{2,}/g, '.').trim();
  if (!cleaned) return '';
  const match = cleaned.match(/^([^.!?]+[.!?])\s/);
  if (match) return match[1]!.trim().replace(/[.!?]+$/, '');
  // No mid-text terminator — strip a trailing terminator if any so the
  // caller's `${action}.` doesn't produce "..".
  return cleaned.replace(/[.!?]+$/, '').trim();
}
