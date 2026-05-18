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

(async () => {
  // 1. Get v05 STB shots
  const { data: stbAsset } = await sb.from('assets').select('content').eq('episode_id', EP).like('file_type', 'STB-storyboard%').eq('status', 'APPROVED').order('version', { ascending: false }).limit(1).maybeSingle();
  const stbContent = (stbAsset as { content?: string } | null)?.content ?? '';
  const m = /```json\s*([\s\S]*?)```/i.exec(stbContent);
  let v05Shots: string[] = [];
  if (m && m[1]) {
    try {
      const body = JSON.parse(m[1]) as { acts?: Array<{ shots?: Array<{ shot_id?: string }> }> };
      if (Array.isArray(body.acts)) {
        v05Shots = body.acts.flatMap(a => (Array.isArray(a.shots) ? a.shots.map(s => s.shot_id || '') : [])).filter(Boolean);
      }
    } catch (e) {
      console.log('Failed to parse v05 STB:', String(e));
    }
  }
  console.log('v05 canonical shots:', v05Shots.length);

  // 2. Get all EREF assets with shot_id and creation time
  const { data: refAssets } = await sb.from('assets').select('id,filename,status,version,created_at,metadata').eq('episode_id', EP).like('file_type', 'IMG-episode_ref%').order('created_at', { ascending: false });
  const shotRefMap: Record<string, Array<{ status: string; version: number; created_at: string }>> = {};
  for (const asset of refAssets ?? []) {
    const shotId = ((asset.metadata as { shot_reference?: { shot_id?: string } } | null)?.shot_reference?.shot_id);
    if (!shotId) continue;
    if (!shotRefMap[shotId]) shotRefMap[shotId] = [];
    shotRefMap[shotId].push({
      status: asset.status,
      version: asset.version ?? 0,
      created_at: asset.created_at ?? ''
    });
  }

  console.log('\n=== Per-shot v05-era coverage (after 2026-05-16T08:11:18) ===');
  console.log('shot_id | refs_count | latest_status');
  const cutoff = '2026-05-16T08:11:18';
  for (const shotId of v05Shots) {
    const refs = shotRefMap[shotId] ?? [];
    const newRefs = refs.filter(r => r.created_at >= cutoff);
    const latest = newRefs.length > 0 ? newRefs[0].status : refs.length > 0 ? `(pre-cutoff: ${refs[0].status})` : 'NONE';
    console.log(`${shotId} | ${newRefs.length} | ${latest}`);
  }

  console.log('\n=== Missing shots (zero refs after cutoff) ===');
  const missing = v05Shots.filter(sid => {
    const refs = shotRefMap[sid] ?? [];
    const newRefs = refs.filter(r => r.created_at >= cutoff);
    return newRefs.length === 0;
  });
  console.log(`Total missing: ${missing.length}`);
  missing.forEach(sid => console.log(`  ${sid}`));

  // 3. Job timeline with errors
  const { data: jobs } = await sb.from('jobs').select('id,inngest_event,status,started_at,completed_at,error_message,created_at').eq('episode_id', EP).eq('agent_id', 'EXEC-EREF').order('created_at', { ascending: false }).limit(30);
  console.log('\n=== EREF job timeline (last 30) ===');
  for (const j of jobs ?? []) {
    console.log(`${j.created_at?.slice(0, 19) ?? '?'} ${j.inngest_event?.padEnd(35) ?? '?'} ${j.status?.padEnd(12) ?? '?'}`);
    if (j.status === 'FAILED' && j.error_message) {
      console.log(`  ERROR: ${j.error_message.slice(0, 100)}`);
    }
  }

  // 4. Budget check
  const { data: epRow } = await sb.from('episodes').select('budget_spent,budget_ceiling,metadata').eq('id', EP).maybeSingle();
  console.log('\n=== Budget check ===');
  console.log(`budget_spent: ${(epRow as any)?.budget_spent ?? 'N/A'}`);
  console.log(`budget_ceiling: ${(epRow as any)?.budget_ceiling ?? 'N/A'}`);
  
  // 5. Budget log for EXEC-EREF
  const { data: budgetLog } = await sb.from('budget_log').select('action,amount,created_at,metadata').eq('episode_id', EP).like('action', '%EXEC-EREF%').order('created_at', { ascending: false }).limit(20);
  console.log('\n=== Budget log (EXEC-EREF, last 20) ===');
  let total = 0;
  for (const entry of budgetLog ?? []) {
    const amount = ((entry.metadata as { amount?: number } | null)?.amount) ?? 0;
    total += amount;
    console.log(`${entry.created_at?.slice(0, 19)} ${entry.action?.padEnd(30)} amount=${amount}`);
  }
  console.log(`Total EXEC-EREF spend (24h): ${total}`);
})();
