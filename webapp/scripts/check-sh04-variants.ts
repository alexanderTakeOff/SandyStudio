// Diagnose SH04 variant approvals — Director reported approve modal spinner
// but no state change. TD-27 evidence collection. 2026-05-21.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) for (const raw of readFileSync(envPath, 'utf-8').split('\n')) { const l=raw.trim(); if (!l||l.startsWith('#')) continue; const eq=l.indexOf('='); if (eq<=0) continue; let v=l.slice(eq+1).trim(); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); process.env[l.slice(0,eq).trim()]=v; }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  console.log('=== SH04 IMG assets ===');
  const { data: imgs } = await sb
    .from('assets')
    .select('id,filename,status,created_at,updated_at,metadata')
    .like('filename', 'SS-S15-E01-IMG-episode_ref_ss_s15_e01_a1_sc02_sh04%')
    .order('created_at', { ascending: true });
  for (const r of imgs ?? []) {
    console.log(`\n  ${r.filename}`);
    console.log(`    id: ${r.id}`);
    console.log(`    status: ${r.status}`);
    console.log(`    created: ${r.created_at}  updated: ${r.updated_at}`);
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    const sr = m.shot_reference as Record<string, unknown> | undefined;
    console.log(`    shot_reference.verdict: ${sr?.verdict ?? '-'}`);
    console.log(`    metadata.review_decision: ${m.review_decision ?? '-'}`);
  }
  console.log('\n=== Recent activity for SH04 (last 20 events touching it) ===');
  const sh04AssetIds = (imgs ?? []).map((r) => r.id);
  if (sh04AssetIds.length > 0) {
    const { data: events } = await sb
      .from('activity_events')
      .select('created_at,event_type,actor,asset_id,title,description')
      .in('asset_id', sh04AssetIds)
      .order('created_at', { ascending: false })
      .limit(20);
    for (const r of events ?? []) {
      console.log(`  ${r.created_at}  ${(r.event_type as string).padEnd(20)} a:${String(r.asset_id).slice(0,8)} | ${String(r.title ?? '').slice(0,60)}`);
      if (r.description) console.log(`     desc: ${String(r.description).slice(0,120)}`);
    }
  }

  // Plus: jobs for SH04 in last 10 min
  console.log('\n=== Recent EXEC-EREF jobs (last 30 min) ===');
  const since30 = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: jobs } = await sb
    .from('jobs')
    .select('id,agent_id,status,started_at,completed_at,error')
    .gte('started_at', since30)
    .order('started_at', { ascending: false })
    .limit(20);
  for (const j of jobs ?? []) {
    console.log(`  ${j.started_at}  ${(j.status as string).padEnd(10)} ${(j.agent_id as string).padEnd(25)} ${j.error ? '[ERR: '+String(j.error).slice(0,60)+']' : ''}`);
  }
  process.exit(0);
})();
