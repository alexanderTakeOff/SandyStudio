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

async function main() {
  // 1. SC11 VID-shot rows
  const { data: rows } = await sb
    .from('assets')
    .select('id,filename,status,version,metadata,created_at')
    .eq('episode_id', '763c5c1e-44dc-4e10-92fb-e7671e5d4a44')
    .like('file_type', 'VID-shot%')
    .or('metadata->>shot_id.eq.SS-S14-E20-A3-SC11-SH01,metadata->>shot_id.eq.SS-S14-E20-A3-SC11-SH02')
    .order('created_at', { ascending: false });
  console.log(`=== SC11-* VID-shot rows: ${rows?.length ?? 0} ===`);
  for (const r of rows ?? []) {
    const m = r.metadata as { shot_id?: string } | null;
    console.log(`  ${r.created_at.slice(11,19)} ${r.status.padEnd(9)} v${r.version} ${m?.shot_id} ${r.filename}`);
  }

  // 2. Recent activity events for SC11
  const { data: evts } = await sb
    .from('activity_events')
    .select('event_type,actor,title,created_at,description')
    .eq('episode_id', '763c5c1e-44dc-4e10-92fb-e7671e5d4a44')
    .gte('created_at', '2026-05-13T09:30:00Z')
    .order('created_at', { ascending: false })
    .limit(20);
  console.log(`\n=== Activity events since 09:30 ===`);
  for (const e of evts ?? []) {
    if (e.title.includes('SC11') || e.title.includes('SC10') || e.event_type === 'agent_failed') {
      console.log(`  ${e.created_at.slice(11,19)} ${e.event_type.padEnd(20)} ${e.actor ?? '?'} · ${e.title.slice(0,80)}`);
    }
  }

  // 3. All recent VGEN single-shot triggers
  const { data: trigs } = await sb
    .from('activity_events')
    .select('event_type,title,metadata,created_at')
    .eq('episode_id', '763c5c1e-44dc-4e10-92fb-e7671e5d4a44')
    .gte('created_at', '2026-05-13T09:40:00Z')
    .order('created_at', { ascending: false });
  console.log(`\n=== ALL events since 09:40 (${trigs?.length ?? 0}) ===`);
  for (const e of trigs ?? []) {
    console.log(`  ${e.created_at.slice(11,19)} ${e.event_type.padEnd(20)} ${e.title.slice(0,90)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
