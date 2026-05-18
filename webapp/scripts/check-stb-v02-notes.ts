// γ-propagation validator — fetch STB v02 and look for the three SREV
// MINOR notes (pull-up §4, jump-rope §5, water bottle §7) that should
// have flowed via upstream_approval_notes into the storyboarder prompt.
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
  const { data } = await sb
    .from('assets')
    .select('id,filename,version,status,content,created_at')
    .eq('episode_id', EP)
    .like('file_type', 'STB-storyboard%')
    .order('version', { ascending: false })
    .limit(2);
  for (const a of data ?? []) {
    console.log(`v${a.version} ${a.status} ${a.filename} (${(a.content ?? '').length} chars)`);
  }
  const latest = data?.[0];
  if (!latest) return;
  const txt = (latest.content ?? '').toLowerCase();
  console.log('\n=== propagation probes ===');
  console.log('  contains "pull-up":   ', /pull[- ]up/i.test(txt));
  console.log('  contains "jump rope" / "jump-rope":', /jump[- ]rope/i.test(txt));
  console.log('  contains "water bottle":', /water bottle/i.test(txt));
  console.log('  contains "tangle":   ', /tangl/i.test(txt));
  console.log('  contains "topple":   ', /toppl/i.test(txt));
  console.log('  contains "DOWNSTREAM NOTES" (block leaked into output):', /DOWNSTREAM NOTES/i.test(txt));
  // Print first ~3000 chars of the markdown body to eyeball.
  console.log('\n=== latest STB content (first 3000 chars) ===');
  console.log((latest.content ?? '').slice(0, 3000));
})();
