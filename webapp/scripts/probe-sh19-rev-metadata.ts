// Inspect raw metadata of SH19 REV-shot_plan rows to find the missing verdict.
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
  const r = await fetch(`${U}/rest/v1/${q}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } });
  return r.text();
}

async function main(): Promise<void> {
  const rows = JSON.parse(await rest(
    `assets?episode_id=eq.${EPISODE}&filename=ilike.*REV-shot_plan*SH19*&select=id,filename,metadata&order=version.desc&limit=2`,
  )) as Array<{ id: string; filename: string; metadata: Record<string, unknown> | null }>;
  for (const r of rows) {
    console.log(`\n=== ${r.filename} ===`);
    console.log(`id=${r.id}`);
    console.log('metadata (first 3000 chars):');
    console.log(JSON.stringify(r.metadata, null, 2).slice(0, 3000));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
