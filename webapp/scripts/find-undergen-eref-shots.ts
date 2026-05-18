// Find E21 EREF shots with too few candidates (≤1 REVIEW/APPROVED variant)
// so we can re-fire generation on gpt-image-2 with the existing prompt.
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
const EP = '21f7bd6a-f52c-4ae0-bd47-06ff328ec6e7';
const SINCE = '2026-05-16T08:11:18'; // v05 approve moment

(async () => {
  // Load all v05-era EREF refs
  const { data: assets } = await sb
    .from('assets')
    .select('id,filename,status,version,created_at,metadata')
    .eq('episode_id', EP)
    .like('file_type', 'IMG-episode_ref%')
    .gte('created_at', SINCE)
    .order('created_at', { ascending: true });
  if (!assets) {
    console.log('no assets');
    return;
  }

  // Group by shot_id
  const byShot = new Map<string, Array<{ id: string; status: string; version: number; createdAt: string; filename: string }>>();
  for (const a of assets) {
    const sid = ((a as { metadata?: { shot_reference?: { shot_id?: string } } } | null)?.metadata?.shot_reference?.shot_id);
    if (typeof sid !== 'string') continue;
    if (!byShot.has(sid)) byShot.set(sid, []);
    byShot.get(sid)!.push({
      id: a.id as string,
      status: a.status as string,
      version: a.version as number,
      createdAt: (a.created_at as string) ?? '',
      filename: (a.filename as string) ?? '',
    });
  }

  console.log(`=== Per-shot v05-era ref distribution (${byShot.size} distinct shot_ids) ===\n`);
  // Sort shot_ids for stable output
  const sorted = [...byShot.keys()].sort();
  const undergen: Array<{ shotId: string; latestAsset: { id: string; status: string } }> = [];
  for (const sid of sorted) {
    const refs = byShot.get(sid)!;
    const counts: Record<string, number> = {};
    for (const r of refs) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const summary = Object.entries(counts).map(([s, n]) => `${s}=${n}`).join(' ');
    const latest = refs[refs.length - 1];
    const flag = refs.length <= 1 ? '⚠️ ' : '   ';
    console.log(`${flag}${sid.padEnd(28)} total=${refs.length}  ${summary}  latest_v${latest.version} ${latest.status}`);
    if (refs.length <= 1) {
      undergen.push({ shotId: sid, latestAsset: { id: latest.id, status: latest.status } });
    }
  }

  console.log(`\n=== Undergen (≤1 ref) — ${undergen.length} shots ===`);
  for (const u of undergen) {
    console.log(`  ${u.shotId}  asset_id=${u.latestAsset.id}  status=${u.latestAsset.status}`);
  }
})();
