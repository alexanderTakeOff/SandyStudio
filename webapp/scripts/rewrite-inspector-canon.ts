// Inspector Stopwatch canon rewrite 2026-07-23 (Director, ===5===):
//  - Clock sweep-hands = MUSTACHE (not eyebrows). Angle by mood: down/horizontal/up.
//  - ADD eyes + movable eyebrows (brows are the fast mood indicator; he acts with them).
//  - Arms CONNECTED to the body (were "separate puppeted hands" — Seedance re-attached
//    them anyway, so canon now matches: arms grow from the body).
// Text only; the reference image is regenerated separately.
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
const ID = '6dce86ff-76ef-4f00-8734-59401212b426';

type Repl = { label: string; find: string; replace: string };

const REPLS: Repl[] = [
  {
    label: 'ARMS connected to body',
    find: '**Arms — mandatory clarification:** Inspector Stopwatch does NOT have his own built-in arms growing from the body. He manipulates a pair of SEPARATE cartoon white-gloved hands (stamp hand, document hand, "flip Sandy over" hand) that he directs like independent tools/puppets — these are treated as extensions of his authority, not organic limbs. This must never be drawn as ordinary shoulder-mounted arms.',
    replace: '**Arms — mandatory clarification (revised 2026-07-23):** Inspector Stopwatch has TWO arms CONNECTED to his body — short rubber-hose limbs in the series style, growing from the sides of the round body, each ending in a cartoon white-gloved hand (stamp hand, document hand). They MUST be drawn as ordinary connected arms attached to the body, never as free-floating separate hands. (Earlier canon detached them; the video model kept re-attaching arms on its own, so canon now matches the render: arms are part of the body.)',
  },
  {
    label: 'FACE header',
    find: '## 3. Face & Expression — moods live in the HANDS, not human eyebrows',
    replace: '## 3. Face & Expression — eyes + movable eyebrows + a clock-hand MUSTACHE',
  },
  {
    label: 'FACE body paragraph',
    find: 'The watch face **is** his face, under the glass crystal. The two stopwatch HANDS (the thin hour/minute-style sweep hands radiating from the center pivot) function as his **mustache-and-eyebrows mood indicator** — they are NOT arms, NOT gesturing limbs. Read them like this:\n- Spinning fast = agitation/excitement\n- Crossed over each other = anger/disapproval\n- Drooping limp = defeated / "broken" / deflated\n- One raised, relaxed sweep = polite curiosity — his softest, most natural state, which slips out when he forgets to perform "strict"',
    replace: 'The watch face **is** his face, under the glass crystal, and it carries three distinct features:\n\n- **Eyes (always present):** two round cartoon eyes on the dial, sitting roughly at the II and X numeral positions — white `#FFF8EC` with near-black `#1A1008` pupils. He is NEVER a blank dial; the eyes always read, even at thumbnail scale.\n- **Eyebrows (his fast mood dial):** a pair of short near-black `#1A1008` brows just above the eyes. These are what he *acts* with — he raises them (surprise / curiosity), furrows them (disapproval), or cocks one (skeptical). Brows move constantly and carry the quick, human read of his mood.\n- **Mustache = the clock hands:** the two thin sweep hands radiating from the centre pivot are his **MUSTACHE** — NOT eyebrows, NOT arms, NOT gesturing limbs. Their angle is the slow, formal mood read:\n  - drooping DOWN = defeated / deflated / "broken"\n  - HORIZONTAL = neutral, composed, on-duty\n  - swept UP = pleased / agitated / energised\n  A rapid spin of the mustache-hands = flustered excitement.',
  },
  {
    label: 'FACE default-expression',
    find: 'Default performative expression: pinched, self-important scowl (hands held tense and slightly crossed) — this is the mask. But it cracks easily: a kind word, a small accident, or Sandy doing something unexpectedly earnest makes his hands visibly relax into the gentler "curious" position for a beat before he catches himself and re-tenses.',
    replace: 'Default performative expression: pinched, self-important scowl — brows furrowed low, mustache-hands held level and tense. This is the mask. But it cracks easily: a kind word, a small accident, or Sandy doing something unexpectedly earnest makes his brows lift and his mustache-hands sweep up into the gentler, pleased position for a beat before he catches himself and re-tenses.',
  },
  {
    label: 'CLIPBOARD gloved hand',
    find: '- **Clipboard:** Always carried via one of his puppeted glove-hands',
    replace: '- **Clipboard:** Always carried in one of his connected gloved hands',
  },
  {
    label: 'MOVEMENT connected hands',
    find: 'Gestures (via his puppeted gloved hands) are short, stabbing, and rhythmic',
    replace: 'Gestures (with the gloved hands on his connected arms) are short, stabbing, and rhythmic',
  },
  {
    label: 'VISUAL NOTES table row',
    find: '| Mood hands (mustache/eyebrows) | Warm Ochre `#D4A032` — position/motion is the primary emotion dial; must read clearly even in the "soft" relaxed pose, not just the tense scowl pose |',
    replace: '| Eyes | Two round dial eyes (≈ II and X positions), white `#FFF8EC` with near-black `#1A1008` pupils — ALWAYS present, never a blank dial |\n| Eyebrows | Short near-black `#1A1008` brows above the eyes — the fast mood indicator (raise / furrow / cock one) |\n| Mustache (the clock sweep-hands) | Warm Ochre `#D4A032` — angle IS the formal mood dial (down = defeated, horizontal = neutral, up = pleased); must read clearly in every pose |',
  },
  {
    label: 'SILHOUETTE note',
    find: 'the mood-hand angle is the readable emotion cue at any scale, including the softened/relaxed position that signals his true nature breaking through.',
    replace: 'the mustache-hand angle plus the eyebrow position are the readable emotion cues at any scale, including the softened/relaxed pose (brows up, mustache swept up) that signals his true nature breaking through.',
  },
];

(async () => {
  const { data, error } = await sb.from('assets').select('content').eq('id', ID).maybeSingle();
  if (error || !data) { console.error('fetch failed', error?.message); process.exit(1); }
  let content = (data as { content: string }).content;
  console.log(`=== Inspector Stopwatch (${ID}) — ${content.split('\n').length} lines ===`);
  for (const r of REPLS) {
    const count = content.split(r.find).length - 1;
    if (count !== 1) { console.error(`  ✗ [${r.label}] expected 1 match, got ${count}`); process.exit(1); }
    content = content.replace(r.find, r.replace);
    console.log(`  ✓ ${r.label}`);
  }
  const { error: uerr } = await sb.from('assets').update({ content } as never).eq('id', ID);
  if (uerr) { console.error(`  update failed: ${uerr.message}`); process.exit(1); }
  console.log(`  → saved (${content.split('\n').length} lines)`);
})().catch((e) => { console.error(e); process.exit(1); });
