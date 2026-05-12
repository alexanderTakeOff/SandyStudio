// ──────────────────────────────────────────────────────────────────────────────
// scripts/patch-e20-stb-camera.ts
//
// One-off Director-requested surgical patch (2026-05-12):
// Add camera_movement + camera_motivation to every shot in
// SS-S14-E20-STB-storyboard-v02-DRAFT.md while preserving everything else.
//
// Default DRY-RUN — pass `--write` to apply.
// Idempotent — if every shot already has both fields, prints "no-op" and
// exits 0 without writing.
//
// Recovery path: prior versions remain in DB by version number; this only
// rewrites the v02 content column.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ── env loader (mirrors next.config.ts override pattern) ─────────────────────
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

const E20_EPISODE_ID = '763c5c1e-44dc-4e10-92fb-e7671e5d4a44';
const TARGET_FILENAME_FRAGMENT = 'SS-S14-E20-STB-storyboard';
const TARGET_VERSION = 2;

// Director-supplied / Claude-proposed camera direction per shot.
// 19 shots. Filled in pass 2 after reading storyboard JSON; pass 1 verifies
// the patch infrastructure with placeholder values, then we run dry-run to
// confirm structure before committing real values.
type CameraPatch = { shot_id: string; camera_movement: string; camera_motivation: string };

// Director-requested camera direction for E20 v02.
// Vocabulary kept industry-standard so Storyboarder@v3 skill can later read
// these without ambiguity (push_in / dolly / whip_pan / static_locked_off /
// dutch_tilt / pullback / rack_zoom). Motivation is the narrative reason —
// links the move to shot_role and the beat already in the JSON.
const PATCHES: readonly CameraPatch[] = [
  // ── Act 1 — Open & approach ────────────────────────────────────────────────
  {
    shot_id: 'SS-S14-E20-A1-SC01-SH01',
    camera_movement: 'slow_push_in',
    camera_motivation:
      'Push from establishing wide toward Sandy — emulates love-at-first-sight focal narrowing and sets up the emotional approach.',
  },
  {
    shot_id: 'SS-S14-E20-A1-SC02-SH01',
    camera_movement: 'dolly_with_subject',
    camera_motivation:
      'Camera dollies alongside Sandy as he approaches the counter — viewer rides his hopeful momentum so the reveal of Perfume Madame\'s poised hand lands cleanly.',
  },
  {
    shot_id: 'SS-S14-E20-A1-SC03-SH01',
    camera_movement: 'slight_handheld_drift',
    camera_motivation:
      'Subtle handheld waver introduces the first hint of instability — physical sting registers in framing before Sandy registers it consciously.',
  },

  // ── Act 2 — Distortion peak ────────────────────────────────────────────────
  {
    shot_id: 'SS-S14-E20-A2-SC04-SH01',
    camera_movement: 'whip_pan_recover',
    camera_motivation:
      'Quick whip-pan as Sandy\'s body distorts and snaps back — camera reacts to the cartoon stretch, selling the physical gag.',
  },
  {
    shot_id: 'SS-S14-E20-A2-SC04-SH02',
    camera_movement: 'slow_push_in_close',
    camera_motivation:
      'Continuing push despite the distortion — visual contradiction (he keeps approaching even as his body fails) underlined by camera intimacy.',
  },
  {
    shot_id: 'SS-S14-E20-A2-SC05-SH01',
    camera_movement: 'dutch_tilt_rotation',
    camera_motivation:
      'Slow dutch tilt as thought-bubble visuals appear — world tipping into emotional confusion.',
  },
  {
    shot_id: 'SS-S14-E20-A2-SC05-SH02',
    camera_movement: 'accelerating_zoom',
    camera_motivation:
      'Short zoom-in punching the panic curve — tempo lift before the environment fractures.',
  },
  {
    shot_id: 'SS-S14-E20-A2-SC06-SH01',
    camera_movement: 'rack_zoom_kaleidoscope',
    camera_motivation:
      'Wide reveal of fracturing space; camera rotates slowly as kaleidoscope effect builds — shows scale of disorientation.',
  },
  {
    shot_id: 'SS-S14-E20-A2-SC06-SH02',
    camera_movement: 'rapid_shake_static_burst',
    camera_motivation:
      'Handheld shake bursts in 6-frame increments — peak chaos visual stutter.',
  },
  {
    shot_id: 'SS-S14-E20-A2-SC07-SH01',
    camera_movement: 'slow_pullback',
    camera_motivation:
      'Pull back to reveal Sandy small inside the cloud — emphasises how the chaos has overwhelmed him.',
  },
  {
    shot_id: 'SS-S14-E20-A2-SC07-SH02',
    camera_movement: 'static_locked_off',
    camera_motivation:
      'Total stillness on Sandy after relentless motion — visual exhaustion punchline; camera "gives up" along with him.',
  },

  // ── Act 3 — Recede & separation ───────────────────────────────────────────
  {
    shot_id: 'SS-S14-E20-A3-SC08-SH01',
    camera_movement: 'slow_pullback_reveal',
    camera_motivation:
      'Continuous slow pullback as the mist clears — visually breathing out after the chaos peak.',
  },
  {
    shot_id: 'SS-S14-E20-A3-SC08-SH02',
    camera_movement: 'static_locked_off',
    camera_motivation:
      'Camera stops — emphasises Sandy\'s stillness after the storm. The change is settled.',
  },
  {
    shot_id: 'SS-S14-E20-A3-SC09-SH01',
    camera_movement: 'slow_dolly_back',
    camera_motivation:
      'Slow dolly back widens the space between Sandy and Perfume Madame — visualises the gap by literal distance.',
  },
  {
    shot_id: 'SS-S14-E20-A3-SC09-SH02',
    camera_movement: 'static_locked_off',
    camera_motivation:
      'Hold on Sandy\'s face for emotional clarity — no movement to compete with micro-expression.',
  },
  {
    shot_id: 'SS-S14-E20-A3-SC10-SH01',
    camera_movement: 'slight_push_in',
    camera_motivation:
      'Gentle push toward Sandy as he reaches — underscores the gesture\'s intent before its failure.',
  },
  {
    shot_id: 'SS-S14-E20-A3-SC10-SH02',
    camera_movement: 'whip_pan_recover',
    camera_motivation:
      'Quick reactive whip mirrors SC04-SH01 — visual rhyme reinforces "same trap, smaller hope".',
  },
  {
    shot_id: 'SS-S14-E20-A3-SC11-SH01',
    camera_movement: 'slow_pullback_to_two_shot',
    camera_motivation:
      'Final slow pullback to symmetric wide — Sandy left of frame, Perfume Madame right, counter between. Composition does the emotional work.',
  },
  {
    shot_id: 'SS-S14-E20-A3-SC11-SH02',
    camera_movement: 'static_locked_off',
    camera_motivation:
      'Final static hold on Sandy alone — stops the comedic momentum cold for the melancholic closing punctuation.',
  },
];

