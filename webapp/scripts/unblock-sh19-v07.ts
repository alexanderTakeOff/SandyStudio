// One-shot unblock for SH19 Plan v07. Background:
//   - SH19 Shot Plan v07 was created by Animator after Director's TD-74 waiver.
//   - Critic returned PASS_WITH_UNCERTAINTY (the V04 multi-action waiver).
//   - runner.ts EXEC-VPREV tertiary bug treated PASS_WITH_UNCERTAINTY as REVISE
//     and flipped Plan status to REVISION instead of leaving it in REVIEW.
//   - Approve route REVISION → APPROVED is not allowed.
//   - TD-75 commit fixes the runner so future Plans don't get stuck.
//   - This script flips the already-stuck v07 row from REVISION → REVIEW so
//     Director's existing UI approval flow can proceed without re-running.
//
// Idempotent: if v07 is already REVIEW or APPROVED, prints state and exits 0.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    const eq = l.indexOf('=');
    if (eq <= 0) continue;
    let v = l.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[l.slice(0, eq).trim()] = v;
  }
}

const U = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EPISODE = 'f019c29f-5e1e-4964-b62b-6c59fc3aa966';

async function rest(method: 'GET' | 'PATCH', path: string, body?: unknown): Promise<Response> {
  return fetch(`${U}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: K,
      Authorization: `Bearer ${K}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

interface PlanRow {
  id: string;
  filename: string;
  status: string;
  version: number;
  updated_at: string;
}

async function main(): Promise<void> {
  // Find SH19 v07 Plan row — widened file_type match for TD-66/TD-75.
  const q = `assets?episode_id=eq.${EPISODE}&filename=ilike.*SPC-shot_plan*SH19*v07*&select=id,filename,status,version,updated_at`;
  const resp = await rest('GET', q);
  if (!resp.ok) {
    console.error(`GET failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const rows = (await resp.json()) as PlanRow[];
  if (rows.length === 0) {
    console.error('SH19 v07 Plan row not found');
    process.exit(1);
  }

  const target = rows[0];
  console.log(`Target Plan:`);
  console.log(`  filename: ${target.filename}`);
  console.log(`  id:       ${target.id}`);
  console.log(`  status:   ${target.status}`);
  console.log(`  version:  ${target.version}`);
  console.log(`  updated:  ${target.updated_at}`);

  if (target.status === 'REVIEW') {
    console.log('\n✅ Plan already in REVIEW — Director can approve in UI. No-op.');
    return;
  }
  if (target.status === 'APPROVED') {
    console.log('\n✅ Plan already APPROVED — VGEN should fire. No-op.');
    return;
  }
  if (target.status === 'LOCKED') {
    console.error('\n❌ Plan is LOCKED — refusing to modify (CLAUDE.md §7).');
    process.exit(1);
  }
  if (target.status !== 'REVISION' && target.status !== 'DRAFT') {
    console.error(`\n❌ Unexpected status ${target.status} — manual review needed.`);
    process.exit(1);
  }

  // PATCH status → REVIEW. Trigger will re-bump updated_at automatically.
  console.log(`\nFlipping ${target.status} → REVIEW...`);
  const patch = await rest('PATCH', `assets?id=eq.${target.id}`, {
    status: 'REVIEW',
  });
  if (!patch.ok) {
    console.error(`PATCH failed: ${patch.status} ${await patch.text()}`);
    process.exit(1);
  }
  const after = (await patch.json()) as PlanRow[];
  console.log(`✅ Plan now in status=${after[0]?.status}, updated_at=${after[0]?.updated_at}`);
  console.log('\nNext: Director approves Plan v07 in the webapp approvals UI.');
  console.log('Expected auto-chain: SPC-shot_plan APPROVED → EXEC-VGEN single-shot fires.');
}

main().catch((e) => { console.error(e); process.exit(1); });
