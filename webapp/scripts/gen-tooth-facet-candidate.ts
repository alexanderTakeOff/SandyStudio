// Re-canonise `tooth_leviathan` as the FLAT FACET the audience misreads as
// masonry — not a second whole-tooth plate.
//
// Why (Director, 2026-07-31): the series had TWO canons of the same object at the
// same scale. `tooth_leviathan`'s own text opens «Зуб это ГРАНЁНОЕ тело, близкое к
// пирамиде», so it is a whole tooth, exactly like `leviathan_pyramid_tooth`. The
// plate the FIRST half of every episode needs — a flat wall of stone with no tip,
// no base and no silhouette — did not exist, so the Storyboarder had nothing to
// cast for a nose-to-the-surface close-up and cast the pyramid instead.
//
// Only the STYLE anchor rides along as a reference. Attaching either tooth plate
// would drag its silhouette in — the exact failure this fixes.
//
// Cost IS recorded through the standard ledger (a scratch script that skips
// recordCost is how $1.58 went missing on 2026-07-29).
import { readFileSync, writeFileSync } from 'node:fs';
for (const raw of readFileSync('.env.local', 'utf-8').split('\n')) {
  const l = raw.trim();
  if (!l || l.startsWith('#')) continue;
  const e = l.indexOf('=');
  if (e <= 0) continue;
  let v = l.slice(e + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  process.env[l.slice(0, e).trim()] = v;
}
import { createClient } from '@supabase/supabase-js';
import { openAIEditsMultiProvider } from '../lib/providers/openai-edits-multi';
import { recordCost } from '../lib/budget';

const STYLE_ANCHOR_FILE = 'SS-S20-SBL-style_s20_style_canon_v1-v01-LOCKED.png';
const OUT = 'scripts/_tooth_facet_candidate.png';

const PROMPT = `Photorealistic deep-submergence camera frame, abyssal ocean, absolute black base.

A single vast FLAT FACE of pale ivory-grey stone-like material fills the entire frame, edge to edge. It is a plane, not an object: no tip, no apex, no base, no ground, no horizon, no silhouette, no edge of the form is visible anywhere in the frame. The face continues past every side of the picture.

The surface reads as dressed masonry: deep longitudinal cracks run vertically down the face, and horizontal chips cross them at roughly even heights, rank after rank, so the eye counts courses of stone. Pale mineral silt lodges in the deepest fissures. The material sits between weathered limestone and old bone — chalky, matte, never enamel-smooth, never polished.

A single cold teal-green beam rakes the face from beyond the left edge of frame at a low grazing angle. The raking light makes the horizontal chip-lines catch as thin bright rows and leaves the plane between them in even tone. Everything the beam does not reach falls to absolute black, never grey. A few fine white-grey marine-snow motes drift in front of the surface, close to camera.

Image 1 is a STYLE REFERENCE only: take its palette, its light behaviour and its blackness. Do not copy any object, shape or subject from it.`;

const NEGATIVE = [
  'tip',
  'apex',
  'point',
  'pyramid',
  'cone',
  'tooth shape',
  'whole object visible',
  'silhouette against background',
  'visible edge of the form',
  'base or ground',
  'horizon',
  'floor',
  'scale reference',
  'letters',
  'glyphs',
  'alphabet',
  'numerals',
  'inscription',
  'carved text',
  'grey instead of black',
  'ambient fill',
  'visible lamp or light source',
];

(async () => {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const res0 = await fetch(`http://localhost:3000/api/media/${STYLE_ANCHOR_FILE}`);
  if (!res0.ok) throw new Error(`style anchor fetch failed: ${res0.status}`);
  const styleB64 = Buffer.from(await res0.arrayBuffer()).toString('base64');
  console.log(`style anchor loaded (${styleB64.length} b64 chars)`);

  console.log('calling gpt-image-2 (high, 1536x1024)…');
  const res = await openAIEditsMultiProvider.generate({
    prompt: PROMPT,
    references: [{ image_b64: styleB64, kind: 'style' }],
    size: '1536x1024',
    quality: 'high',
    negative: NEGATIVE,
  } as never);

  writeFileSync(OUT, Buffer.from(res.b64_data, 'base64'));
  console.log(`OK → ${OUT}  cost=$${res.cost_usd}  ${res.width}x${res.height}`);

  await recordCost(sb as never, {
    episodeId: null,
    agentId: 'EXEC-BIBLE-AUTHOR',
    costUsd: res.cost_usd,
    jobId: null,
    enforceCeiling: false,
    apiProvider: 'openai',
    seriesId: '42f14df0-d1a2-4bb7-b7df-8f1819fac6a7',
  } as never);
  console.log('cost recorded in budget_log');
})().catch((e) => {
  console.error('GEN FAILED:', e.message ?? e);
  process.exit(1);
});
