// ──────────────────────────────────────────────────────────────────────────────
// scripts/replay-pilot.ts
// End-to-end pipeline replay using an in-memory Supabase mock.
//
// This is the "Director runs one command, sees one result" harness from
// phase-4-jiggly-wave.md §7.2. It does NOT spawn Inngest or Next.js servers;
// instead it walks the pipeline by calling runner.ts methods directly with
// the same fake Supabase used by unit tests.
//
// What this verifies (per agent layer):
//   - Gate logic (validateAgentInputs): every agent's required upstream
//     APPROVED assets are checked against the assets table
//   - Run logic (runAgent + saveAgentOutput): every agent produces a
//     correctly-shaped asset row
//   - Budget logic (recordCost): cost rows accumulate, idempotency works
//   - Governance: PUBLISH blocks in Mode 1, passes in Mode 4
//
// What this does NOT verify (Inngest-platform concerns, trusted to Inngest):
//   - Event dispatch via inngest.send()
//   - Concurrency limit enforcement (per webapp.md §4.2.1)
//   - Retry semantics
//   - Cron scheduling for analytics (T+1h/24h/7d/30d)
//
// Usage:
//   npm run replay-pilot      # default — full episode replay + governance + idempotency
//
// Exit code:
//   0 = all green, prints PASS report
//   1 = at least one assertion failed, prints FAIL report
// ──────────────────────────────────────────────────────────────────────────────

import { recordCost, BudgetExceededError } from '../lib/budget';
import { validateAgentInputs } from '../lib/agents/gate';
import {
  loadAgentInputs,
  runAgent,
  saveAgentOutput,
  insertJobRow,
  markJobCompleted,
  markJobFailed,
  type RunAgentArgs,
} from '../lib/agents/runner';
import { resolveModelId, displayWithEmoji } from '../lib/agents/registry';
import type { AgentId } from '../lib/agents/types';
import { makeMockSupabase } from '../__tests__/helpers/mock-supabase';

// ── Colored output helpers (Windows-friendly) ─────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function pass(msg: string): void {
  console.log(`${C.green}OK${C.reset} ${msg}`);
}
function fail(msg: string): void {
  console.log(`${C.red}FAIL${C.reset} ${msg}`);
}
function info(msg: string): void {
  console.log(`${C.cyan}>${C.reset} ${msg}`);
}
function header(msg: string): void {
  console.log(`\n${C.bold}${C.cyan}-- ${msg} --${C.reset}`);
}

interface AssertionResult {
  passed: boolean;
  description: string;
  detail?: string;
}

const results: AssertionResult[] = [];

