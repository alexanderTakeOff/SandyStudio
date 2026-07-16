// ──────────────────────────────────────────────────────────────────────────────
// scripts/smoke-state-matrix.ts
// Тир-A shadow dry-run (Фаза 1 + 2a). READ-ONLY, $0, zero mutation.
//
// Projects a real episode's state matrix and prints BOTH the human render and
// the actions the reconciler WOULD take — validating the brain on live data
// before any executor (Фаза 2b) is wired.
//
//   npx tsx --env-file=.env.local scripts/smoke-state-matrix.ts [episodeId]
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase/types.gen';
import {
  getEpisodeStateMatrix,
  renderStateMatrixMarkdown,
} from '../lib/agents/state-matrix';
import {
  planReconcileActions,
  collectCriticSignals,
  type ReconcileAction,
} from '../lib/agents/reconcile';
import { readProductionPlan } from '../lib/agents/production-plan';
import { planRegenCap, reconcileRecoveryCap } from '../lib/agents/chain-flags';

// E14 «Мадам Парфюм» — the almost-finished episode from the last run.
const DEFAULT_EPISODE = 'd2c0f1f6-fc2a-483e-a482-459bb8de13fd';

async function main() {
  const episodeId = process.argv[2] ?? DEFAULT_EPISODE;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient<Database>(url, key);

  // Episode header (for the raw production_plan + a sanity code print).
  const { data: epRow } = await supabase
    .from('episodes')
    .select('episode_code,metadata')
    .eq('id', episodeId)
    .maybeSingle();
  const epCode = (epRow as { episode_code?: string } | null)?.episode_code ?? '(unknown)';
  const plan = readProductionPlan((epRow as { metadata?: unknown } | null)?.metadata);

  // 1) Project + render the matrix.
  const matrix = await getEpisodeStateMatrix(supabase, episodeId);
  console.log(`\n=== STATE MATRIX — ${epCode} (${episodeId}) ===\n`);
  console.log(renderStateMatrixMarkdown(matrix));

  // 2) Critic signals from the REV-* rows.
  const { data: revRows } = await supabase
    .from('assets')
    .select('file_type,version,metadata')
    .eq('episode_id', episodeId)
    .like('file_type', 'REV-%');
  const { verdicts, reviseCounts } = collectCriticSignals(
    (revRows ?? []) as Array<{ file_type?: string | null; version?: number | null; metadata?: unknown }>,
  );

  // 3) What would the reconciler do? (No reserved pilots known in a shadow run.)
  const actions = planReconcileActions({
    matrix,
    plan,
    verdicts,
    reviseCounts,
    refireCounts: new Map<string, number>(), // shadow run: no historical refire counts
    reservedShots: new Set<string>(),
    criticCap: planRegenCap(),
    recoveryCap: reconcileRecoveryCap(),
    governanceMode: matrix.governance_mode == null ? null : Number(matrix.governance_mode),
  });

  console.log(`\n=== RECONCILER DECISIONS (${actions.length}) ===\n`);
  console.log(`production_plan: ${plan ? 'present' : 'ABSENT (every shot treated in-plan)'}`);
  console.log(`music: ${matrix.music.status ?? 'none'} · final_cut: ${matrix.final_cut.status ?? 'none'}\n`);
  const summary = actions.reduce<Record<string, number>>((acc, a) => {
    acc[a.kind] = (acc[a.kind] ?? 0) + 1;
    return acc;
  }, {});
  console.log('by kind:', JSON.stringify(summary));
  for (const a of actions) console.log('  ·', renderAction(a));

  // 4) Idempotency probe — same inputs → identical decision set.
  const again = planReconcileActions({
    matrix,
    plan,
    verdicts,
    reviseCounts,
    refireCounts: new Map<string, number>(), // shadow run: no historical refire counts
    reservedShots: new Set<string>(),
    criticCap: planRegenCap(),
    recoveryCap: reconcileRecoveryCap(),
    governanceMode: matrix.governance_mode == null ? null : Number(matrix.governance_mode),
  });
  const stable = JSON.stringify(again) === JSON.stringify(actions);
  console.log(`\nidempotent (re-run identical): ${stable ? 'YES' : 'NO — INVESTIGATE'}`);
  console.log('\n(READ-ONLY — no mutations performed.)');
}

function renderAction(a: ReconcileAction): string {
  switch (a.kind) {
    case 'approve':
      return `approve ${a.shotId}/${a.stage} (${a.assetId}) — ${a.reason}`;
    case 'stitch':
      return `stitch — ${a.reason}`;
    case 'halt':
      return `HALT ${a.shotId}/${a.stage} — ${a.reason}`;
    case 'refire':
      return `refire ${a.shotId}/${a.stage}${a.assetId ? ` (${a.assetId})` : ''} — ${a.reason}`;
    case 'wait':
      return `wait ${a.shotId ?? '·'}/${a.stage ?? '·'} — ${a.reason}`;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
