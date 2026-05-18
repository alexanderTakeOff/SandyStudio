// Poll VGEN pilot jobs + assets until both done (or one fails).
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

async function snapshot(): Promise<{ pilots: { shot: string; status: string; error: string | null }[]; assets: { id: string; status: string; filename: string; createdAt: string }[] }> {
  const { data: jobs } = await sb
    .from('jobs')
    .select('id,status,started_at,completed_at,error_message,input_snapshot')
    .eq('episode_id', EP)
    .eq('agent_id', 'EXEC-VGEN')
    .order('created_at', { ascending: false })
    .limit(5);
  const pilots = (jobs ?? [])
    .filter((j) => (j.input_snapshot as { pilot?: boolean })?.pilot === true)
    .slice(0, 2)
    .map((j) => ({
      shot: (j.input_snapshot as { shotId?: string })?.shotId ?? '?',
      status: j.status as string,
      error: (j.error_message as string | null) ?? null,
    }));
  const { data: assets } = await sb
    .from('assets')
    .select('id,filename,status,created_at')
    .eq('episode_id', EP)
    .like('file_type', 'VID-shot%')
    .gte('created_at', '2026-05-18T07:50:00')
    .order('created_at', { ascending: false })
    .limit(5);
  return {
    pilots,
    assets: (assets ?? []).map((a) => ({
      id: a.id as string,
      status: a.status as string,
      filename: a.filename as string,
      createdAt: a.created_at as string,
    })),
  };
}

(async () => {
  const start = Date.now();
  for (let i = 1; i <= 12; i++) {
    await new Promise((r) => setTimeout(r, 60_000));
    const elapsed = Math.round((Date.now() - start) / 1000);
    const ts = new Date().toISOString().slice(11, 19);
    const snap = await snapshot();
    console.log(`\n[poll ${i}, +${elapsed}s @ ${ts}]`);
    console.log('PILOT JOBS:');
    for (const p of snap.pilots) {
      console.log(`  shot=${p.shot.padEnd(28)} status=${p.status.padEnd(10)} ${p.error ? 'ERR: ' + p.error.slice(0, 80) : ''}`);
    }
    console.log('VID-shot ASSETS:');
    for (const a of snap.assets) {
      console.log(`  ${a.createdAt.slice(11, 19)} ${a.status.padEnd(10)} ${a.filename.slice(0, 80)}`);
    }
    const done = snap.pilots.filter((p) => p.status === 'COMPLETED').length;
    const failed = snap.pilots.filter((p) => p.status === 'FAILED').length;
    if (done >= 2) {
      console.log('\n✓ Both pilots completed');
      return;
    }
    if (failed >= 1) {
      console.log('\n✗ At least one pilot FAILED — stopping');
      return;
    }
  }
  console.log('\nTimeout — pilots still running after 12 minutes');
})();
