// φ.2 telemetry check — read latest E21 STB job runner_notes to confirm
// two-call pattern fired and which skills got activated.
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
(async () => {
  const { data: jobs, error } = await sb
    .from('jobs')
    .select('*')
    .eq('episode_id', '21f7bd6a-f52c-4ae0-bd47-06ff328ec6e7')
    .eq('agent_id', 'EXEC-SB')
    .order('created_at', { ascending: false })
    .limit(3);
  if (error) console.error('error:', error);
  console.log(JSON.stringify(jobs, null, 2));

  // Also check asset.metadata for the v05 STB
  const { data: asset } = await sb
    .from('assets')
    .select('id,filename,status,metadata,content')
    .eq('id', '97a483b7-19b6-4bb0-b59b-6af6f095d768')
    .maybeSingle();
  console.log('\n=== v05 asset metadata ===');
  console.log(JSON.stringify((asset as { metadata?: unknown } | null)?.metadata, null, 2));
  // Check if content has Active Playbooks marker (φ.2 craft-tone block)
  const content = (asset as { content?: string } | null)?.content ?? '';
  const hasNew = /Active Playbooks/i.test(content);
  const hasOld = /Director's standing rules/i.test(content);
  console.log('\nContent markers:');
  console.log(`  "Active Playbooks" (φ.2 craft-tone): ${hasNew}`);
  console.log(`  "Director's standing rules" (σ era): ${hasOld}`);
})();
