// Locate SH22 IMG-episode_ref v02 APPROVED so Director can verify before
// the next manual direct-vgen test uses it as end_image.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const l = raw.trim(); if (!l || l.startsWith('#')) continue;
    const eq = l.indexOf('='); if (eq <= 0) continue;
    let v = l.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[l.slice(0, eq).trim()] = v;
  }
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EPISODE = 'f019c29f-5e1e-4964-b62b-6c59fc3aa966';

async function rest(q: string): Promise<string> {
  return (await fetch(`${U}/rest/v1/${q}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } })).text();
}

async function main(): Promise<void> {
  console.log('=== All SH22 IMG-episode_ref rows ===\n');
  const rows = JSON.parse(await rest(
    `assets?episode_id=eq.${EPISODE}&filename=ilike.*IMG-episode_ref*SH22*&select=id,filename,status,version,staging_path,updated_at,metadata&order=version.desc,updated_at.desc`,
  )) as Array<{ id: string; filename: string; status: string; version: number; staging_path: string | null; updated_at: string; metadata: Record<string, unknown> | null }>;
  for (const r of rows) {
    const meta = r.metadata ?? {};
    const sr = (meta as { shot_reference?: { shot_id?: string; role_in_shot?: string } }).shot_reference;
    console.log(`  ${r.filename}`);
    console.log(`    id=${r.id}`);
    console.log(`    status=${r.status}  v=${r.version}  updated=${r.updated_at}`);
    console.log(`    staging=${r.staging_path ?? '(none)'}`);
    if (sr) console.log(`    meta.shot_reference: shot_id=${sr.shot_id}  role=${sr.role_in_shot ?? '?'}`);
    console.log('');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
