// Dry-run of the Episode Autonomy Scorecard deriver — console only, NO writes.
// Usage: npx tsx scripts/scorecard-dryrun.ts [EPISODE_CODE]   (default SS-S15-E16)
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs'; import * as path from 'path';
import { computeScorecard } from '../lib/agents/scorecard/compute-scorecard';
import { refreshScorecard } from '../lib/agents/scorecard/persist-scorecard';

const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) as any;

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const CODE = args.find((a) => !a.startsWith('--')) || 'SS-S15-E16';

(async () => {
  const { data: ep } = await sb.from('episodes').select('id,episode_code').eq('episode_code', CODE).maybeSingle();
  if (!ep) { console.error(`episode ${CODE} not found`); process.exit(1); }
  const rec = await computeScorecard(sb, ep.id, 'snapshot');

  console.log(`\n===== Autonomy Scorecard (dry-run) — ${CODE} =====\n`);
  console.log(`shots (canonical):        ${rec.shotCount}   [source: ${(rec.metrics as any).shot_count_source}]`);
  console.log(`\n-- KPI-1 : machine churn --`);
  console.log(`  agent runs / shot:      ${rec.kpi1RunsPerShot}   (${rec.totalAgentRuns} runs)  [self-moving ~1-2]`);
  console.log(`\n-- KPI-2 : code-able intelligent touches (cost → drive to 0) --`);
  console.log(`  total:                  ${rec.codeableTouchesTotal}`);
  console.log(`    human (your time):    ${rec.codeableTouchesHuman}`);
  console.log(`    AI-EP (Opus tokens):  ${rec.codeableTouchesAiEp}`);
  console.log(`    (manual_trigger h/ai: ${JSON.stringify((rec.metrics as any).manual_triggers)}; mech-approvals: ${JSON.stringify((rec.metrics as any).mechanical_approvals)})`);
  console.log(`\n-- Autonomy ledger --`);
  console.log(`  chain-fired (code):     ${rec.chainFiredAdvances} / ${rec.totalAdvances}`);
  console.log(`  Autonomy%:              ${(rec.metrics as any).autonomy_pct}%`);
  console.log(`\n-- Floor : creative-gate approvals (judgement, not waste) --`);
  console.log(`  human / AI-EP:          ${rec.approvalsCreativeHuman} / ${rec.approvalsCreativeAi}`);
  console.log(`\n-- Reliability / latency --`);
  console.log(`  agent failures:         ${rec.agentFailures}  ${JSON.stringify(rec.failuresByStage)}`);
  console.log(`  churn re-fires:         ${rec.churnRefires}  [coverage ${(rec.metrics as any).churn_coverage}%]`);
  console.log(`  stuck shots at final:   ${rec.stuckShotsFinal}`);
  console.log(`  latency→first finalcut: ${rec.latencyFirstFinalCutS === null ? 'n/a' : (rec.latencyFirstFinalCutS / 3600).toFixed(1) + 'h'}`);
  console.log(`\n-- runs/shot by stage (churn-sink localiser) --`);
  const rps = (rec.metrics as any).runs_per_shot_by_stage as Record<string, number>;
  Object.entries(rps).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(6)}  ${k}  (${rec.runsByStage[k]} runs)`));
  console.log(`\n-- gate_decision_log --`);
  console.log(`  demanded(require_human): ${(rec.metrics as any).approvals_demanded}  [log available: ${(rec.metrics as any).gate_log_available}]`);
  console.log(`  by class:               ${JSON.stringify((rec.metrics as any).gate_autonomy_by_class)}`);
  console.log('');

  if (WRITE) {
    console.log('--- WRITE: persisting row + REV-scorecard asset ---');
    const { scorecardRowId } = await refreshScorecard(sb, ep.id, 'snapshot');
    const { data: row } = await sb.from('episode_scorecard').select('id,phase,kpi1_runs_per_shot,codeable_touches_total,created_at').eq('id', scorecardRowId).single();
    const { data: asset } = await sb.from('assets').select('filename,status,version').eq('episode_id', ep.id).eq('file_type', 'REV-scorecard').order('version', { ascending: false }).limit(1).single();
    console.log('  episode_scorecard row:', JSON.stringify(row));
    console.log('  REV-scorecard asset:  ', JSON.stringify(asset));
  }
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
