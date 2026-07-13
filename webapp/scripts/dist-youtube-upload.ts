import * as fs from 'fs'; import * as path from 'path';
const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g,''); }
import { listAllUploads, uploadVideo } from '../lib/agents/providers/youtube';

const FINALS = 'H:/Мой диск/SandyStudio_Media/Finals';
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

const DESCRIPTION = '⏳ Sandy the Hourglass — silent physical comedy. Life is short. Flip yourself.';

(async () => {
  const existing = (await listAllUploads()).map(v => ({ ...v, n: norm(v.title) }));
  const missing = PLAN.filter(p => !existing.some(v => v.n.includes(norm(p.match))));
  console.log(`Missing → uploading ${missing.length}: ${missing.map(m => m.ep).join(', ')}\n`);
  for (const p of missing) {
    const full = path.join(FINALS, p.file);
    if (!fs.existsSync(full)) { console.log(`SKIP ${p.ep} — file not found: ${full}`); continue; }
    const bytes = new Uint8Array(fs.readFileSync(full));
    console.log(`Uploading ${p.ep} "${p.title}" (${(bytes.length/1024/1024).toFixed(1)}MB, unlisted)...`);
    try {
      const r = await uploadVideo({ bytes, title: p.title, description: DESCRIPTION, privacyStatus: 'unlisted' });
      console.log(`  ✅ ${r.url}  [${r.id}]  privacy=${r.privacyStatus}`);
    } catch (e: any) {
      console.log(`  ❌ FAILED: ${e?.message || e}`);
      if (e?.body) console.log('     body:', String(e.body).slice(0, 400));
    }
  }
})().catch(e => { console.error('ERROR:', e?.message || e); process.exit(1); });