interface ShotV2 {
  shot_id?: string;
  camera_angle?: string;
  shot_role?: string;
  duration_seconds?: number;
  characters?: unknown;
  location?: unknown;
  action_prose?: string;
  key_beat?: string;
  camera_movement?: string;
  camera_motivation?: string;
  [key: string]: unknown;
}

interface ActV2 {
  act?: number;
  beat_summary?: string;
  shots?: ShotV2[];
  [key: string]: unknown;
}

interface StoryboardJson {
  episode_id?: string;
  total_duration_s?: number;
  contract?: string;
  acts?: ActV2[];
  shots?: ShotV2[]; // legacy fallback
  [key: string]: unknown;
}

function flattenShots(parsed: StoryboardJson): ShotV2[] {
  if (Array.isArray(parsed.acts) && parsed.acts.length > 0) {
    return parsed.acts.flatMap((a) => (Array.isArray(a.shots) ? a.shots : []));
  }
  if (Array.isArray(parsed.shots)) return parsed.shots;
  return [];
}

function findJsonBlock(markdown: string): { json: string; start: number; end: number } | null {
  // Storyboarder output uses a fenced ```json block. Find the first one.
  const re = /```json\s*\n([\s\S]*?)\n```/;
  const m = re.exec(markdown);
  if (!m) return null;
  return { json: m[1]!, start: m.index, end: m.index + m[0].length };
}

