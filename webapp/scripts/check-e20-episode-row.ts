// Verify which E20 episode row actually exists — earlier check returned null
// for explicit id lookup even though FK-joined assets/jobs are there.
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[line.slice(0, eq).trim()] = val;
  }
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const EP_ID = '763c5c1e-44dc-4e10-92fb-e7671e5d4a44';

async function main() {
  const { data: byId, error: err1 } = await sb
    .from('episodes')
    .select('*')
    .eq('id', EP_ID);
  console.log('by id (raw select):', { rows: byId?.length ?? 0, error: err1 });
  if (byId?.[0]) console.log(JSON.stringify(byId[0], null, 2));

  const { data: byCode, error: err2 } = await sb
    .from('episodes')
    .select('id,code,title,status,updated_at')
    .or('code.eq.SS-S14-E20,code.eq.E20')
    .limit(5);
  console.log('\nby code lookup:', { error: err2 });
  for (const e of byCode ?? []) {
    console.log(`  ${e.id} | ${e.code} | ${e.title} | ${e.status}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
