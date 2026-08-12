import { readFileSync, writeFileSync } from 'node:fs';
for (const raw of readFileSync('.env.local', 'utf-8').split('\n')) {
  const l = raw.trim(); if (!l || l.startsWith('#')) continue;
  const e = l.indexOf('='); if (e <= 0) continue;
  let v = l.slice(e + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[l.slice(0, e).trim()] = v;
}
import { openAIEditsMultiProvider } from '../lib/providers/openai-edits-multi';
const SRC = 'scripts/_inspector_current.png';
const OUT = process.env.OUT || 'scripts/_inspector_candidate.png';
const PROMPT = `Canonical character reference sheet for "Inspector Stopwatch", a cartoon anthropomorphic hand-held stopwatch. Keep the ENTIRE image identical — same chrome stopwatch body, blue rim, cream dial with tick marks, the two gold sweep-hands (his mustache), red shoes, legs, the sky-blue lanyard badge, the clipboard with pencil, the same colours, outline style, pose and composition — and make ONLY these two additions:

1) FACE: Add two round cartoon EYES on the upper part of the watch dial (white with solid near-black round pupils, spaced apart roughly like the II and X clock positions, sitting ABOVE the gold mustache-hands). Directly above each eye add one short, thick near-black EYEBROW. Eyes look forward with a mild, self-important expression.

2) ARMS: Connect the two white-gloved hands to the body. Draw a short dark-grey rubber-hose ARM growing from each side of the round stopwatch body out to each glove — the left glove (open, gesturing) and the right glove (holding the clipboard) must BOTH be attached to the body by these arms, not floating in empty space. Rubber-hose style, no visible joints, matching the character's leg style.

Change nothing else. Same art style, same colours, same layout, same cream background.`;

(async () => {
  const b64 = readFileSync(SRC).toString('base64');
  console.log('calling gpt-image-2 edit (high quality, 1024x1024)…');
  const res = await openAIEditsMultiProvider.generate({
    prompt: PROMPT,
    references: [{ image_b64: b64, kind: 'character' }],
    size: '1024x1024',
    quality: 'high',
    negative: ['floating detached hands', 'hands not connected to body', 'extra characters', 'added text or labels', 'watermark', 'changed body shape', 'removing the mustache sweep-hands'],
  } as never);
  writeFileSync(OUT, Buffer.from(res.b64_data, 'base64'));
  console.log(`OK → ${OUT}  cost=$${res.cost_usd}  model=${res.model}  ${res.width}x${res.height}`);
})().catch((e) => { console.error('GEN FAILED:', e.message ?? e); process.exit(1); });
