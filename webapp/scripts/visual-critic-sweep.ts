/**
 * visual-critic-sweep.ts — run the advisory Visual Critic over an episode's rendered
 * IMG-episode_ref assets and log a verdict per asset (activity feed). On-demand front
 * door to lib/agents/runners/visual-shot-critic.ts (the same runner the pipeline calls
 * post-batch). Advisory: never changes status.
 *
 * Usage:
 *   npx tsx scripts/visual-critic-sweep.ts --episode E28 [--shot S15-E28-SH16] [--model gpt-5.6-terra]
 */
import * as fs from 'fs';
import * as path from 'path';
const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase/types.gen';
import { runVisualCriticForEpisode } from '../lib/agents/runners/visual-shot-critic';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const n = argv[i + 1]; if (n && !n.startsWith('--')) { out[k] = n; i++; } else out[k] = 'true'; } }
  return out;
}

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.model) process.env.VISUAL_CRITIC_MODEL = args.model;
  if (!args.episode) { console.error('Required: --episode <code> [--shot <id>] [--model]'); process.exit(1); return; }

  const { data: eps } = await sb.from('episodes').select('id,episode_code').ilike('episode_code', `%${args.episode}%`).limit(1);
  const ep = (eps ?? [])[0] as { id: string; episode_code: string } | undefined;
  if (!ep) { console.error(`episode ${args.episode} not found`); process.exit(1); return; }

  console.log(`[sweep] ${ep.episode_code} · model=${process.env.VISUAL_CRITIC_MODEL || 'default'}`);
  const results = await runVisualCriticForEpisode(sb, ep.id, args.shot ? { shotIds: [args.shot] } : {});
  for (const r of results) {
    const v = r.verdict;
    console.log(`\n— ${r.shotId ?? r.assetId} → ${v ? v.verdict : 'SKIP(' + r.error + ')'}`);
    if (v) { console.log(`  ${v.summary}`); for (const f of v.findings) console.log(`  · [${f.severity}] ${f.check} (${f.character ?? 'scene'}): ${f.what_seen}`); }
  }
  console.log(`\n[sweep] done — ${results.length} asset(s), ${results.filter((r) => r.verdict && r.verdict.verdict !== 'PASS').length} flagged.`);
}

main().catch((e) => { console.error('[sweep] FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
