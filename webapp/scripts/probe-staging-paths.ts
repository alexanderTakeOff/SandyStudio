// Compare staging_path format on existing APPROVED VID-shot rows
// (SH15 and SH20) vs my just-ingested SH19 v03. Determine canonical format
// for stitch resolution.
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
  console.log('=== All APPROVED VID-shot rows for SS-S15-E01 ===\n');
  const rows = JSON.parse(await rest(
    `assets?episode_id=eq.${EPISODE}&filename=ilike.*VID-shot*&status=eq.APPROVED&select=id,filename,staging_path,drive_path,drive_file_id&order=filename.asc`,
  )) as Array<{ id: string; filename: string; staging_path: string | null; drive_path: string | null; drive_file_id: string | null }>;
  for (const r of rows) {
    console.log(`  ${r.filename}`);
    console.log(`    id=${r.id}`);
    console.log(`    staging_path: ${r.staging_path}`);
    console.log(`    drive_path:   ${r.drive_path}`);
    console.log(`    drive_file_id: ${r.drive_file_id}`);
    console.log('');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
