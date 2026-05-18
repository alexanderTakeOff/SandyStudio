// σ.1 γ-validation — flip E21 STB v02 → REVISION with a note that
// references the ACTIVE SKILLS contract, persist approval + activity_event,
// then fire the Storyboarder Inngest event so v03 re-runs through the new
// load-skills path. The note itself is brief — the heavy lifting (comedy
// microcycle, per-shot prose checklist) lives in the two seed skills the
// selector will inject automatically.
import { createClient } from '@supabase/supabase-js';
import { Inngest } from 'inngest';
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

const STB_V02 = '24849acb-3961-4c62-93b4-df81dc8e48a7';
const EP = '21f7bd6a-f52c-4ae0-bd47-06ff328ec6e7';
const NOTE = [
  'σ.1 γ-validation of ACTIVE SKILLS injection into Storyboard Artist.',
  '',
  'Two Director-canon skills are now ACTIVE for this run:',
  '  1. comedy-shot-must-carry-gag (genre: comedy, HARD)',
  '  2. storyboarder-prose-gag-per-shot (agent: EXEC-SB, HARD)',
  '',
  'STB v02 still produced mundane action prose on the bicep-rack opener',
  '(e.g. SH02 reads as "rolls his arms, marches to the dumbbell rack").',
  'Per the Director canon, EVERY non-transition shot MUST be a',
  'try → fail → escalation → punchline microcycle. Action description is',
  'an anti-pattern.',
  '',
  'Required acceptance criteria for STB v03:',
  '  - SH02 (or the equivalent bicep-rack opener) reads as a discrete',
  '    physical-cascade beat, not a "marches to rack" choreography.',
  '  - At least 5 non-transition shots show a visible verb chain with',
  '    try → fail → escalation OR setup → payoff structure.',
  '  - action_prose paragraphs answer "where is the joke?" — strip',
  '    feeling words, lean into prop physics.',
  '  - The three SREV minors already in v02 (pull-up in §4, jump-rope',
  '    tangle in §5, water-bottle topple in §7) STAY — do not regress',
  '    propagation.',
  '',
  'Apply the two ACTIVE SKILLS from the prompt header. They appear in',
  'this run\'s user message at the top — read them carefully before',
  'writing each action_prose paragraph.',
].join('\n');

(async () => {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // 1. flip STB v02 → REVISION + persist revision_log
  const { error: u1 } = await sb
    .from('assets')
    .update({ status: 'REVISION', revision_log: NOTE } as never)
    .eq('id', STB_V02);
  if (u1) throw new Error(`STB status flip failed: ${u1.message}`);
  console.log('✓ STB v02 → REVISION + revision_log set');

  // 2. approvals row (canonical store for downstream-notes propagation)
  const { error: aerr } = await sb.from('approvals').insert({
    asset_id: STB_V02,
    episode_id: EP,
    approved_by: 'DIRECTOR',
    approval_type: 'REQUEST_REVISION',
    notes: NOTE,
  } as never);
  if (aerr) throw new Error(`approval insert failed: ${aerr.message}`);
  console.log('✓ approvals row inserted (REQUEST_REVISION)');

  // 3. activity_event for audit + Realtime push
  await sb.from('activity_events').insert({
    event_type: 'approval_revision',
    severity: 'info',
    title: 'σ.1 γ-validation REQUEST_REVISION on STB v02',
    description: '[claude-cli · σ.1 validation] ' + NOTE.slice(0, 1200),
    actor: 'claude-cli',
    asset_id: STB_V02,
    episode_id: EP,
    metadata: { decision: 'REQUEST_REVISION', file_type: 'STB-storyboard', sprint: 'σ.1' },
  } as never);
  console.log('✓ activity_event logged');

  // 4. fire Inngest event
  const inngest = new Inngest({ id: 'sandystudio', eventKey: process.env.INNGEST_EVENT_KEY ?? 'local' });
  const r = await inngest.send({
    name: 'sandystudio/exec-sb/create-storyboard',
    data: { episodeId: EP },
  });
  console.log('✓ Inngest fired:', JSON.stringify(r));

  console.log('\nNext: poll for STB v03 with `npx tsx scripts/probe-e21-stb-state.ts`');
})();
