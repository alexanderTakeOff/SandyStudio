// Read the latest Critic verdict for SH19 after TD-72 softening landed.
// Also dump the latest Shot Plan content so we can see the actual prompt body
// (V03 delimiter format) Critic objected to.
// Run: cd webapp && npx tsx scripts/probe-sh19-latest-critic.ts

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

async function rest(q: string): Promise<string> {
  const r = await fetch(`${U}/rest/v1/${q}`, {
    headers: { apikey: K, Authorization: `Bearer ${K}` },
  });
  return r.text();
}

async function main(): Promise<void> {
  // Latest 3 SH19 REV-shot_plan (post-TD-72 expected)
  console.log('=== latest SH19 REV-shot_plan rows (post-TD-72) ===');
  const revs = JSON.parse(await rest(
    `assets?episode_id=eq.${EPISODE}&filename=ilike.*REV-shot_plan*SH19*&select=id,filename,status,version,updated_at,content&order=updated_at.desc&limit=3`,
  )) as Array<{ id: string; filename: string; status: string; version: number; updated_at: string; content: string | null }>;
  for (const r of revs) {
    console.log(`\n  ${r.filename}  status=${r.status}  v=${r.version}  updated=${r.updated_at}`);
    if (r.content) {
      console.log('  ─── content ─── (first 4500 chars)');
      console.log(r.content.slice(0, 4500));
      console.log('  ───────────────');
    }
  }

  // Latest SPC-shot_plan SH19 (post-TD-72 retry expected)
  console.log('\n\n=== latest SH19 SPC-shot_plan rows ===');
  const plans = JSON.parse(await rest(
    `assets?episode_id=eq.${EPISODE}&filename=ilike.*SPC-shot_plan*SH19*&select=id,filename,status,version,updated_at,content&order=updated_at.desc&limit=2`,
  )) as Array<{ id: string; filename: string; status: string; version: number; updated_at: string; content: string | null }>;
  for (const p of plans) {
    console.log(`\n  ${p.filename}  status=${p.status}  v=${p.version}  updated=${p.updated_at}`);
    if (p.content) {
      // Just the prompt section
      const promptMatch = p.content.match(/```\s*\n(SUBJECT[\s\S]*?)\n```/);
      if (promptMatch) {
        console.log('  ─── prompt body ───');
        console.log(promptMatch[1]);
        console.log('  ───────────────────');
      } else {
        console.log('  (no fenced prompt block found)');
        console.log(p.content.slice(0, 2500));
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
