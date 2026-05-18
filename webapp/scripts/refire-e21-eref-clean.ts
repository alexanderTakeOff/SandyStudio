// ──────────────────────────────────────────────────────────────────────────────
// scripts/refire-e21-eref-clean.ts
//
// Sprint φ smoke step 3 — re-fire EREF for E21 with the correct STB v05 asset id.
//
// Why this script exists:
//   The auto-chain (REV-world_check approve → EREF fire) passed the WCHK
//   asset id as `storyboardAssetId`, which made the EREF runner parse a
//   review document instead of a storyboard. Job FAILED at 08:17:53 with
//   "No episode reference assets inserted". This is a chain bug — for
//   correctness, the approve-asset handler should resolve the underlying
//   STB asset when chaining off a REV-* approval, not pass the REV id.
//
// What this script does:
//   1. Clear stale eref_pause_* metadata on episode + reset pilot_state
//      to "FRESH" so the runner doesn't read "already paused / awaiting
//      review".
//   2. Fire `sandystudio/exec-eref/generate-references` with the correct
//      STB v05 asset id (97a483b7-19b6-4bb0-b59b-6af6f095d768).
//
// Default DRY-RUN. Pass --write to apply.
// ──────────────────────────────────────────────────────────────────────────────

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

const EP = '21f7bd6a-f52c-4ae0-bd47-06ff328ec6e7';
const STB_V05 = '97a483b7-19b6-4bb0-b59b-6af6f095d768';
const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL ?? 'http://localhost:8288';

async function main() {
  const writeMode = process.argv.includes('--write');
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. Read current episode metadata
  const { data: ep } = await sb
    .from('episodes')
    .select('id,metadata')
    .eq('id', EP)
    .maybeSingle();
  const md = ((ep as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
  console.log('Current episode.metadata keys:', Object.keys(md));

  // Build clean metadata — drop all eref_* fields except total_shots (informational).
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(md)) {
    if (k === 'eref_total_shots') {
      clean[k] = 22; // v05 has 22 shots per WCHK report
      continue;
    }
    if (k.startsWith('eref_')) continue;
    clean[k] = v;
  }
  console.log('Cleaned metadata keys:', Object.keys(clean));

  // 2. Read current pilot_state app_config
  const { data: cfg } = await sb
    .from('app_config')
    .select('value')
    .eq('scope', 'app')
    .eq('key', `eref_pilot_state:${EP}`)
    .maybeSingle();
  console.log('Current pilot_state row:', JSON.stringify((cfg as { value?: unknown } | null)?.value));

  if (!writeMode) {
    console.log('\n--- DRY RUN ---');
    console.log('Would:');
    console.log(`  1. UPDATE episodes.metadata — drop eref_pause_*, eref_pilot_state, set eref_total_shots=22`);
    console.log(`  2. DELETE app_config eref_pilot_state:${EP}`);
    console.log(`  3. POST Inngest sandystudio/exec-eref/generate-references with storyboardAssetId=${STB_V05}`);
    console.log('Pass --write to apply.');
    return;
  }

  // 3. Apply clean metadata
  const { error: updErr } = await sb
    .from('episodes')
    .update({ metadata: clean } as never)
    .eq('id', EP);
  if (updErr) throw new Error(`metadata update failed: ${updErr.message}`);
  console.log('✓ episode.metadata cleaned');

  // 4. Delete app_config pilot_state row
  const { error: delErr } = await sb
    .from('app_config')
    .delete()
    .eq('scope', 'app')
    .eq('key', `eref_pilot_state:${EP}`);
  if (delErr) throw new Error(`pilot_state delete failed: ${delErr.message}`);
  console.log('✓ app_config eref_pilot_state deleted');

  // 5. Audit
  await sb.from('activity_events').insert({
    event_type: 'manual_trigger',
    severity: 'info',
    title: 'EREF re-fired for E21 v05 (φ smoke)',
    description:
      'Auto-chain passed wrong storyboardAssetId (REV-world_check instead of STB v05); fired manually with correct STB asset. Stale eref_pause_* metadata cleared.',
    actor: 'DIRECTOR',
    episode_id: EP,
    metadata: {
      route: 'one-off-script',
      sprint: 'phi-smoke',
      storyboardAssetId: STB_V05,
      previous_failed_job_error: 'No episode reference assets inserted',
    },
  } as never);
  console.log('✓ activity_event logged');

  // 6. Fire Inngest event
  const res = await fetch(`${INNGEST_DEV_URL}/e/devkey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'sandystudio/exec-eref/generate-references',
      data: { episodeId: EP, storyboardAssetId: STB_V05 },
    }),
  });
  console.log(`Inngest publish: HTTP ${res.status}`);
  console.log(await res.text());

  console.log('\nDone. EREF should start within ~1s.');
  console.log('Expected: 2 pilot shots first (~$0.08), then auto-fanout 20 more (~$1.0-1.2).');
}

main().catch((e) => { console.error(e); process.exit(1); });
