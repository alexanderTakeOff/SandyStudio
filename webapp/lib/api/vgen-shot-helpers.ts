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

const PROMPT_TAIL =
  'Vibrant colours, dynamic action, smooth comedic timing, no text overlays.';

/**
 * Build a Veo 3 prompt for a single shot — replaces the legacy filler
 * "shot ?" prompt that ignored every storyboard field.
 *
 * Includes:
 *   - episode title + medium tag (2D animated comedy)
 *   - action_prose (or fallback: action / key_beat)
 *   - present characters with display_name + emotion
 *   - camera angle (default medium)
 *   - mood: expected_gag / expected_emotion / key_beat
 */
export function buildShotPromptV2(
  shot: StoryboardShotV2,
  episodeTitle: string,
): string {
  const titlePhrase = episodeTitle && episodeTitle.length > 0
    ? `2D animation comedy '${episodeTitle}'`
    : '2D animation comedy short';

  const action = (shot.action_prose ?? shot.action ?? shot.key_beat ?? '').trim();
  const camera = (shot.camera_angle ?? 'medium').trim();
  const mood = (shot.expected_gag ?? shot.expected_emotion ?? shot.key_beat ?? 'comedic').trim();

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

  const segments: string[] = [`[${titlePhrase}]`];
  if (action) segments.push(`${action}.`);
  if (charPhrase) segments.push(charPhrase);
  segments.push(`Camera: ${camera}.`);
  segments.push(`Mood: ${mood}.`);
  segments.push(PROMPT_TAIL);
  return segments.join(' ');
}
