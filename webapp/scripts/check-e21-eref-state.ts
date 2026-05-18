// Check current E21 EREF state — running jobs, pilot state, asset distribution.
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
  const { data: epRow } = await sb.from('episodes').select('id,episode_code,metadata').eq('id', EP).maybeSingle();
  console.log('=== episode ===');
  console.log('id:', (epRow as { id?: string } | null)?.id);
  console.log('episode_code:', (epRow as { episode_code?: string } | null)?.episode_code);
  console.log('metadata:', JSON.stringify((epRow as { metadata?: unknown } | null)?.metadata, null, 2));

  const { data: pilotCfg } = await sb.from('app_config').select('value').eq('scope', 'app').eq('key', `eref_pilot_state:${EP}`).maybeSingle();
  console.log('\n=== app_config eref_pilot_state ===');
  console.log(JSON.stringify((pilotCfg as { value?: unknown } | null)?.value, null, 2));

  const { data: jobs } = await sb.from('jobs').select('id,agent_id,status,inngest_event,created_at,completed_at').eq('episode_id', EP).eq('agent_id', 'EXEC-EREF').order('created_at', { ascending: false }).limit(10);
  console.log('\n=== EREF jobs (last 10) ===');
  for (const j of jobs ?? []) {
    console.log(`${j.created_at?.slice(11, 19) ?? '?'} ${j.status?.padEnd(10) ?? '?'} ${j.inngest_event ?? '?'}`);
  }

  const { data: assets } = await sb.from('assets').select('id,filename,status,version').eq('episode_id', EP).like('file_type', 'IMG-episode_ref%').order('created_at', { ascending: false });
  console.log('\n=== EREF assets ===');
  const byStatus: Record<string, number> = {};
  for (const a of assets ?? []) {
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
  }
  console.log(`total: ${assets?.length ?? 0}, by status:`, byStatus);
  for (const a of (assets ?? []).slice(0, 8)) {
    console.log(`  v${a.version} ${a.status.padEnd(10)} ${a.filename?.slice(0, 80)}`);
  }

  // Count distinct shot_ids
  const { data: refsWithMeta } = await sb.from('assets').select('metadata').eq('episode_id', EP).like('file_type', 'IMG-episode_ref%');
  const distinctShotIds = new Set<string>();
  for (const r of refsWithMeta ?? []) {
    const sid = ((r.metadata as { shot_reference?: { shot_id?: string } } | null)?.shot_reference?.shot_id);
    if (typeof sid === 'string') distinctShotIds.add(sid);
  }
  console.log(`\ndistinct shot_ids with at least one EREF asset: ${distinctShotIds.size}`);

  // Parse APPROVED STB for total shots
  const { data: stb } = await sb.from('assets').select('content').eq('episode_id', EP).like('file_type', 'STB-storyboard%').eq('status', 'APPROVED').order('version', { ascending: false }).limit(1).maybeSingle();
  const stbContent = (stb as { content?: string } | null)?.content ?? '';
  const m = /```json\s*([\s\S]*?)```/i.exec(stbContent);
  let stbTotal: number | null = null;
  if (m && m[1]) {
    try {
      const body = JSON.parse(m[1]) as { acts?: Array<{ shots?: unknown[] }> };
      if (Array.isArray(body.acts)) {
        stbTotal = body.acts.reduce((s, a) => s + (Array.isArray(a.shots) ? a.shots.length : 0), 0);
      }
    } catch { /* */ }
  }
  console.log(`\nAPPROVED STB shot count: ${stbTotal ?? '(unknown — no APPROVED storyboard found)'}`);
})();
