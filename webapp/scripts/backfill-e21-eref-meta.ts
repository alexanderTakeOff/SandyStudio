// Backfill E21 episodes.metadata so EREFPilotPillbar shows accurate
// PilotHeadline. Director hasn't fired approve-pilots flow yet (Polina used
// the legacy triggerAgent path). This backfill just fills the metadata
// fields the new UI reads — does NOT fire any fan-out.
//
// Sets:
//   eref_pilot_state    = PENDING_REVIEW  (mirrors app_config)
//   eref_total_shots    = 24              (parsed from APPROVED STB v04)
//   eref_pilot_count    = 2
//   eref_pilot_shot_ids = [SH01-id, SH02-id]  (extracted from existing EREF assets)
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
  // 1. Parse storyboard for total shots
  const { data: stb } = await sb.from('assets').select('content').eq('episode_id', EP).like('file_type', 'STB-storyboard%').eq('status', 'APPROVED').order('version', { ascending: false }).limit(1).maybeSingle();
  const stbContent = (stb as { content?: string } | null)?.content ?? '';
  const m = /```json\s*([\s\S]*?)```/i.exec(stbContent);
  let totalShots: number | null = null;
  if (m && m[1]) {
    try {
      const body = JSON.parse(m[1]) as { acts?: Array<{ shots?: unknown[] }> };
      if (Array.isArray(body.acts)) {
        totalShots = body.acts.reduce((s, a) => s + (Array.isArray(a.shots) ? a.shots.length : 0), 0);
      }
    } catch { /* */ }
  }
  if (!totalShots || totalShots <= 0) {
    throw new Error('Could not parse storyboard shot count');
  }
  console.log(`parsed total shots from APPROVED STB: ${totalShots}`);

  // 2. Distinct pilot shot_ids from existing EREF assets (they ARE the pilots)
  const { data: refs } = await sb.from('assets').select('metadata').eq('episode_id', EP).like('file_type', 'IMG-episode_ref%');
  const pilotShotIds = Array.from(new Set(
    (refs ?? [])
      .map((r) => ((r.metadata as { shot_reference?: { shot_id?: string } } | null)?.shot_reference?.shot_id))
      .filter((x): x is string => typeof x === 'string'),
  ));
  console.log(`pilot shot_ids: ${pilotShotIds.join(', ')}`);

  // 3. Merge into episodes.metadata
  const { data: epRow } = await sb.from('episodes').select('metadata').eq('id', EP).maybeSingle();
  const prevMeta = ((epRow as { metadata?: unknown } | null)?.metadata as Record<string, unknown> | null) ?? {};
  const nextMeta = {
    ...prevMeta,
    eref_pilot_state: 'PENDING_REVIEW' as const,
    eref_pilot_state_at: new Date().toISOString(),
    eref_total_shots: totalShots,
    eref_pilot_count: pilotShotIds.length,
    eref_pilot_shot_ids: pilotShotIds,
    eref_backfill_at: new Date().toISOString(),
    eref_backfill_note: 'Sprint τ — UI metadata backfill so PilotHeadline shows 1/2 + total 24',
  };
  const { error } = await sb.from('episodes').update({ metadata: nextMeta as never }).eq('id', EP);
  if (error) throw new Error(`update failed: ${error.message}`);
  console.log('\n✓ episode.metadata patched:', JSON.stringify(nextMeta, null, 2));
  console.log('\nDirector: open /episodes/SS-S14-E21 — EREFPilotPillbar should now read');
  console.log('"Pilot 1/2 pilot shots approved · 24 total in episode" with Approve Direction button');
  console.log('disabled until SH01 v3 is APPROVED.');
})();
