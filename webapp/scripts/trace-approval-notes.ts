// Trace what Polina passed when she approved the SREV REV asset, and
// whether anything downstream-of-approve reads it.
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

const REV_ASSET = '4d8b8294-02a8-4469-8c25-aa2f2dc63368'; // SREV result that was approved
const STB_ASSET = 'eeb463e1-fe92-434b-9d49-231144fe4d03'; // Storyboard v01 that was produced

(async () => {
  // 1. approval_granted activity_event for REV — contains Polina's note.
  const { data: appEvents } = await sb
    .from('activity_events')
    .select('event_type,title,description,actor,metadata,created_at')
    .eq('asset_id', REV_ASSET)
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('=== activity_events for REV asset (Polina approve here) ===');
  for (const e of appEvents ?? []) {
    console.log(`\n${e.created_at?.slice(11, 19)} ${e.event_type} actor=${e.actor}`);
    console.log('  title:', e.title);
    console.log('  description:', (e.description ?? '').slice(0, 800));
    console.log('  metadata:', JSON.stringify(e.metadata, null, 2).slice(0, 800));
  }

  // 2. approvals table (canonical store of approval notes).
  const { data: approvals } = await sb
    .from('approvals')
    .select('*')
    .eq('asset_id', REV_ASSET);
  console.log('\n=== approvals row for REV asset ===');
  console.log(JSON.stringify(approvals, null, 2));

  // 3. STB asset description + metadata — did anything reach it?
  const { data: stb } = await sb
    .from('assets')
    .select('id,description,metadata')
    .eq('id', STB_ASSET)
    .maybeSingle();
  console.log('\n=== STB asset description / metadata ===');
  console.log('description:', stb?.description);
  console.log('metadata keys:', Object.keys((stb?.metadata ?? {}) as Record<string, unknown>));

  // 4. The Inngest event that fired the Storyboard Artist — its `data` field.
  const { data: stbJob } = await sb
    .from('jobs')
    .select('id,inngest_event,event_data,started_at')
    .eq('agent_id', 'EXEC-SB')
    .eq('episode_id', '21f7bd6a-f52c-4ae0-bd47-06ff328ec6e7')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log('\n=== Storyboard job + event_data ===');
  console.log(JSON.stringify(stbJob, null, 2));
})();
