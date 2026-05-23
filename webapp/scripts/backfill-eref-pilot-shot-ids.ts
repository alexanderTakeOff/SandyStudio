// One-off backfill for SS-S15-E01: write episode.metadata.eref_pilot_shot_ids
// so the EREFPilotPillbar UI counter activates ("2/2 pilot shots approved")
// and the "Approve Direction & Fan Out" button becomes clickable. Future
// episodes will get this automatically via the approve/route.ts Day 3.2 branch
// fix landed in this same session.
//
// TD-23 / TD-24 follow-up — 2026-05-20

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

const APPLY = process.argv.includes('--apply');
const EPISODE_ID = 'f019c29f-5e1e-4964-b62b-6c59fc3aa966';
const PILOT_SHOT_IDS = ['SS-S15-E01-A1-SC01-SH01', 'SS-S15-E01-A1-SC01-SH02'];

(async () => {
  const { data: ep, error } = await sb
    .from('episodes')
    .select('id,episode_code,metadata')
    .eq('id', EPISODE_ID)
    .maybeSingle();
  if (error) throw error;
  if (!ep) {
    console.error('Episode not found');
    process.exit(1);
  }

  const meta = ((ep as { metadata?: unknown }).metadata as Record<string, unknown> | null) ?? {};
  console.log(`Episode ${EPISODE_ID} (${(ep as { episode_code?: string }).episode_code})`);
  console.log(`  current eref_pilot_shot_ids: ${JSON.stringify(meta.eref_pilot_shot_ids ?? null)}`);
  console.log(`  current designer_pilot_count: ${meta.designer_pilot_count}`);

  const next = { ...meta, eref_pilot_shot_ids: PILOT_SHOT_IDS };
  console.log(`\n  [${APPLY ? 'APPLY' : 'DRY'}] writing eref_pilot_shot_ids: ${JSON.stringify(PILOT_SHOT_IDS)}`);

  if (!APPLY) {
    console.log('\n  🟡 DRY RUN — re-run with --apply.');
    process.exit(0);
  }

  const { error: updErr } = await sb.from('episodes').update({ metadata: next as never }).eq('id', EPISODE_ID);
  if (updErr) throw updErr;

  await sb.from('activity_events').insert({
    event_type: 'asset_updated',
    severity: 'info',
    title: 'Backfill eref_pilot_shot_ids',
    description: 'TD-23/TD-24 follow-up: mirror Track-A pilot shotIds so EREFPilotPillbar counter activates and Approve+Fan Out button becomes clickable. Future episodes get this automatically.',
    actor: 'DIRECTOR',
    episode_id: EPISODE_ID,
    metadata: {
      previous_eref_pilot_shot_ids: meta.eref_pilot_shot_ids ?? null,
      new_eref_pilot_shot_ids: PILOT_SHOT_IDS,
      script: 'backfill-eref-pilot-shot-ids.ts',
    } as never,
  });

  console.log('  🟢 metadata updated + audit row inserted.');
  process.exit(0);
})().catch((err) => {
  console.error('💥 Backfill failed:', err);
  process.exit(1);
});
