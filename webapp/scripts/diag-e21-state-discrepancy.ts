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
  const { data: epRow } = await sb.from('episodes').select('metadata').eq('id', EP).maybeSingle();
  const { data: cfgRow } = await sb.from('app_config').select('value').eq('scope', 'app').eq('key', `eref_pilot_state:${EP}`).maybeSingle();

  console.log('=== State mismatch check ===\n');
  console.log('episode.metadata.eref_pilot_state:');
  console.log(JSON.stringify((epRow as any)?.metadata?.eref_pilot_state, null, 2));
  console.log('\napp_config eref_pilot_state:');
  console.log(JSON.stringify((cfgRow as any)?.value?.state, null, 2));

  const epState = (epRow as any)?.metadata?.eref_pilot_state;
  const cfgState = (cfgRow as any)?.value?.state;
  if (epState !== cfgState) {
    console.log(`\nWARNING: State mismatch! episode=${epState}, config=${cfgState}`);
  }

  // Check when states were updated
  console.log('\neref_pilot_state_at:', (epRow as any)?.metadata?.eref_pilot_state_at);
  console.log('app_config.value.at:', (cfgRow as any)?.value?.at);
})();
