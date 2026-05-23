// One-off cleanup: remove shotIds that Polina already manually triggered
// (SH03 + SH04) from episode.metadata.designer_fanout_pending so the
// "Approve Direction & Fan Out" button doesn't fire them again.
//
// 2026-05-20 — Theo

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

(async () => {
  const { data: ep } = await sb
    .from('episodes')
    .select('id,metadata')
    .eq('id', EPISODE_ID)
    .maybeSingle();
  if (!ep) { console.error('Episode not found'); process.exit(1); }

  const meta = ((ep as { metadata?: unknown }).metadata as Record<string, unknown> | null) ?? {};
  const pending = (meta.designer_fanout_pending as string[] | undefined) ?? [];

  // Read which Plan assets already exist for this episode (any status, excluding INVALIDATED)
  const { data: plans } = await sb
    .from('assets')
    .select('content')
    .eq('episode_id', EPISODE_ID)
    .like('file_type', 'SPC-ref_plan%')
    .neq('status', 'INVALIDATED');

  const alreadyHandled = new Set<string>();
  for (const row of plans ?? []) {
    const content = (row as { content?: string }).content ?? '';
    const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
    const last = matches[matches.length - 1]?.[1];
    if (!last) continue;
    try {
      const body = JSON.parse(last.trim()) as { shot_id?: unknown };
      if (typeof body.shot_id === 'string') alreadyHandled.add(body.shot_id);
    } catch { /* skip malformed */ }
  }

  console.log(`Episode ${EPISODE_ID}`);
  console.log(`  current pending count: ${pending.length}`);
  console.log(`  Plan assets already covering shotIds (${alreadyHandled.size}):`);
  for (const sid of alreadyHandled) console.log(`    - ${sid}`);

  const cleanPending = pending.filter((sid) => !alreadyHandled.has(sid));
  console.log(`\n  cleaned pending count: ${cleanPending.length}`);
  console.log(`  removing ${pending.length - cleanPending.length} duplicates`);
  console.log(`\n  [${APPLY ? 'APPLY' : 'DRY'}] new designer_fanout_pending:`);
  for (const sid of cleanPending) console.log(`    - ${sid}`);

  if (!APPLY) { console.log('\n  🟡 DRY RUN — re-run with --apply.'); process.exit(0); }

  const nextMeta = { ...meta, designer_fanout_pending: cleanPending };
  await sb.from('episodes').update({ metadata: nextMeta as never }).eq('id', EPISODE_ID);

  await sb.from('activity_events').insert({
    event_type: 'asset_updated',
    severity: 'info',
    title: 'Cleanup designer_fanout_pending',
    description: `Removed ${pending.length - cleanPending.length} shotIds that already have a non-INVALIDATED Plan asset (Polina manually triggered them before the approve-pilots route fix landed). Prevents duplicate dispatch when Director clicks the Fan-Out button.`,
    actor: 'DIRECTOR',
    episode_id: EPISODE_ID,
    metadata: {
      removed_shot_ids: pending.filter((sid) => alreadyHandled.has(sid)),
      remaining_count: cleanPending.length,
      script: 'remove-from-fanout-pending.ts',
    } as never,
  });

  console.log('  🟢 pending list cleaned + audit row inserted.');
  process.exit(0);
})().catch((err) => { console.error('💥 Cleanup failed:', err); process.exit(1); });
