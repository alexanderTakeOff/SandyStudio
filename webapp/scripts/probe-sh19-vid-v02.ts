// Read SH19 VID v02 to confirm Polина's report — what prompt was actually
// generated, and what payload metadata indicates about planAssetId routing.
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
  console.log('=== SH19 VID-shot rows (all versions, newest first) ===');
  const vids = JSON.parse(await rest(
    `assets?episode_id=eq.${EPISODE}&filename=ilike.*VID-shot*sh19*&select=id,filename,status,version,updated_at,metadata&order=version.desc,updated_at.desc`,
  )) as Array<{ id: string; filename: string; status: string; version: number; updated_at: string; metadata: Record<string, unknown> | null }>;
  for (const v of vids) {
    console.log(`\n--- v${String(v.version).padStart(2, '0')} ${v.status} ${v.updated_at} ---`);
    console.log(`  ${v.filename}`);
    console.log(`  id=${v.id}`);
    console.log(`  metadata:`);
    console.log(JSON.stringify(v.metadata, null, 2).slice(0, 4000));
  }

  console.log('\n\n=== latest jobs for EXEC-VGEN this episode ===');
  const jobs = JSON.parse(await rest(
    `jobs?episode_id=eq.${EPISODE}&agent_id=eq.EXEC-VGEN&select=id,inngest_event,inngest_run_id,status,input_snapshot,output_ref,started_at&order=started_at.desc.nullsfirst&limit=5`,
  )) as Array<{ id: string; inngest_event: string; inngest_run_id: string; status: string; input_snapshot: Record<string, unknown> | null; output_ref: string | null; started_at: string | null }>;
  for (const j of jobs) {
    console.log(`\n  ${j.started_at ?? '(no start)'}  ${j.inngest_event}  status=${j.status}`);
    console.log(`    job_id=${j.id}`);
    console.log(`    output=${j.output_ref ?? '(none)'}`);
    console.log(`    input_snapshot: ${JSON.stringify(j.input_snapshot ?? null, null, 2).slice(0, 1500)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
