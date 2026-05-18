// Mirror server-side eref_pilot_state into episode.metadata so the UI
// EREFPilotPillbar reads PENDING_REVIEW and shows "Approve Direction &
// Fan Out" button instead of stale "Advance to Animatic".
//
// Root cause: refire-e21-eref-clean.ts (earlier today) cleared all eref_*
// keys from episode.metadata to unblock the fresh re-run; EREF runner sets
// only the app_config.eref_pilot_state row when pilot pass completes,
// never re-mirrors into episode.metadata. So UI lost the signal.
//
// Backlog fix: EREF runner should mirror pilot_state → episode.metadata
// after every state transition (PENDING_REVIEW, FANOUT_RUNNING, COMPLETE).
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
  const writeMode = process.argv.includes('--write');

  // Read both sources
  const { data: cfg } = await sb
    .from('app_config')
    .select('value')
    .eq('scope', 'app')
    .eq('key', `eref_pilot_state:${EP}`)
    .maybeSingle();
  const cfgState = (cfg as { value?: { state?: string } } | null)?.value?.state;
  console.log(`app_config pilot_state: ${cfgState}`);

  const { data: ep } = await sb
    .from('episodes')
    .select('metadata')
    .eq('id', EP)
    .maybeSingle();
  const md = ((ep as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
  console.log(`episode.metadata.eref_pilot_state: ${md.eref_pilot_state ?? '(missing)'}`);
  console.log(`current metadata keys: [${Object.keys(md).join(', ')}]`);

  if (!cfgState) {
    console.log('No server-side pilot_state to mirror. Abort.');
    return;
  }

  // Discover pilot shot_ids from the 2 approved EREF assets
  const { data: pilotAssets } = await sb
    .from('assets')
    .select('metadata')
    .eq('episode_id', EP)
    .eq('status', 'APPROVED')
    .like('file_type', 'IMG-episode_ref%');
  const pilotShotIds: string[] = [];
  for (const a of pilotAssets ?? []) {
    const sid = ((a as { metadata?: { shot_reference?: { shot_id?: string } } } | null)?.metadata?.shot_reference?.shot_id);
    if (typeof sid === 'string' && !pilotShotIds.includes(sid)) pilotShotIds.push(sid);
  }

  const nextMeta = {
    ...md,
    eref_pilot_state: cfgState,
    eref_pilot_state_at: new Date().toISOString(),
    eref_pilot_count: pilotShotIds.length || 2,
    eref_pilot_shot_ids: pilotShotIds,
  };

  console.log('\nNext metadata patch:');
  console.log(JSON.stringify(nextMeta, null, 2));

  if (!writeMode) {
    console.log('\n--- DRY RUN — pass --write to apply ---');
    return;
  }

  const { error } = await sb.from('episodes').update({ metadata: nextMeta as never }).eq('id', EP);
  if (error) throw new Error(`update failed: ${error.message}`);
  console.log('✓ episode.metadata patched. EREFPilotPillbar should now show "Approve Direction & Fan Out" after page reload.');
})();
