// ──────────────────────────────────────────────────────────────────────────────
// scripts/replay-execute-from-plan.ts
// One-off recovery for SS-S15-E01: the 2 SPC-ref_plan assets were APPROVED
// via Polina but approve route TD-24 bug (strict `ft === 'SPC-ref_plan'`)
// silently skipped the execute-from-plan branch. Plan assets are already
// APPROVED, so we manually dispatch the 2 inngest events the route should
// have fired. Mirrors approve route lines 410-451 logic for shotId extraction
// and idempotency.
//
// Author: Theo · 2026-05-20 · Plan: sparkling-riding-blum.md Phase 5b Step B
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[line.slice(0, eq).trim()] = val;
  }
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const APPLY = process.argv.includes('--apply');
const EPISODE_ID = 'f019c29f-5e1e-4964-b62b-6c59fc3aa966';
const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL ?? 'http://localhost:8288';

type PlanAsset = {
  id: string;
  filename: string;
  status: string;
  file_type: string;
  content: string | null;
};

/** Mirror approve route lines 415-427 — extract shot_id from JSON block in content. */
function extractShotId(content: string | null): string | null {
  if (typeof content !== 'string') return null;
  const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
  const last = matches[matches.length - 1]?.[1];
  if (!last) return null;
  try {
    const body = JSON.parse(last.trim()) as { shot_id?: unknown };
    return typeof body.shot_id === 'string' ? body.shot_id : null;
  } catch {
    return null;
  }
}

/** Mirror approve route lines 431-445 — check if any IMG already carries this plan id. */
async function planAlreadyExecuted(planAssetId: string): Promise<boolean> {
  const { data, error } = await sb
    .from('assets')
    .select('metadata')
    .eq('episode_id', EPISODE_ID)
    .like('file_type', 'IMG-episode_ref%');
  if (error) throw error;
  for (const row of data ?? []) {
    const meta = (row as { metadata?: unknown }).metadata as
      | { provenance?: { plan_asset_id?: unknown } }
      | null;
    if (meta?.provenance?.plan_asset_id === planAssetId) return true;
  }
  return false;
}

async function dispatchInngestEvent(planAssetId: string, shotId: string): Promise<void> {
  const payload = {
    name: 'sandystudio/exec-eref/execute-from-plan',
    data: { episodeId: EPISODE_ID, shotId, planAssetId },
  };
  console.log(`    [${APPLY ? 'APPLY' : 'DRY '}] dispatch → ${payload.name}`);
  console.log(`           data: ${JSON.stringify(payload.data)}`);
  if (!APPLY) return;

  const res = await fetch(`${INNGEST_DEV_URL}/e/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Inngest dispatch failed ${res.status}: ${body.slice(0, 200)}`);
  }
  const result = (await res.json()) as { ids?: string[] };
  console.log(`           ✓ inngest accepted, ids: ${(result.ids ?? []).join(', ')}`);

  // Audit log
  await sb.from('activity_events').insert({
    event_type: 'manual_trigger',
    severity: 'info',
    title: `Manual replay: execute-from-plan (TD-24 recovery)`,
    description: `Approve route strict-compare bug missed dispatch for SPC-ref_plan-${shotId}; dispatched manually via scripts/replay-execute-from-plan.ts`,
    actor: 'DIRECTOR',
    episode_id: EPISODE_ID,
    asset_id: planAssetId,
    metadata: {
      agent: 'EXEC-EREF',
      event: payload.name,
      shot_id: shotId,
      plan_asset_id: planAssetId,
      reason: 'TD-24 hot-fix recovery — approve route line 410 strict comparison missed real file_type SPC-ref_plan-<shotId>',
      script: 'replay-execute-from-plan.ts',
      inngest_event_ids: result.ids ?? [],
    } as never,
  });
}

(async () => {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  TD-24 recovery: replay execute-from-plan for SS-S15-E01`);
  console.log(`  Episode: ${EPISODE_ID}`);
  console.log(`  Inngest dev: ${INNGEST_DEV_URL}`);
  console.log(`  Mode: ${APPLY ? '🟢 APPLY' : '🟡 DRY RUN'}`);
  console.log(`${'═'.repeat(70)}\n`);

  // Load both approved plans
  const { data: plans, error } = await sb
    .from('assets')
    .select('id,filename,status,file_type,content')
    .eq('episode_id', EPISODE_ID)
    .like('filename', 'SS-S15-E01-SPC-ref_plan-%')
    .eq('status', 'APPROVED')
    .order('filename', { ascending: true });
  if (error) throw error;

  if (!plans || plans.length === 0) {
    console.error('💥 No APPROVED SPC-ref_plan assets found for SS-S15-E01');
    process.exit(1);
  }
  console.log(`Found ${plans.length} APPROVED Plan asset(s):\n`);
  for (const p of plans as PlanAsset[]) {
    console.log(`  • ${p.id}  ${p.filename}`);
  }
  console.log();

  for (const p of plans as PlanAsset[]) {
    console.log(`──── ${p.filename} ────`);
    const shotId = extractShotId(p.content);
    if (!shotId) {
      console.error(`  ✗ Could not extract shot_id from content body — skipping`);
      continue;
    }
    console.log(`  shot_id: ${shotId}`);

    const already = await planAlreadyExecuted(p.id);
    if (already) {
      console.log(`  ⏭  IMG already carries this plan_asset_id — skipping (idempotent)`);
      continue;
    }

    await dispatchInngestEvent(p.id, shotId);
    console.log();
  }

  console.log(`${'═'.repeat(70)}`);
  console.log(`  ${APPLY ? '🟢 Phase 5b Step B complete. Monitor activity_events.' : '🟡 DRY RUN finished. Re-run with --apply.'}`);
  console.log(`${'═'.repeat(70)}\n`);
  process.exit(0);
})().catch((err) => {
  console.error('\n💥 Replay failed:', err);
  process.exit(1);
});
