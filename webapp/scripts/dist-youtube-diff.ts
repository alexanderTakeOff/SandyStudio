import * as fs from 'fs'; import * as path from 'path';
const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g,''); }

import { getMyChannel, listAllUploads } from '../lib/agents/providers/youtube';

const EXPECTED_CHANNEL = 'UCc2YJlHFclO9BWLEgPlglIg';
const FINALS = 'H:/Мой диск/SandyStudio_Media/Finals';

// 10 finals to distribute (legacy Madam Parfume excluded per q2). `match` = concept
// keyword used to detect whether it is already on the channel.
const PLAN = [
  { file: 'Sandy and Heavy Friend.mp4',       title: 'Sandy and the Heavy Friend',   ep: 'S15-E01', match: 'heavy friend' },
  { file: 'Sandy Cleaning Up.mp4',            title: 'Sandy Cleaning Up',            ep: 'S15-E07', match: 'cleaning' },
  { file: 'Sandy and Power Fan.mp4',          title: 'Sandy and the Power Fan',      ep: 'S15-E11', match: 'power fan' },
  { file: 'sandy and smartphone .mp4',        title: 'Sandy and the Smartphone',     ep: 'S15-E12', match: 'smartphone' },
  { file: 'Sandy and Vending Machine.mp4',    title: 'Sandy and the Vending Machine',ep: 'S15-E13', match: 'vending' },
  { file: 'Sandy and Madam Parfume v03.mp4',  title: 'Sandy and Madam Parfume',      ep: 'S15-E14', match: 'parfume' },
  { file: 'Sandy and Car Wash 1.17.mp4',      title: 'Sandy and the Car Wash',       ep: 'S15-E15', match: 'car wash' },
  { file: 'Sandy in the Gym.mp4',             title: 'Sandy in the Gym',             ep: 'S15-E16', match: 'gym' },
  { file: 'Sandy in elevator.mp4',            title: 'Sandy in the Elevator',        ep: 'S15-E09', match: 'elevator' },
  { file: 'Sandy in the Airport 4.mp4',       title: 'Sandy in the Airport',         ep: 'S15-E25', match: 'airport', short: true },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

(async () => {
  const ch = await getMyChannel();
  console.log(`CHANNEL: ${ch.title}  (id=${ch.id})`);
  console.log(`EXPECTED: ${EXPECTED_CHANNEL}  →  ${ch.id === EXPECTED_CHANNEL ? 'MATCH ✅' : 'MISMATCH ⚠️  (uploads would go to the WRONG channel!)'}\n`);

  const existing = await listAllUploads();
  console.log(`ALREADY ON CHANNEL (${existing.length}):`);
  for (const v of existing) console.log(`  • ${v.title}  [${v.videoId}]  ${v.publishedAt.slice(0,10)}`);
  console.log('');

  const existNorm = existing.map(v => ({ ...v, n: norm(v.title) }));
  let toUpload = 0;
  console.log('PLAN (10 finals):');
  for (const p of PLAN) {
    const full = path.join(FINALS, p.file);
    const exists = fs.existsSync(full);
    const sizeMB = exists ? (fs.statSync(full).size / 1024 / 1024).toFixed(1) : '??';
    const hit = existNorm.find(v => v.n.includes(norm(p.match)));
    const status = hit ? `ON CHANNEL → skip [${hit.videoId}]` : 'MISSING → upload';
    if (!hit) toUpload++;
    console.log(`  ${hit ? '✅' : '⬜'} ${p.ep}  "${p.title}"  (${sizeMB}MB${p.short ? ', SHORT' : ''}, file:${exists?'ok':'NOT FOUND'})  — ${status}`);
  }
  console.log(`\nTO UPLOAD: ${toUpload} / ${PLAN.length}`);
})().catch(e => { console.error('ERROR:', e?.message || e); process.exit(1); });
