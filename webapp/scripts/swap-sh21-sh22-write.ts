// Step 2 (WRITE) — apply SH21 ↔ SH22 positional swap in S15-E01 storyboard JSON.
// Director-initiated content reorder per plan radiant-puzzling-boot.md.
// Shot ids stay attached to their content; only acts[2].shots[] order changes.
// Run via: cd webapp && npx tsx scripts/swap-sh21-sh22-write.ts

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
const TARGET_ID = '524aca99-2269-425b-9fee-46c0fc9cd946';
const POLICY_NOTE =
  'director-edit 2026-05-27 — SH21↔SH22 positional swap per Director, narrative motivation: place anvil-pat-puddle in middle, end on cushion-plug happy ending. Shot ids unchanged; downstream artifacts unaffected.';

interface StoryboardShot {
  shot_id: string;
  shot_role?: string;
}

interface StoryboardAct {
  act: number;
  beat_summary?: string;
  shots: StoryboardShot[];
}

interface StoryboardContract {
  episode_id: string;
  contract: string;
  acts: StoryboardAct[];
  total_shots?: number;
  policy_notes?: string[];
}

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

function extractJsonBlock(content: string): { sb: StoryboardContract; blockRaw: string; jsonText: string } {
  const re = /```json\s*\n([\s\S]*?)\n```/;
  const match = content.match(re);
  if (!match) throw new Error('no fenced ```json block found in content');
  return {
    sb: JSON.parse(match[1]) as StoryboardContract,
    blockRaw: match[0],
    jsonText: match[1],
  };
}

async function main(): Promise<void> {
  // 1. Re-fetch current content
  console.log(`fetching content for asset ${TARGET_ID}...`);
  const r = await rest('GET', `assets?id=eq.${TARGET_ID}&select=content,status,version,filename`);
  if (!r.ok) {
    console.error(`GET failed: ${r.status} ${await r.text()}`);
    process.exit(1);
  }
  const rows = (await r.json()) as Array<{ content: string | null; status: string; version: number; filename: string }>;
  if (rows.length === 0) {
    console.error('no asset row');
    process.exit(1);
  }
  const row = rows[0];
  console.log(`  filename: ${row.filename}`);
  console.log(`  status:   ${row.status}`);
  console.log(`  version:  ${row.version}`);

  if (row.status === 'LOCKED') {
    console.error('asset is LOCKED — refusing to modify (CLAUDE.md §7)');
    process.exit(1);
  }
  if (!row.content) {
    console.error('asset content is null — abort');
    process.exit(1);
  }

  // 2. Parse + validate pre-state
  const { sb, blockRaw } = extractJsonBlock(row.content);
  if (sb.acts.length < 3) {
    console.error(`expected ≥3 acts, got ${sb.acts.length} — abort`);
    process.exit(1);
  }
  const act3 = sb.acts[2];
  if (act3.shots.length !== 2) {
    console.error(`expected exactly 2 shots in act 3, got ${act3.shots.length} — abort`);
    process.exit(1);
  }
  if (!act3.shots[0].shot_id.endsWith('SH21')) {
    console.error(`expected SH21 at acts[2].shots[0], got ${act3.shots[0].shot_id} — abort`);
    process.exit(1);
  }
  if (!act3.shots[1].shot_id.endsWith('SH22')) {
    console.error(`expected SH22 at acts[2].shots[1], got ${act3.shots[1].shot_id} — abort`);
    process.exit(1);
  }
  console.log(`pre-state ok: ${act3.shots[0].shot_id} → ${act3.shots[1].shot_id}`);

  // 3. Swap + append policy_notes
  [act3.shots[0], act3.shots[1]] = [act3.shots[1], act3.shots[0]];
  if (!Array.isArray(sb.policy_notes)) sb.policy_notes = [];
  sb.policy_notes.push(POLICY_NOTE);
  console.log(`post-swap:   ${act3.shots[0].shot_id} → ${act3.shots[1].shot_id}`);

  // 4. Re-stringify, splice into markdown body
  const newJsonText = JSON.stringify(sb, null, 2);
  const newBlock = '```json\n' + newJsonText + '\n```';
  const newContent = row.content.replace(blockRaw, newBlock);
  if (newContent === row.content) {
    console.error('content replacement produced no diff — abort');
    process.exit(1);
  }
  console.log(`content delta: ${newContent.length - row.content.length} chars`);

  // 5. PATCH via Supabase REST
  console.log('applying PATCH...');
  const patch = await rest('PATCH', `assets?id=eq.${TARGET_ID}`, { content: newContent });
  if (!patch.ok) {
    console.error(`PATCH failed: ${patch.status} ${await patch.text()}`);
    process.exit(1);
  }
  const patched = (await patch.json()) as Array<{ id: string; updated_at: string }>;
  console.log(`✅ PATCH ok. updated_at=${patched[0]?.updated_at}`);
  console.log('\nNext: run scripts/swap-sh21-sh22-read.ts to verify post-swap state.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
