// Check v08 Plan's linked REV asset — is plan_asset_id discoverable from
// metadata or only from content JSON body?
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
const V08 = '39954efe-3942-4d9c-bb92-a0c0afed4078';

async function rest(q: string): Promise<string> {
  return (await fetch(`${U}/rest/v1/${q}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } })).text();
}

async function main(): Promise<void> {
  // All REV-shot_plan rows for SH19, latest first
  const revs = JSON.parse(await rest(
    `assets?episode_id=eq.${EPISODE}&filename=ilike.*REV-shot_plan*SH19*&select=id,filename,version,updated_at,metadata,content&order=version.desc,updated_at.desc&limit=5`,
  )) as Array<{ id: string; filename: string; version: number; updated_at: string; metadata: Record<string, unknown> | null; content: string | null }>;

  console.log(`Looking for REV that points at v08 plan id = ${V08}\n`);
  for (const r of revs) {
    console.log(`--- ${r.filename} ---`);
    console.log(`  id=${r.id}  updated=${r.updated_at}`);
    const metaPid = (r.metadata as { plan_asset_id?: string } | null)?.plan_asset_id ?? null;
    console.log(`  metadata.plan_asset_id: ${metaPid}`);

    // Try to extract plan_asset_id from content JSON
    let contentPid: string | null = null;
    let contentVerdict: string | null = null;
    if (r.content) {
      const matches = [...r.content.matchAll(/```json\s*([\s\S]+?)```/g)];
      const last = matches[matches.length - 1]?.[1];
      if (last) {
        try {
          const obj = JSON.parse(last.trim()) as Record<string, unknown>;
          if (typeof obj.plan_asset_id === 'string') contentPid = obj.plan_asset_id;
          if (typeof obj.verdict === 'string') contentVerdict = obj.verdict;
        } catch { /* skip */ }
      }
    }
    console.log(`  content.plan_asset_id:  ${contentPid}`);
    console.log(`  content.verdict:        ${contentVerdict}`);
    console.log(`  → matches v08?  metadata=${metaPid === V08}  content=${contentPid === V08}`);
    console.log('');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
