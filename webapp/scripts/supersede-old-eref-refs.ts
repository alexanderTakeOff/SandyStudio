// Mark all E21 EREF refs created before STB v05 approval as REJECTED with
// metadata note pointing at the version change. This unblocks fresh EREF
// generation and matches Director's "reset statuses after re-trigger" model.
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
const STB_V05_APPROVED_AT = '2026-05-16T08:11:18';

(async () => {
  const writeMode = process.argv.includes('--write');

  const { data: assets } = await sb
    .from('assets')
    .select('id,filename,status,created_at,metadata')
    .eq('episode_id', EP)
    .like('file_type', 'IMG-episode_ref%')
    .lt('created_at', STB_V05_APPROVED_AT);
  if (!assets || assets.length === 0) {
    console.log('No old EREF refs to supersede.');
    return;
  }
  console.log(`Found ${assets.length} old EREF refs to mark REJECTED (superseded by STB v05).`);
  for (const a of assets) {
    console.log(`  - ${a.created_at?.slice(11, 19)} [${(a.status as string).padEnd(8)}] ${(a.filename as string).slice(0, 80)}`);
  }

  if (!writeMode) {
    console.log('\n--- DRY RUN ---');
    console.log('Would UPDATE assets SET status=REJECTED, metadata += { superseded_by_stb_version: 5, superseded_at: <now> } for the above.');
    console.log('Pass --write to apply.');
    return;
  }

  const supersededAt = new Date().toISOString();
  let n = 0;
  for (const a of assets) {
    const md = ((a as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
    const nextMd = {
      ...md,
      superseded_by_stb_version: 5,
      superseded_at: supersededAt,
      superseded_reason: 'STB v05 has new shot structure (22 shots, re-numbered scene groupings); v04-era refs no longer canonical',
      prior_status: a.status,
    };
    const { error } = await sb
      .from('assets')
      .update({ status: 'REJECTED', metadata: nextMd } as never)
      .eq('id', a.id);
    if (error) {
      console.error(`  FAIL ${a.id}: ${error.message}`);
      continue;
    }
    n++;
  }
  console.log(`\n✓ ${n}/${assets.length} refs flipped to REJECTED.`);

  await sb.from('activity_events').insert({
    event_type: 'manual_trigger',
    severity: 'info',
    title: `E21 EREF refs superseded by STB v05 (${n} refs → REJECTED)`,
    description:
      'Bulk supersede — old v04-era EREF refs marked REJECTED with metadata note. Unblocks fresh EREF generation from v05.',
    actor: 'DIRECTOR',
    episode_id: EP,
    metadata: {
      route: 'one-off-script',
      sprint: 'phi-smoke',
      count: n,
      stb_version: 5,
      stb_asset_id: '97a483b7-19b6-4bb0-b59b-6af6f095d768',
    },
  } as never);
  console.log('✓ activity_event logged');
})();
