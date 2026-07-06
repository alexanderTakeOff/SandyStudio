// ──────────────────────────────────────────────────────────────────────────────
// tools/scorecard-backfill.ts
// Best-effort backfill of the Episode Autonomy Scorecard over past episodes, so
// the KPI trend exists from history instead of starting at zero. Lives in tools/
// (SS-naming hook ignores it). Read-only source → writes episode_scorecard rows.
//
//   npm run scorecard-backfill                 → all episodes, ROW only (no .md)
//   npm run scorecard-backfill -- SS-S15-E16   → one episode
//   npm run scorecard-backfill -- --with-md    → also render REV-scorecard assets
//
// Default is ROW-ONLY: the trend reads the structured row; we do NOT inject a new
// .md asset into every past episode's asset list. Pass --with-md to also render.
// Best-effort per episode: one episode's missing storyboard never aborts the batch.
// ──────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { computeScorecard } from '../lib/agents/scorecard/compute-scorecard';
import { persistScorecard, refreshScorecard } from '../lib/agents/scorecard/persist-scorecard';

const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
) as any;

const args = process.argv.slice(2);
const WITH_MD = args.includes('--with-md');
const ONE = args.find((a) => !a.startsWith('--'));

(async () => {
  let q = sb.from('episodes').select('id, episode_code').order('episode_code', { ascending: true });
  if (ONE) q = q.eq('episode_code', ONE);
  const { data: eps, error } = await q;
  if (error) {
    console.error('episodes fetch failed:', error.message);
    process.exit(1);
  }
  const targets = (eps ?? []).filter((e: any) => /^SS-.*-E\d+$/i.test(e.episode_code ?? ''));
  console.log(`Backfill ${targets.length} episodes (mode: ${WITH_MD ? 'row + .md' : 'row only'})\n`);

  let ok = 0;
  let skipped = 0;
  for (const ep of targets) {
    try {
      if (WITH_MD) {
        const { rec } = await refreshScorecard(sb, ep.id, 'snapshot');
        console.log(`  ✅ ${ep.episode_code.padEnd(12)} KPI-1 ${rec.kpi1RunsPerShot} · KPI-2 ${rec.codeableTouchesTotal} · autonomy ${(rec.metrics as any).autonomy_pct}% · shots ${rec.shotCount}`);
      } else {
        const rec = await computeScorecard(sb, ep.id, 'snapshot');
        await persistScorecard(sb, rec);
        console.log(`  ✅ ${ep.episode_code.padEnd(12)} KPI-1 ${rec.kpi1RunsPerShot} · KPI-2 ${rec.codeableTouchesTotal} · autonomy ${(rec.metrics as any).autonomy_pct}% · shots ${rec.shotCount}`);
      }
      ok += 1;
    } catch (e: any) {
      console.warn(`  ⚠️  ${ep.episode_code?.padEnd(12)} skipped — ${e.message}`);
      skipped += 1;
    }
  }
  console.log(`\nDone: ${ok} written, ${skipped} skipped.`);
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
