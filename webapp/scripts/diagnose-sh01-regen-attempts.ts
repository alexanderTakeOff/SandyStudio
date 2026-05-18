// Diagnose Director's regen attempts on sh01 v4 — read asset metadata,
// recent activity_events, and any history entries to see what API calls
// landed (or didn't).
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
const SH01_ASSET_ID = '8338d036-cc31-4444-b403-136ed4e4a638';
const EP = '21f7bd6a-f52c-4ae0-bd47-06ff328ec6e7';

(async () => {
  // 1. Asset row + metadata
  const { data: asset } = await sb
    .from('assets')
    .select('id,filename,status,metadata,updated_at')
    .eq('id', SH01_ASSET_ID)
    .maybeSingle();
  console.log('=== sh01 v4 asset ===');
  console.log(`status: ${(asset as { status?: string } | null)?.status}`);
  console.log(`updated_at: ${(asset as { updated_at?: string } | null)?.updated_at}`);
  const md = ((asset as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
  console.log('metadata keys:', Object.keys(md));

  // Detect v2 EREF (shot_reference)
  const sr = md.shot_reference as { generation_history?: unknown[] } | undefined;
  if (sr) {
    console.log(`shot_reference present: generation_history entries = ${sr.generation_history?.length ?? 0}`);
  } else {
    console.log('NO shot_reference — this is a v1 EREF asset (no isShotReferenceV2 path).');
  }

  // image_prompt history
  const ip = md.image_prompt as { history?: unknown[]; current_version?: number } | undefined;
  if (ip) {
    console.log(`image_prompt.history entries = ${ip.history?.length ?? 0}, current_version = ${ip.current_version}`);
  } else {
    console.log('NO image_prompt.history.');
  }

  // 2. Activity events for this asset in last 60 min
  const SINCE = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: events } = await sb
    .from('activity_events')
    .select('event_type,severity,title,actor,metadata,created_at')
    .eq('asset_id', SH01_ASSET_ID)
    .gte('created_at', SINCE)
    .order('created_at', { ascending: true });
  console.log(`\n=== activity_events for sh01 v4 since ${SINCE.slice(11, 19)} ===`);
  console.log(`Total: ${events?.length ?? 0}`);
  for (const e of events ?? []) {
    console.log(`${e.created_at?.slice(11, 19) ?? '?'} [${(e.event_type as string).padEnd(20)}] ${(e.actor as string).padEnd(40)} ${(e.title as string).slice(0, 80)}`);
    if (e.metadata) console.log(`  meta:`, JSON.stringify(e.metadata).slice(0, 200));
  }

  // 3. Approvals
  const { data: apps } = await sb
    .from('approvals')
    .select('*')
    .eq('asset_id', SH01_ASSET_ID);
  console.log(`\n=== approvals for sh01 v4 ===`);
  console.log(`Total: ${apps?.length ?? 0}`);
  for (const a of apps ?? []) {
    console.log(`  ${a.created_at?.slice(11, 19)} ${a.approval_type} by ${a.approved_by} note: ${(a.notes as string ?? '').slice(0, 100)}`);
  }

  // 4. Latest jobs episode-wide
  const { data: jobs } = await sb
    .from('jobs')
    .select('id,agent_id,status,inngest_event,started_at,error_message')
    .eq('episode_id', EP)
    .gte('started_at', SINCE)
    .order('started_at', { ascending: false })
    .limit(8);
  console.log(`\n=== Recent jobs ===`);
  for (const j of jobs ?? []) {
    console.log(`${j.started_at?.slice(11, 19) ?? '?'} ${(j.agent_id as string).padEnd(14)} ${(j.status as string).padEnd(10)} ${j.inngest_event}`);
    if (j.error_message) console.log(`  err: ${j.error_message}`);
  }

  // 5. Episode governance mode
  const { data: ep } = await sb
    .from('episodes')
    .select('governance_mode')
    .eq('id', EP)
    .maybeSingle();
  console.log(`\n=== Episode governance_mode = ${(ep as { governance_mode?: number } | null)?.governance_mode} ===`);
})();
