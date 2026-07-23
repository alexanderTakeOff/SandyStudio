// Canon correction 2026-07-23 (Director q8a/q9a, ===5===):
//  1. De-absolutize the 2D/finish language in the style canon (renders are
//     2.5D/3D cartoon, not flat 2D — soften "no shadows"→"simple shadows",
//     allow gentle volume; keep palette/silhouette/Pink-Panther clarity).
//  2. Sandy: give him a permanent minimalist mouth (was "only during extreme
//     expressions" → he rendered mouthless most shots).
//  3. Allow rear / three-quarter-back staging (Sandy need not face camera).
// Inspector Stopwatch eyes handled separately (design fork → Director q10).
import { readFileSync } from 'node:fs';
for (const raw of readFileSync('.env.local', 'utf-8').split('\n')) {
  const l = raw.trim(); if (!l || l.startsWith('#')) continue;
  const e = l.indexOf('='); if (e <= 0) continue;
  let v = l.slice(e + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[l.slice(0, e).trim()] = v;
}
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const STYLE_ID = '303959c1-52b3-4b2a-be76-49d0f58b5227';
const SANDY_ID = 'bc2d6f74-cb9f-47d5-b5b5-d9e0b5bc7c0b';

type Repl = { find: string; replace: string };

const STYLE_REPL: Repl[] = [
  {
    find: '## Sandy Chronicles S15 — Canonical 2D Style Sample Card',
    replace: '## Sandy Chronicles S15 — Canonical Cartoon Style Sample Card',
  },
  {
    find: 'Flat 2D silent physical comedy in the spirit of The Pink Panther: every frame reads as a single graphic statement in under one second, meaning carried entirely by silhouette, clean colour, and exaggerated staging.',
    replace: 'Clean cartoon silent physical comedy in the spirit of The Pink Panther, rendered in a 2.5D/3D cartoon style: dimensional volume and soft shading are fine as long as every frame still reads as a single graphic statement in under one second — meaning carried by silhouette, clean colour, and exaggerated staging.',
  },
  {
    find: 'All fills are flat and opaque. No gradients on characters, props, or primary graphic shapes. Accent colours used for impact gags, speed lines, and secondary characters only — never two accents competing in the same shot.',
    replace: 'Fills read as clean, saturated cartoon colour. Simple shading and gentle gradients are allowed to give soft volume (as in a 3D cartoon render); just avoid busy photoreal texturing that muddies the silhouette. Accent colours are used for impact gags, speed lines, and secondary characters — avoid two accents competing in the same shot.',
  },
  {
    find: 'Fully flat. Zero ambient occlusion, zero drop shadow from external light source, zero volumetric or cinematic lighting. Shadow is indicated only as a flat colour shape (one step darker within palette, e.g. `#D4A032` against `#F5C96A`) applied as a hard-edged 2D graphic form, never as a gradient or feathered overlay. Ground shadow beneath characters is a simple flat dark oval, no blur.',
    replace: 'Soft, simple cartoon lighting. Gentle shading, light ambient occlusion, and a simple soft drop shadow are all fine — keep them subtle and graphic, never heavy photoreal or dramatic cinematic lighting. Shadow can be a simple darker shape within palette (e.g. `#D4A032` against `#F5C96A`) or a soft shadow; ground shadow beneath characters is a simple soft oval.',
  },
  {
    find: 'No paper grain, no texture overlays, no halftone, no painted finish. Output is clean vector-style flat 2D. Speed lines are hard straight strokes',
    replace: 'Avoid paper grain, halftone, and heavy photoreal texturing. Output is a clean cartoon finish — a 2.5D/3D render in cartoon style is expected and fine, as long as it stays graphic and reads clearly. Speed lines are hard straight strokes',
  },
  {
    // Composition §5 — add explicit back-view permission (kills the emergent "always face camera" bias at the canon source the critic reads).
    find: 'Camera cuts are implied by hard composition switches, not camera moves.',
    replace: 'Camera cuts are implied by hard composition switches, not camera moves. Staging does NOT require Sandy to face the camera: rear and three-quarter-back views are valid and encouraged whenever they show more of the scene (e.g. Sandy seen from behind while facing a gate, so both he and the gate read in one frame). Sandy’s face need not be visible in every shot — pick the angle that best sells the gag and the space.',
  },
];

const SANDY_REPL: Repl[] = [
  {
    find: 'No nose. Mouth appears only during extreme expressions — a simple curved line or a wide-open gap, never detailed teeth.',
    replace: 'No nose. Sandy ALWAYS has a small, minimalist mouth — by default a simple curved line or slight smile — which exaggerates during strong expressions (a wide-open gap when shocked or straining), never detailed teeth. He must never be drawn mouthless: the mouth is a permanent minimal feature, kept small and readable so it never dominates the eyes.',
  },
  {
    find: 'Both eyes sit on the upper glass bulb, front-facing,',
    replace: 'Both eyes and the minimalist mouth sit on the upper glass bulb, front-facing when the shot shows Sandy from the front (rear and three-quarter-back staging is allowed — Sandy does not have to face camera in every shot),',
  },
];

async function applyTo(id: string, label: string, repls: Repl[]) {
  const { data, error } = await sb.from('assets').select('content').eq('id', id).maybeSingle();
  if (error || !data) { console.error(`[${label}] fetch failed`, error?.message); process.exit(1); }
  let content = (data as { content: string }).content;
  console.log(`\n=== ${label} (${id}) ===`);
  for (const r of repls) {
    const count = content.split(r.find).length - 1;
    if (count !== 1) { console.error(`  ✗ expected exactly 1 match, got ${count} for:\n    "${r.find.slice(0, 80)}..."`); process.exit(1); }
    content = content.replace(r.find, r.replace);
    console.log(`  ✓ replaced: "${r.find.slice(0, 70)}..."`);
  }
  const { error: uerr } = await sb.from('assets').update({ content } as never).eq('id', id);
  if (uerr) { console.error(`  update failed: ${uerr.message}`); process.exit(1); }
  console.log(`  → saved (${content.split('\n').length} lines)`);
}

(async () => {
  await applyTo(STYLE_ID, 'STYLE canon', STYLE_REPL);
  await applyTo(SANDY_ID, 'SANDY canon', SANDY_REPL);
  console.log('\nDone. Inspector eyes pending Director q10.');
})().catch((e) => { console.error(e); process.exit(1); });