async function main() {
  const writeMode = process.argv.includes('--write');
  const showJson = process.argv.includes('--show-json');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(2);
  }
  const sb = createClient(url, key);

  console.log(`Looking up STB-storyboard v${TARGET_VERSION} for episode ${E20_EPISODE_ID}…`);
  const { data: rows, error } = await sb
    .from('assets')
    .select('id, filename, status, version, content, episode_id')
    .eq('episode_id', E20_EPISODE_ID)
    .eq('file_type', 'STB-storyboard')
    .eq('version', TARGET_VERSION)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Asset lookup failed:', error.message);
    process.exit(2);
  }
  if (!rows || rows.length === 0) {
    console.error(`No STB-storyboard v${TARGET_VERSION} found for episode ${E20_EPISODE_ID}.`);
    process.exit(2);
  }
  const target = rows.find((r) => r.filename.includes(TARGET_FILENAME_FRAGMENT));
  if (!target) {
    console.error('No row matched filename fragment:', TARGET_FILENAME_FRAGMENT);
    console.error('Candidates:', rows.map((r) => r.filename));
    process.exit(2);
  }
  console.log(`Found ${target.filename} (status=${target.status}, id=${target.id})`);

  const content = (target.content as string) ?? '';
  if (!content) {
    console.error('Asset content is empty.');
    process.exit(2);
  }

  const block = findJsonBlock(content);
  if (!block) {
    console.error('Could not locate ```json fenced block in markdown.');
    process.exit(2);
  }

  let parsed: StoryboardJson;
  try {
    parsed = JSON.parse(block.json);
  } catch (e) {
    console.error('JSON parse failed:', (e as Error).message);
    process.exit(2);
  }

  const shots = flattenShots(parsed);
  console.log(`Storyboard contains ${shots.length} shots across ${parsed.acts?.length ?? 0} acts.`);

  if (showJson) {
    console.log('--- Shot summary (id | dur | angle | role | beat) ---');
    for (const s of shots) {
      const id = s.shot_id ?? '?';
      const dur = typeof s.duration_seconds === 'number' ? `${s.duration_seconds}s` : '?';
      const ang = s.camera_angle ?? '?';
      const role = s.shot_role ?? '?';
      const beat = (s.key_beat ?? '').slice(0, 90);
      const cm = s.camera_movement ?? '(missing)';
      console.log(`  ${id}  ${dur}  ${ang}  ${role}  cm:${cm}`);
      console.log(`    beat: ${beat}`);
    }
  }

  // Build a lookup of patches by shot_id.
  const patchById = new Map<string, CameraPatch>();
  for (const p of PATCHES) patchById.set(p.shot_id, p);

  let changed = 0;
  let alreadyPresent = 0;
  let notInPatchSet = 0;

  function patchShot(s: ShotV2): ShotV2 {
    const id = s.shot_id;
    if (!id) return s;
    const has =
      typeof s.camera_movement === 'string' && s.camera_movement.length > 0 &&
      typeof s.camera_motivation === 'string' && s.camera_motivation.length > 0;
    if (has) {
      alreadyPresent += 1;
      return s;
    }
    const p = patchById.get(id);
    if (!p) {
      notInPatchSet += 1;
      return s;
    }
    changed += 1;
    return {
      ...s,
      camera_movement: p.camera_movement,
      camera_motivation: p.camera_motivation,
    };
  }

  let newParsed: StoryboardJson;
  if (Array.isArray(parsed.acts) && parsed.acts.length > 0) {
    newParsed = {
      ...parsed,
      acts: parsed.acts.map((a) => ({
        ...a,
        shots: Array.isArray(a.shots) ? a.shots.map(patchShot) : a.shots,
      })),
    };
  } else {
    newParsed = { ...parsed, shots: shots.map(patchShot) };
  }

  console.log(
    `Patch plan: ${changed} shot(s) will be updated, ${alreadyPresent} already had camera fields, ${notInPatchSet} not in PATCHES set.`,
  );

  if (changed === 0 && notInPatchSet === 0) {
    console.log('No-op: every shot already has both camera fields. Exiting.');
    return;
  }

  if (PATCHES.length === 0) {
    console.log('PATCHES array is empty — discovery pass only. Pass --show-json to inspect shots.');
    return;
  }
  const newJson = JSON.stringify(newParsed, null, 2);
  const newContent =
    content.slice(0, block.start) + '```json\n' + newJson + '\n```' + content.slice(block.end);

  if (!writeMode) {
    console.log('--- DRY RUN — pass --write to apply ---');
    console.log(`Old JSON length: ${block.json.length} chars`);
    console.log(`New JSON length: ${newJson.length} chars`);
    console.log('First patched shot preview:');
    const newShotsFlat = flattenShots(newParsed);
    const firstChanged = newShotsFlat.find(
      (s) =>
        patchById.has(s.shot_id ?? '') &&
        typeof s.camera_movement === 'string' &&
        s.camera_movement.length > 0,
    );
    console.log(JSON.stringify(firstChanged, null, 2));
    return;
  }

  console.log('Writing patched content to DB…');
  const { error: upErr } = await sb
    .from('assets')
    .update({ content: newContent })
    .eq('id', target.id);
  if (upErr) {
    console.error('Update failed:', upErr.message);
    process.exit(2);
  }

  await sb.from('activity_events').insert({
    event_type: 'asset_updated',
    severity: 'info',
    title: `Storyboard ${target.filename} surgical camera patch`,
    description: `Director-requested one-off: added camera_movement + camera_motivation to ${changed} shots. Action_prose / duration / key_beat / characters / location preserved.`,
    actor: 'EXEC-DIR-AI',
    asset_id: target.id,
    episode_id: E20_EPISODE_ID,
    metadata: {
      kind: 'surgical_patch',
      script: 'patch-e20-stb-camera.ts',
      shots_changed: changed,
      shots_already_present: alreadyPresent,
      shots_skipped_no_patch: notInPatchSet,
    },
  });

  console.log(`Done. Updated ${changed} shots. Activity event logged.`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
