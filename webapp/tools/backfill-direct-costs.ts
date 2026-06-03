// ──────────────────────────────────────────────────────────────────────────────
// tools/backfill-direct-costs.ts
//
// ONE-TIME, APPROXIMATE backfill of historical direct-spend (manual rerolls +
// Bible image gen) into budget_log. Before the 2026-06-03 cost-accounting fix
// (5a16261), only the automated pipeline recorded costs — every Director reroll
// spent real money that landed in asset metadata (image_prompt.history /
// generation_history) but never in budget_log, so the expenses tab under-reported.
//
// This sweeps that asset-metadata cost, sums it per episode (+ a series-level
// bucket for episode-less Bible assets), and writes ONE summary row per bucket
// via recordCost(operation='backfill_historical'). It is deliberately coarse —
// Director asked for "very approx". A guard refuses to run twice.
//
//   npm run backfill-direct-costs            # dry-run: prints what it WOULD add
//   npm run backfill-direct-costs -- --apply # actually write the rows
//
// Read-only unless --apply. Lives under tools/ (not scripts/) per the naming hook.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { recordCost } from '@/lib/budget';

const BACKFILL_OPERATION = 'backfill_historical';
const ASSET_PAGE = 5000;

function sumHistoryCost(metadata: unknown): number {
  const m = (metadata ?? {}) as {
    image_prompt?: { history?: Array<{ cost_usd?: unknown }> };
    shot_reference?: { generation_history?: Array<{ cost_usd?: unknown }> };
  };
  let sum = 0;
  for (const h of m.image_prompt?.history ?? []) {
    const c = Number(h.cost_usd ?? 0);
    if (c > 0) sum += c;
  }
  for (const g of m.shot_reference?.generation_history ?? []) {
    const c = Number(g.cost_usd ?? 0);
    if (c > 0) sum += c;
  }
  return sum;
}

async function main(): Promise<void> {
  const apply = process.argv.slice(2).includes('--apply');
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ── Idempotency guard — refuse to double-backfill ──────────────────────────
  const { count: existing } = await sb
    .from('budget_log')
    .select('id', { count: 'exact', head: true })
    .eq('operation', BACKFILL_OPERATION);
  if ((existing ?? 0) > 0) {
    console.log(
      `\n  Backfill already present (${existing} ${BACKFILL_OPERATION} rows). Refusing to run again.\n`,
    );
    return;
  }

  // ── Sweep asset-metadata cost, bucket by episode_id (null = series Bible) ──
  const { data: assets, error } = await sb
    .from('assets')
    .select('episode_id,metadata')
    .not('metadata', 'is', null)
    .limit(ASSET_PAGE);
  if (error) {
    throw new Error(`asset scan failed: ${error.message}`);
  }
  const byEpisode = new Map<string | null, number>();
  for (const a of (assets ?? []) as Array<{ episode_id: string | null; metadata: unknown }>) {
    const c = sumHistoryCost(a.metadata);
    if (c <= 0) continue;
    const key = a.episode_id ?? null;
    byEpisode.set(key, (byEpisode.get(key) ?? 0) + c);
  }

  const buckets = [...byEpisode.entries()].sort((x, y) => y[1] - x[1]);
  const total = buckets.reduce((s, [, v]) => s + v, 0);

  console.log(`\n  BACKFILL — historical direct-spend (asset metadata → budget_log)`);
  console.log(`  ${apply ? 'APPLYING' : 'DRY-RUN (pass --apply to write)'}`);
  console.log(`  ${'─'.repeat(52)}`);
  for (const [ep, sum] of buckets) {
    console.log(`    ${(ep ?? 'series-bible (no episode)').padEnd(40)} $${sum.toFixed(2)}`);
  }
  console.log(`  ${'─'.repeat(52)}`);
  console.log(`    ${'TOTAL'.padEnd(40)} $${total.toFixed(2)}  across ${buckets.length} buckets`);

  if (!apply) {
    console.log(`\n  Dry-run only. Re-run with --apply to write these summary rows.\n`);
    return;
  }

  let written = 0;
  for (const [ep, sum] of buckets) {
    try {
      await recordCost(sb, {
        jobId: null,
        episodeId: ep,
        agentId: 'EXEC-EREF',
        costUsd: Number(sum.toFixed(4)),
        apiProvider: 'backfill',
        modelOrTier: 'historical',
        operation: BACKFILL_OPERATION,
        enforceCeiling: false,
      });
      written += 1;
    } catch (e) {
      console.error(`    backfill row for ${ep ?? 'series'} failed: ${(e as Error).message}`);
    }
  }
  console.log(`\n  Wrote ${written}/${buckets.length} backfill rows ($${total.toFixed(2)}).\n`);
}

main().catch((err: unknown) => {
  console.error(`backfill failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
