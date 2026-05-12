// ──────────────────────────────────────────────────────────────────────────────
// scripts/close-e01-legacy-pending.ts
// One-off Director-authorised cleanup: reject all non-APPROVED, non-LOCKED E01
// assets so they stop appearing in pending approvals.
//
// Built 2026-05-12 per Director's directive 10:10: "всё что у нас в ожидании
// висит там вот эти 19 позиций из старого эпизода е01... закрой эту тему чтобы
// она больше не поднималась сделай как-то в фоне".
//
// Scope:
//   - episode_id = SS-S14-E01 ("Perfume Vial", 4809684a-3740-4d20-85fa-b24d76340074)
//   - status IN (DRAFT, REVIEW, REVISION)
//   - → status = REJECTED
//
// Out of scope (preserved):
//   - APPROVED E01 assets (final-cut state preserved per q2 style cleanup)
//   - LOCKED E01 assets (terminal canon)
//   - REJECTED already (no-op)
//
// Safety:
//   - Dry-run by default. --commit needed.
//   - Idempotent: re-run after commit = no-op (targets already REJECTED).
//
// Usage:
//   npx tsx --env-file=.env.local scripts/close-e01-legacy-pending.ts          # dry-run
//   npx tsx --env-file=.env.local scripts/close-e01-legacy-pending.ts --commit # apply
// ──────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadDotenvOverride(filename: string): void {
  try {
    const text = readFileSync(resolve(process.cwd(), filename), 'utf-8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {/* ignore */}
}

loadDotenvOverride('.env.local');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SRK = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const commit = process.argv.includes('--commit');
console.log(`[close-e01] Mode: ${commit ? 'COMMIT' : 'DRY-RUN'}`);

const E01_EPISODE_ID = '4809684a-3740-4d20-85fa-b24d76340074';
const TARGET_STATUSES = ['DRAFT', 'REVIEW', 'REVISION'];

interface AssetRow {
  id: string;
  filename: string;
  status: string;
  file_type: string;
}

async function main(): Promise<void> {
  const sb = createClient(SUPABASE_URL, SUPABASE_SRK, { auth: { persistSession: false } });

  console.log(`\n[1/2] Reading E01 non-terminal assets…`);
  const { data: rows, error } = await sb
    .from('assets')
    .select('id, filename, status, file_type')
    .eq('episode_id', E01_EPISODE_ID)
    .in('status', TARGET_STATUSES);
  if (error) throw new Error(`read failed: ${error.message}`);
  const assets = (rows ?? []) as AssetRow[];

  if (assets.length === 0) {
    console.log('  No non-terminal E01 assets — nothing to do.');
    return;
  }

  // Group by status for readable output
  const byStatus: Record<string, AssetRow[]> = {};
  for (const a of assets) (byStatus[a.status] ??= []).push(a);
  for (const [s, list] of Object.entries(byStatus)) {
    console.log(`  ${s}: ${list.length} assets`);
    for (const a of list.slice(0, 3)) console.log(`    · ${a.filename}`);
    if (list.length > 3) console.log(`    · +${list.length - 3} more`);
  }
  console.log(`\n  Total to flip to REJECTED: ${assets.length}`);

  if (!commit) {
    console.log('\n[close-e01] DRY-RUN complete. Re-run with --commit to apply.');
    return;
  }

  console.log(`\n[2/2] Flipping to REJECTED…`);
  let done = 0;
  let failed = 0;
  for (const a of assets) {
    const { error: updErr } = await sb
      .from('assets')
      .update({ status: 'REJECTED' })
      .eq('id', a.id);
    if (updErr) {
      failed++;
      console.error(`  ✗ ${a.id} ${a.filename} — ${updErr.message}`);
      continue;
    }
    done++;
    if (done <= 5 || done % 10 === 0) {
      console.log(`  ✓ ${a.filename} [${a.status} → REJECTED]`);
    }

    await sb.from('activity_events').insert({
      event_type: 'asset_updated',
      severity: 'info',
      title: `E01 legacy asset rejected: ${a.filename}`,
      description: `Director-authorised E01 legacy cleanup 2026-05-12. Was [${a.status}]; flipped to REJECTED to remove from pending approvals. SS-S14-E01 is test/obsolete; this asset is not part of canonical final-cut.`,
      asset_id: a.id,
      episode_id: E01_EPISODE_ID,
      metadata: {
        kind: 'e01_legacy_cleanup',
        previous_status: a.status,
        script: 'scripts/close-e01-legacy-pending.ts',
      },
    } as never);
  }

  console.log(`\n[close-e01] COMMIT complete: ${done} rejected, ${failed} failed.`);
}

main().catch((err) => {
  console.error('[close-e01] FATAL:', err);
  process.exit(1);
});
