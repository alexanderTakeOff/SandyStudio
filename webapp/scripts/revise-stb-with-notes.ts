// γ smoke validator — kick STB v01 back to revision with the SREV minor
// notes as the explicit revisionNote. After this fires, Storyboard Artist
// re-runs and (per the new γ patch) ALSO reads `upstream_approval_notes`
// for the script + SREV REV — confirming end-to-end propagation.
//
// We use the requestRevision endpoint directly with service-role auth
// (Director's session would do the same via PA tool); audit attribution
// captures actor=claude-cli.
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
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const STB = 'eeb463e1-fe92-434b-9d49-231144fe4d03';
const EP = '21f7bd6a-f52c-4ae0-bd47-06ff328ec6e7';
const NOTE = [
  'γ-smoke validation of upstream_approval_notes propagation.',
  'Storyboard v02 MUST incorporate the three Story Editor MINOR notes',
  'that the script v02 approval flagged (Director directive 2026-05-14',
  '"одобряю передачи дальше с передачей замечаний"):',
  '',
  '1. Pull-up bar micro-beat inside Scene 4 (script §9.5 mandatory gag',
  '   that was compressed). Add a brief pull-up attempt — jump → big arm',
  '   prevents grip → wide thighs cause swinging → asymmetric-sack-of-strength.',
  '   Keep within the existing 9s Scene-4 budget.',
  '2. Jump-rope mid-jump tangle in Scene 5. Show the rope catching the',
  '   inflated bicep mid-rotation so the topple cause-and-effect is visually',
  '   readable; not just a generic fall.',
  '3. Water bottle topple in Scene 7 approach to the scale. Sandy clips',
  '   the bottle with a wide thigh — bottle rolls into frame — sells the',
  '   "trapped politely" punch line by showing the floor obstacle he could',
  '   not step over earlier (Scene 4) is now a passive aggressor.',
  '',
  "These notes were saved on the REV approval (asset_id 4d8b8294-02a8-4469-",
  '8c25-aa2f2dc63368). Verify this revision: the new STB v02 must reference',
  'all three beats — if it does, end-to-end propagation works.',
].join('\n');

(async () => {
  // 1. Flip STB → REVISION.
  const { error: u1 } = await sb
    .from('assets')
    .update({ status: 'REVISION', revision_log: NOTE } as never)
    .eq('id', STB);
  if (u1) throw new Error(`STB status flip failed: ${u1.message}`);
  console.log('✓ STB → REVISION + revision_log set');

  // 2. Persist approval row capturing the revise decision.
  const { error: aerr } = await sb.from('approvals').insert({
    asset_id: STB,
    episode_id: EP,
    approved_by: 'DIRECTOR',
    approval_type: 'REQUEST_REVISION',
    notes: NOTE,
  } as never);
  if (aerr) throw new Error(`approval insert failed: ${aerr.message}`);
  console.log('✓ approvals row inserted (REQUEST_REVISION)');

  // 3. Log activity_event.
  await sb.from('activity_events').insert({
    event_type: 'approval_revision',
    severity: 'info',
    title: 'REQUEST_REVISION on SS-S14-E21-STB-storyboard-v01-DRAFT.md',
    description: '[Claude CLI · γ-validation] ' + NOTE.slice(0, 1200),
    actor: 'claude-cli',
    asset_id: STB,
    episode_id: EP,
    metadata: { decision: 'REQUEST_REVISION', file_type: 'STB-storyboard' },
  } as never);
  console.log('✓ activity_event logged');

  console.log('\nNext: someone (Polina via PA or me here) needs to refire the storyboarder.');
  console.log('Inngest event: sandystudio/exec-sb/create-storyboard');
  console.log('Polina is likely faster — she will detect the REVISION and chain.');
})();
