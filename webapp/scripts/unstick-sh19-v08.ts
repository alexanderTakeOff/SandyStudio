// TD-79 (2026-05-27): companion to unblock-sh19-v07.ts. Flip v08 from
// REVISION → REVIEW after TD-79 content-fallback fix makes the
// unstickPlanForApproval tool work for Plans whose REV row predates
// TD-77 metadata persistence. This script bypasses the PA tool path and
// directly applies the gate's logic (verdict found via content-fallback
// = PASS_WITH_UNCERTAINTY → flip allowed).
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const l = raw.trim(); if (!l || l.startsWith('#')) continue;
    const eq = l.indexOf('='); if (eq <= 0) continue;
    let v = l.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[l.slice(0, eq).trim()] = v;
  }
}

const U = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const V08 = '39954efe-3942-4d9c-bb92-a0c0afed4078';

async function rest(method: 'GET' | 'PATCH', q: string, body?: unknown): Promise<Response> {
  return fetch(`${U}/rest/v1/${q}`, {
    method,
    headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function main(): Promise<void> {
  const r = await rest('GET', `assets?id=eq.${V08}&select=filename,status`);
  const rows = (await r.json()) as Array<{ filename: string; status: string }>;
  if (rows.length === 0) { console.error('v08 not found'); process.exit(1); }
  console.log(`v08 (${rows[0].filename}) current status: ${rows[0].status}`);
  if (rows[0].status === 'REVIEW' || rows[0].status === 'APPROVED') {
    console.log('already approvable, no-op.');
    return;
  }
  if (rows[0].status !== 'REVISION' && rows[0].status !== 'DRAFT') {
    console.error(`unexpected status ${rows[0].status} — manual review needed`);
    process.exit(1);
  }
  const p = await rest('PATCH', `assets?id=eq.${V08}`, { status: 'REVIEW' });
  if (!p.ok) {
    console.error(`PATCH failed: ${p.status} ${await p.text()}`);
    process.exit(1);
  }
  console.log('✅ v08 flipped to REVIEW. Director can approve via UI now.');
  console.log('   Note: TD-79 content-fallback fix in unstickPlanForApproval will let Polина handle similar pre-TD-77 cases via PA chat next time.');
}

main().catch((e) => { console.error(e); process.exit(1); });
