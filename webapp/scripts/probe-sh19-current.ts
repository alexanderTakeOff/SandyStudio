// Quick state check — what SH19 Plans + Critic verdicts exist RIGHT NOW.
// Run: cd webapp && npx tsx scripts/probe-sh19-current.ts

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
  console.log('=== SH19 SPC-shot_plan rows (all versions, latest first) ===');
  const plans = JSON.parse(await rest(
    `assets?episode_id=eq.${EPISODE}&filename=ilike.*SPC-shot_plan*SH19*&select=id,filename,status,version,updated_at&order=version.desc,updated_at.desc`,
  )) as Array<{ id: string; filename: string; status: string; version: number; updated_at: string }>;
  for (const p of plans) {
    console.log(`  v${String(p.version).padStart(2, '0')}  status=${p.status.padEnd(10)}  updated=${p.updated_at}  id=${p.id}`);
    console.log(`        ${p.filename}`);
  }

  console.log('\n=== SH19 REV-shot_plan rows (Critic verdicts, latest first) ===');
  const revs = JSON.parse(await rest(
    `assets?episode_id=eq.${EPISODE}&filename=ilike.*REV-shot_plan*SH19*&select=id,filename,status,version,updated_at,metadata&order=version.desc,updated_at.desc&limit=4`,
  )) as Array<{ id: string; filename: string; status: string; version: number; updated_at: string; metadata: Record<string, unknown> | null }>;
  for (const r of revs) {
    const m = r.metadata ?? {};
    const verdict = (m as { verdict?: string }).verdict ?? '?';
    const planId = (m as { plan_asset_id?: string }).plan_asset_id ?? '?';
    console.log(`  v${String(r.version).padStart(2, '0')}  status=${r.status.padEnd(10)}  verdict=${verdict.padEnd(22)} plan_asset_id=${planId}`);
    console.log(`        ${r.filename}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
