// Step 1 (READ-ONLY) — locate current STB-storyboard for SS-S15-E01,
// parse the fenced JSON block, report SH21 and SH22 positions.
// Run via: cd webapp && npx tsx scripts/swap-sh21-sh22-read.ts

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
const EPISODE_S15_E01 = 'f019c29f-5e1e-4964-b62b-6c59fc3aa966';

interface AssetRow {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  version: number;
  content: string | null;
  updated_at: string;
}

interface StoryboardShot {
  shot_id: string;
  camera_angle?: string;
  shot_role?: string;
  expected_gag?: string | null;
  action_prose?: string;
  duration_seconds?: number;
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
}

async function rest(q: string): Promise<string> {
  const r = await fetch(`${U}/rest/v1/${q}`, {
    headers: { apikey: K, Authorization: `Bearer ${K}` },
  });
  return r.text();
}

function extractJsonBlock(content: string): StoryboardContract {
  const match = content.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) throw new Error('no fenced ```json block found in content');
  return JSON.parse(match[1]) as StoryboardContract;
}

function findShot(sb: StoryboardContract, suffix: string): { actIdx: number; shotIdx: number; shot: StoryboardShot } | null {
  for (let a = 0; a < sb.acts.length; a++) {
    const act = sb.acts[a];
    for (let s = 0; s < act.shots.length; s++) {
      if (act.shots[s].shot_id.endsWith(suffix)) {
        return { actIdx: a, shotIdx: s, shot: act.shots[s] };
      }
    }
  }
  return null;
}

async function main(): Promise<void> {
  console.log('=== STB-storyboard rows for SS-S15-E01 ===\n');
  const stbList = await rest(
    `assets?episode_id=eq.${EPISODE_S15_E01}&file_type=like.STB*&select=id,filename,file_type,status,version,updated_at&order=version.desc,updated_at.desc`,
  );
  const rows = JSON.parse(stbList) as AssetRow[];
  for (const r of rows) {
    console.log(`  ${r.filename}  status=${r.status}  v=${r.version}  updated=${r.updated_at}  id=${r.id}`);
  }

  const target = rows.find((r) => r.file_type === 'STB-storyboard' && (r.status === 'APPROVED' || r.status === 'LOCKED'));
  if (!target) {
    console.log('\n  ❌ no APPROVED/LOCKED STB-storyboard found — abort');
    process.exit(1);
  }

  console.log(`\n=== chosen target ===`);
  console.log(`  id        : ${target.id}`);
  console.log(`  filename  : ${target.filename}`);
  console.log(`  status    : ${target.status}`);
  console.log(`  version   : ${target.version}`);

  if (target.status === 'LOCKED') {
    console.log(`  ⚠️  STATUS = LOCKED — CLAUDE.md §7 forbids modification. Will need a v${String(target.version + 1).padStart(2, '0')} bump instead.`);
  }

  const full = await rest(`assets?id=eq.${target.id}&select=content`);
  const contentRows = JSON.parse(full) as Array<{ content: string | null }>;
  if (!contentRows[0]?.content) {
    console.log('\n  ❌ content is empty — abort');
    process.exit(1);
  }

  const sb = extractJsonBlock(contentRows[0].content);
  console.log(`\n=== storyboard contract ===`);
  console.log(`  contract     : ${sb.contract}`);
  console.log(`  episode_id   : ${sb.episode_id}`);
  console.log(`  acts         : ${sb.acts.length}`);
  console.log(`  total_shots  : ${sb.total_shots ?? '(unset)'}`);

  const sh21 = findShot(sb, 'SH21');
  const sh22 = findShot(sb, 'SH22');

  console.log(`\n=== SH21 ===`);
  if (sh21) {
    console.log(`  act_index  : ${sh21.actIdx} (act number ${sb.acts[sh21.actIdx].act})`);
    console.log(`  shot_index : ${sh21.shotIdx} (zero-based within act)`);
    console.log(`  shot_id    : ${sh21.shot.shot_id}`);
    console.log(`  role       : ${sh21.shot.shot_role ?? '(unset)'}`);
    console.log(`  camera     : ${sh21.shot.camera_angle ?? '(unset)'}`);
    console.log(`  gag        : ${sh21.shot.expected_gag ?? '(null)'}`);
  } else {
    console.log('  ❌ NOT FOUND');
  }

  console.log(`\n=== SH22 ===`);
  if (sh22) {
    console.log(`  act_index  : ${sh22.actIdx} (act number ${sb.acts[sh22.actIdx].act})`);
    console.log(`  shot_index : ${sh22.shotIdx} (zero-based within act)`);
    console.log(`  shot_id    : ${sh22.shot.shot_id}`);
    console.log(`  role       : ${sh22.shot.shot_role ?? '(unset)'}`);
    console.log(`  camera     : ${sh22.shot.camera_angle ?? '(unset)'}`);
    console.log(`  gag        : ${sh22.shot.expected_gag ?? '(null)'}`);
  } else {
    console.log('  ❌ NOT FOUND');
  }

  if (!sh21 || !sh22) {
    console.log('\n❌ one of the shots is missing — abort');
    process.exit(1);
  }

  if (sh21.actIdx !== sh22.actIdx) {
    console.log(`\n⚠️  SH21 lives in act ${sb.acts[sh21.actIdx].act}, SH22 lives in act ${sb.acts[sh22.actIdx].act}.`);
    console.log('   Same-act swap impossible. Cross-act move requires explicit Director approval.');
    process.exit(2);
  }

  const act = sb.acts[sh21.actIdx];
  console.log(`\n=== act ${act.act} shots[] BEFORE swap ===`);
  act.shots.forEach((s, i) => {
    const marker = i === sh21.shotIdx ? '  → ' : i === sh22.shotIdx ? '  → ' : '    ';
    console.log(`${marker}${i}: ${s.shot_id}  (${s.shot_role ?? '?'})`);
  });

  console.log(`\n=== act ${act.act} shots[] AFTER swap (preview) ===`);
  const previewShots = [...act.shots];
  [previewShots[sh21.shotIdx], previewShots[sh22.shotIdx]] = [previewShots[sh22.shotIdx], previewShots[sh21.shotIdx]];
  previewShots.forEach((s, i) => {
    const marker = i === sh21.shotIdx ? '  → ' : i === sh22.shotIdx ? '  → ' : '    ';
    console.log(`${marker}${i}: ${s.shot_id}  (${s.shot_role ?? '?'})`);
  });

  console.log('\n✅ READ phase OK. Run `scripts/swap-sh21-sh22-write.ts` to apply.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