function assert(condition: boolean, description: string, detail?: string): void {
  results.push({ passed: condition, description, detail });
  if (condition) {
    pass(description);
  } else {
    fail(`${description}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── Pipeline simulation helpers ───────────────────────────────────────────────

interface Harness {
  supabase: ReturnType<typeof makeMockSupabase>;
  episodeId: string;
}

async function runPipelineStep(
  h: Harness,
  agentId: AgentId,
  options: {
    extraEventData?: Record<string, unknown>;
    runArgs?: Partial<RunAgentArgs>;
    autoApproveOutput?: boolean;
    eventContext?: { directorConfirm?: boolean };
  } = {},
): Promise<{ success: boolean; assetId?: string; error?: string }> {
  const { supabase, episodeId } = h;
  const eventName = `sandystudio/${agentId.toLowerCase()}/run`;
  const inputSnapshot = options.extraEventData ?? {};

  // Step 1: insert RUNNING jobs row
  const job = await insertJobRow({
    supabase: supabase.client,
    agentId,
    episodeId,
    inngestEvent: eventName,
    inngestRunId: `replay-${agentId}-${Date.now()}`,
    inputSnapshot,
  });

  // Step 2: validate
  const gate = await validateAgentInputs({
    supabase: supabase.client,
    agentId,
    episodeId,
    eventContext: options.eventContext,
  });

  if (!gate.passed) {
    await markJobFailed(supabase.client, job.id, gate.reason ?? 'gate failed');
    return { success: false, error: gate.reason };
  }

  // Step 3: execute
  const inputs = await loadAgentInputs({
    supabase: supabase.client,
    agentId,
    episodeId,
  });
  const exec = await runAgent({
    agentId,
    inputs,
    ...options.runArgs,
  });

  // Step 4: record cost
  await recordCost(supabase.client, {
    jobId: job.id,
    episodeId,
    agentId,
    costUsd: exec.result.cost_usd,
    apiProvider: 'mock',
    modelOrTier: resolveModelId(agentId) || 'mock',
    operation: `${agentId.toLowerCase()}_replay`,
  });

  // Step 5: save asset + complete job
  const variant =
    (options.runArgs?.shotId as string | undefined) ??
    (options.runArgs?.section as string | undefined) ??
    (options.runArgs?.collectionPoint as string | undefined);
  const saved = await saveAgentOutput({
    supabase: supabase.client,
    agentId,
    episodeId,
    episodeCode: 'SS-S01-E01',
    result: exec.result,
    outputKind: exec.outputKind,
    variant,
  });
  await markJobCompleted(supabase.client, job.id, saved.assetId);

  // Auto-approve so downstream gates pass
  if (options.autoApproveOutput !== false) {
    const asset = supabase.tables.assets.find((a) => a.id === saved.assetId);
    if (asset) {
      asset.status = 'APPROVED';
    }
  }

  return { success: true, assetId: saved.assetId };
}

// ── Test scenarios ────────────────────────────────────────────────────────────

async function happyPathReplay(): Promise<void> {
  header('Scenario 1: Happy-path PILOT replay (Mode 4 AUTOTEST)');

  const supabase = makeMockSupabase({
    episodes: [
      {
        id: 'ep-pilot',
        episode_code: 'SS-S01-E01',
        budget_ceiling: 50,
        budget_spent: 0,
        governance_mode: 4, // AUTOTEST — bypass PUBLISH director_confirm
        status: 'BRIEF_APPROVED',
        title_working: 'The Red Carpet',
        series_id: 'series-1',
      },
    ],
    assets: [
      {
        id: 'brief-1',
        episode_id: 'ep-pilot',
        file_type: 'SPC-brief-pilot',
        filename: 'SS-S01-E01-SPC-brief-pilot-v01-APPROVED.md',
        status: 'APPROVED',
        version: 1,
      },
      // Series Bible canon — Step 4 gate requires ≥1 LOCKED character + style.
      // Series-scoped (no episode_id), pre-LOCKED so EXEC-EREF gate passes.
      {
        id: 'sbl-character-pilot',
        series_id: 'series-1',
        episode_id: null,
        file_type: 'SBL-character_sandy',
        filename: 'SS-S01-SBL-character_sandy-v01-LOCKED.png',
        status: 'LOCKED',
        version: 1,
      },
      {
        id: 'sbl-style-pilot',
        series_id: 'series-1',
        episode_id: null,
        file_type: 'SBL-style_visual',
        filename: 'SS-S01-SBL-style_visual-v01-LOCKED.md',
        status: 'LOCKED',
        version: 1,
      },
    ],
  });

  const h: Harness = { supabase, episodeId: 'ep-pilot' };
  const startedAt = Date.now();

  // Phase A — script + review + storyboard
  info('Phase A: script generation');
  const sw = await runPipelineStep(h, 'EXEC-SW');
  assert(sw.success, `EXEC-SW (${displayWithEmoji('EXEC-SW')}) produced a script`);

  const srev = await runPipelineStep(h, 'EXEC-SREV');
  assert(srev.success, `EXEC-SREV (${displayWithEmoji('EXEC-SREV')}) reviewed the script`);

  const sb = await runPipelineStep(h, 'EXEC-SB');
  assert(sb.success, `EXEC-SB (${displayWithEmoji('EXEC-SB')}) produced a storyboard`);

  // Storyboard gate for WCHK requires 3 STB-prefixed assets. The mock storyboard
  // produces 1 unified asset; spoof 2 more APPROVED storyboards so the gate passes.
  for (const act of [2, 3]) {
    supabase.tables.assets.push({
      id: `stb-extra-${act}`,
      episode_id: 'ep-pilot',
      file_type: `STB-act${act}`,
      filename: `SS-S01-E01-STB-act${act}-v01-APPROVED.md`,
      status: 'APPROVED',
      version: 1,
    });
  }

  // Phase B — backbone v2: world check + episode references + animatic
  // World Check stays in the pipeline (not in pipeline view but still in
  // gate.ts) for legacy compatibility. Episode references is the new gate
  // before Animatic per backbone v2.
  info('Phase B: world check + episode references + animatic');
  const wchk = await runPipelineStep(h, 'EXEC-WCHK');
  assert(wchk.success, `EXEC-WCHK (${displayWithEmoji('EXEC-WCHK')}) verified world consistency`);

  // EXEC-EREF — Episode Reference Generator (backbone v2 stage)
  const erefResult = await runPipelineStep(h, 'EXEC-EREF');
  assert(erefResult.success, `EXEC-EREF (${displayWithEmoji('EXEC-EREF')}) produced episode references`);
  // Promote the EREF asset to APPROVED with the canonical IMG-episode_ref
  // file_type so EXEC-EDIT's gate (backbone v2) finds it.
  const erefAsset = supabase.tables.assets.find((a) => a.id === erefResult.assetId);
  if (erefAsset) {
    erefAsset.file_type = 'IMG-episode_ref';
    erefAsset.status = 'APPROVED';
  }

  const editResult = await runPipelineStep(h, 'EXEC-EDIT');
  assert(editResult.success, `EXEC-EDIT (${displayWithEmoji('EXEC-EDIT')}) assembled the animatic`);

  // Make sure the animatic has the canonical VID-animatic file_type prefix
  // so downstream VGEN/MGEN/PUB gates can match it.
  const animatic = supabase.tables.assets.find((a) => a.id === editResult.assetId);
  if (animatic) animatic.file_type = 'VID-animatic';

  // Phase C — visual + music in parallel
  info('Phase C: per-shot visual generation + music');
  const shotIds = ['ep-pilot-A1-SC01-SH01', 'ep-pilot-A2-SC01-SH01', 'ep-pilot-A3-SC01-SH01'];
  for (const shotId of shotIds) {
    const r = await runPipelineStep(h, 'EXEC-VGEN', { runArgs: { shotId } });
    assert(r.success, `EXEC-VGEN shot ${shotId.slice(-4)}`);
  }
  const mgen = await runPipelineStep(h, 'EXEC-MGEN', { runArgs: { section: 'main' } });
  assert(mgen.success, `EXEC-MGEN produced music`);

  // Phase D — copy + thumbnail
  info('Phase D: metadata + thumbnail');
  const copy = await runPipelineStep(h, 'EXEC-COPY');
  assert(copy.success, `EXEC-COPY produced metadata`);
  const meta = supabase.tables.assets.find((a) => a.id === copy.assetId);
  if (meta) meta.file_type = 'SPC-metadata';

  const thumb = await runPipelineStep(h, 'EXEC-THUMB');
  assert(thumb.success, `EXEC-THUMB produced thumbnail`);
  const thumbAsset = supabase.tables.assets.find((a) => a.id === thumb.assetId);
  if (thumbAsset) thumbAsset.file_type = 'IMG-thumbnail';

  // Phase E — publish (Mode 4 AUTOTEST: no director_confirm needed)
  info('Phase E: publish');
  const pub = await runPipelineStep(h, 'EXEC-PUB');
  assert(pub.success, `EXEC-PUB published to YouTube (mock)`);

  // Phase F — analytics x 4 collection points
  info('Phase F: analytics collection (T+1h/24h/7d/30d)');
  const pubAsset = supabase.tables.assets.find((a) => a.id === pub.assetId);
  if (pubAsset) pubAsset.file_type = 'REV-publish_log';

  for (const cp of ['T+1h', 'T+24h', 'T+7d', 'T+30d'] as const) {
    const r = await runPipelineStep(h, 'EXEC-ANAL', {
      runArgs: { collectionPoint: cp, youtubeVideoId: 'mock_vid_pilot' },
    });
    assert(r.success, `EXEC-ANAL ${cp} collected`);
  }

  // ── Cross-cutting assertions ────────────────────────────────────────────────
  header('Cross-cutting checks');

  const completedJobs = supabase.tables.jobs.filter((j) => j.status === 'COMPLETED');
  // Expected (backbone v2): SW + SREV + SB + WCHK + EREF + EDIT + 3*VGEN + MGEN
  //                       + COPY + THUMB + PUB + 4*ANAL = 17
  assert(
    completedJobs.length === 17,
    'jobs.status: every step COMPLETED',
    `expected 17, found ${completedJobs.length}`,
  );

  const totalSpent = supabase.tables.episodes[0].budget_spent;
  assert(totalSpent === 0, 'budget_spent = $0.00 (mock mode)', `actual: ${totalSpent}`);

  const budgetRows = supabase.tables.budget_log.length;
  assert(budgetRows >= 14, `budget_log has >=14 rows (one per agent run)`, `actual: ${budgetRows}`);

  const analyticsAssets = supabase.tables.assets.filter((a) =>
    String(a.file_type).startsWith('REV-analytics'),
  );
  assert(
    analyticsAssets.length === 4,
    'analytics: 4 reports (T+1h, T+24h, T+7d, T+30d)',
    `actual: ${analyticsAssets.length}`,
  );

  const elapsed = Date.now() - startedAt;
  info(`Pipeline completed in ${elapsed}ms`);
}

async function governanceRegression(): Promise<void> {
  header('Scenario 2: governance regression — Mode 1 PUBLISH must block');

  const supabase = makeMockSupabase({
    episodes: [
      {
        id: 'ep-mode1',
        episode_code: 'SS-S01-E02',
        budget_ceiling: 50,
        budget_spent: 0,
        governance_mode: 1, // MANUAL — Director must confirm publish
      },
    ],
    assets: [
      { id: 'a1', episode_id: 'ep-mode1', file_type: 'VID-animatic', status: 'APPROVED' },
      { id: 'a2', episode_id: 'ep-mode1', file_type: 'SPC-metadata', status: 'APPROVED' },
      { id: 'a3', episode_id: 'ep-mode1', file_type: 'IMG-thumbnail', status: 'APPROVED' },
    ],
  });

  // Without director_confirm: gate must FAIL
  const blocked = await runPipelineStep(
    { supabase, episodeId: 'ep-mode1' },
    'EXEC-PUB',
    { eventContext: {} },
  );
  assert(
    !blocked.success && /hard limit/i.test(blocked.error ?? ''),
    'EXEC-PUB without director_confirm in Mode 1 -> BLOCKED',
    blocked.error,
  );

  // With director_confirm=true: gate must PASS
  const allowed = await runPipelineStep(
    { supabase, episodeId: 'ep-mode1' },
    'EXEC-PUB',
    { eventContext: { directorConfirm: true } },
  );
  assert(
    allowed.success,
    'EXEC-PUB with director_confirm=true in Mode 1 -> PASS',
    allowed.error,
  );
}

async function idempotencyCheck(): Promise<void> {
  header('Scenario 3: cost idempotency — retry must not double-charge');

  const supabase = makeMockSupabase({
    episodes: [
      {
        id: 'ep-idem',
        episode_code: 'SS-S01-E03',
        budget_ceiling: 50,
        budget_spent: 0,
        governance_mode: 4,
      },
    ],
  });

  const args = {
    jobId: 'job-retry',
    episodeId: 'ep-idem',
    agentId: 'EXEC-SW' as const,
    costUsd: 1.234,
    apiProvider: 'anthropic',
    modelOrTier: 'claude-sonnet-4-6',
    operation: 'script_generation',
  };
  const first = await recordCost(supabase.client, args);
  const second = await recordCost(supabase.client, args);
  const third = await recordCost(supabase.client, args);

  assert(first.recorded, 'first record-cost: recorded=true');
  assert(!second.recorded, 'second record-cost (retry): recorded=false');
  assert(!third.recorded, 'third record-cost (retry): recorded=false');
  assert(
    supabase.tables.budget_log.length === 1,
    'budget_log has exactly 1 row across 3 attempts',
    `actual: ${supabase.tables.budget_log.length}`,
  );
  assert(
    supabase.tables.episodes[0].budget_spent === 1.234,
    'episodes.budget_spent updated exactly once',
    `actual: ${supabase.tables.episodes[0].budget_spent}`,
  );
}

async function budgetCeilingCheck(): Promise<void> {
  header('Scenario 4: budget ceiling — must throw BudgetExceededError');

  const supabase = makeMockSupabase({
    episodes: [
      {
        id: 'ep-tight',
        episode_code: 'SS-S01-E04',
        budget_ceiling: 1.0, // very tight
        budget_spent: 0,
        governance_mode: 4,
      },
    ],
  });

  // First call within budget should succeed
  await recordCost(supabase.client, {
    jobId: 'job-1',
    episodeId: 'ep-tight',
    agentId: 'EXEC-SW',
    costUsd: 0.5,
    apiProvider: 'anthropic',
    modelOrTier: 'claude-sonnet-4-6',
    operation: 'script_generation',
  });

  // Second call exceeding ceiling must throw
  let threw = false;
  try {
    await recordCost(supabase.client, {
      jobId: 'job-2',
      episodeId: 'ep-tight',
      agentId: 'EXEC-VGEN',
      costUsd: 0.6, // 0.5 + 0.6 > 1.0 ceiling
      apiProvider: 'fal_ai',
      modelOrTier: 'kling-3',
      operation: 'video_generation',
    });
  } catch (err) {
    threw = err instanceof BudgetExceededError;
  }
  assert(threw, 'BudgetExceededError thrown when ceiling would be exceeded');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`${C.bold}${C.cyan}SandyStudio Phase 4 Pipeline Replay${C.reset}`);
  console.log(`${C.dim}In-memory harness — no Supabase, no Inngest, no Next.js${C.reset}`);

  const overallStart = Date.now();

  try {
    await happyPathReplay();
    await governanceRegression();
    await idempotencyCheck();
    await budgetCeilingCheck();
  } catch (err) {
    fail(`Unhandled error in harness: ${(err as Error).message}`);
    console.error(err);
    process.exit(1);
  }

  // Final summary
  const totalElapsed = Date.now() - overallStart;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\n${C.bold}-- SUMMARY --${C.reset}`);
  if (failed === 0) {
    console.log(
      `${C.green}${C.bold}ALL ${passed} ASSERTIONS PASSED${C.reset} (${totalElapsed}ms)`,
    );
    process.exit(0);
  } else {
    console.log(
      `${C.red}${C.bold}${failed} of ${passed + failed} ASSERTIONS FAILED${C.reset} (${totalElapsed}ms)`,
    );
    for (const r of results.filter((x) => !x.passed)) {
      console.log(`   ${C.red}*${C.reset} ${r.description}${r.detail ? ` — ${r.detail}` : ''}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
