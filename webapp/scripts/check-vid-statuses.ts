// Full per-shot VID-shot row inspection: every shot_id, latest row, all rows.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[line.slice(0, eq).trim()] = val;
  }
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: rows } = await sb
    .from('assets')
    .select('id,filename,status,version,metadata,created_at')
    .eq('episode_id', '763c5c1e-44dc-4e10-92fb-e7671e5d4a44')
    .like('file_type', 'VID-shot%')
    .order('created_at', { ascending: false });
  if (!rows) return;

  const byShot = new Map<string, typeof rows>();
  for (const r of rows) {
    const sid = (r.metadata as { shot_id?: string } | null)?.shot_id ?? '?';
    if (!byShot.has(sid)) byShot.set(sid, []);
    byShot.get(sid)!.push(r);
  }

  console.log(`Total VID-shot rows: ${rows.length}, unique shot_ids: ${byShot.size}\n`);
  const sids = [...byShot.keys()].sort();
  let totalApproved = 0, totalReview = 0, totalOther = 0;
  for (const sid of sids) {
    const list = byShot.get(sid)!;
    list.sort((a, b) => (b.version ?? 0) - (a.version ?? 0) || b.created_at.localeCompare(a.created_at));
    const latest = list[0]!;
    const tag =
      latest.status === 'APPROVED' || latest.status === 'LOCKED' ? '✅' :
      latest.status === 'REVIEW' ? '🟠' : '⚪';
    if (tag === '✅') totalApproved++;
    else if (tag === '🟠') totalReview++;
    else totalOther++;
    console.log(`${tag} ${sid}  latest=${latest.status} v${latest.version}  (${list.length} row${list.length > 1 ? 's' : ''})`);
    if (list.length > 1) {
      for (const r of list.slice(1)) {
        console.log(`     └── ${r.status} v${r.version} ${r.created_at.slice(11, 19)}`);
      }
    }
  }
  console.log(`\nSummary: APPROVED=${totalApproved}  REVIEW=${totalReview}  OTHER=${totalOther}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
