// One-off (2026-05-13): trim E20 animatic shot_list to remove the 2 SC11
// punchline shots that hit Veo quota and could not be generated. Closes
// E20 as 17/19 partial so STITCH can produce a final-cut mp4.
// Director directive: "ждать бесполезно".

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
const EP = '763c5c1e-44dc-4e10-92fb-e7671e5d4a44';
const INNGEST = process.env.INNGEST_DEV_URL ?? 'http://localhost:8288';
const SHOTS_TO_REMOVE = new Set([
  'SS-S14-E20-A3-SC11-SH01',
  'SS-S14-E20-A3-SC11-SH02',
]);

async function main() {
  const write = process.argv.includes('--write');

  const { data: animatic, error } = await sb
    .from('assets')
    .select('id,filename,status,metadata,version')
    .eq('episode_id', EP)
    .eq('file_type', 'VID-animatic')
    .eq('status', 'APPROVED')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('animatic fetch:', error.message);
    process.exit(2);
  }
  if (!animatic) {
    console.error('No APPROVED VID-animatic for E20.');
    process.exit(2);
  }

  const meta = animatic.metadata as Record<string, unknown>;
  const v1raw = meta.animatic_v1 as { shot_list?: Array<{ shot_id: string; duration_seconds: number }>; total_duration_s?: number; [k: string]: unknown } | undefined;
  if (!v1raw || !Array.isArray(v1raw.shot_list)) {
    console.error('animatic.metadata.animatic_v1.shot_list missing — abort.');
    process.exit(2);
  }
  const before = v1raw.shot_list;
  const after = before.filter((s) => !SHOTS_TO_REMOVE.has(s.shot_id));
  const removed = before.filter((s) => SHOTS_TO_REMOVE.has(s.shot_id));
  console.log(`Animatic asset ${animatic.id} (${animatic.filename})`);
  console.log(`  Before: ${before.length} shots`);
  console.log(`  Remove: ${removed.length} (${removed.map((s) => `${s.shot_id} ${s.duration_seconds}s`).join(', ')})`);
  console.log(`  After:  ${after.length} shots`);

  if (after.length === before.length) {
    console.log('No-op — target shots not in shot_list. Maybe already trimmed.');
    return;
  }

  const removedDuration = removed.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  const oldTotal = typeof v1raw.total_duration_s === 'number' ? v1raw.total_duration_s : before.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  const newTotal = oldTotal - removedDuration;
  console.log(`  total_duration_s: ${oldTotal} → ${newTotal}`);

  if (!write) {
    console.log('\n--- DRY RUN — pass --write to apply ---');
    return;
  }

  const newV1 = { ...v1raw, shot_list: after, total_duration_s: newTotal };
  const newMeta = { ...meta, animatic_v1: newV1 };
  const { error: upErr } = await sb
    .from('assets')
    .update({ metadata: newMeta as never })
    .eq('id', animatic.id);
  if (upErr) {
    console.error('update err:', upErr.message);
    process.exit(2);
  }
  console.log('animatic metadata updated.');

  await sb.from('activity_events').insert({
    event_type: 'asset_updated',
    severity: 'warning',
    title: `E20 animatic trimmed: ${removed.map((s) => s.shot_id).join(', ')} removed`,
    description: `Director-approved partial close (2026-05-13): Veo quota prevented SC11 punchline generation. Episode now 17/17 — STITCH can assemble final-cut. Total duration ${oldTotal}s → ${newTotal}s.`,
    actor: 'DIRECTOR',
    episode_id: EP,
    asset_id: animatic.id,
    metadata: {
      kind: 'animatic_trim',
      shots_removed: removed.map((s) => s.shot_id),
      duration_removed_s: removedDuration,
      old_total_s: oldTotal,
      new_total_s: newTotal,
    },
  } as never);

  // Fire STITCH event (approve route's auto-fire condition is now met but the
  // last VID-shot approval already passed — we can request stitching manually).
  const res = await fetch(`${INNGEST}/e/devkey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'sandystudio/exec-stitch/assemble-episode',
      data: { episodeId: EP },
    }),
  });
  console.log(`STITCH event fire: HTTP ${res.status}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
