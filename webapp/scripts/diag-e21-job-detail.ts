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
  // Get failed jobs with full error detail
  const { data: jobs } = await sb
    .from('jobs')
    .select('id,inngest_event,status,error_message,created_at,metadata')
    .eq('episode_id', EP)
    .eq('agent_id', 'EXEC-EREF')
    .eq('status', 'FAILED')
    .order('created_at', { ascending: false });

  console.log('=== FAILED EREF jobs (full details) ===\n');
  for (const job of jobs ?? []) {
    console.log(`Job: ${job.id}`);
    console.log(`Event: ${job.inngest_event}`);
    console.log(`Created: ${job.created_at}`);
    console.log(`Error: ${job.error_message}`);
    if ((job.metadata as any)?.context) {
      console.log(`Context: ${JSON.stringify((job.metadata as any).context).slice(0, 100)}`);
    }
    console.log('---');
  }
})();
