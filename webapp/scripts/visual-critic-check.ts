/**
 * visual-critic-check.ts — calibration harness for the post-render Visual Critic.
 *
 * Proves the `visual-shot-verdict` rubric on REAL rendered pixels before/around DAG
 * wiring (runtime > static — Director doctrine). Thin CLI over the shared core in
 * lib/agents/visual-verdict.ts (runVisualVerdict + loadShotContract + loadStyleCanon)
 * so script and in-pipeline runner share one implementation.
 *
 * Usage:
 *   # reference image
 *   npx tsx scripts/visual-critic-check.ts --episode E28 --shot SH16 --image <path.png> [--model gpt-5.6-terra]
 *   # video: pass a dir of frames produced by clip-frames.ts
 *   npx tsx scripts/visual-critic-check.ts --episode E28 --shot SH19 --frames-dir <dir> [--model ...]
 */
import * as fs from 'fs';
import * as path from 'path';

const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }

import { createClient } from '@supabase/supabase-js';
import { runVisualVerdict, loadShotContract, loadStyleCanon } from '../lib/agents/visual-verdict';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const n = argv[i + 1]; if (n && !n.startsWith('--')) { out[k] = n; i++; } else out[k] = 'true'; }
  }
  return out;
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function collectImages(args: Record<string, string>): string[] {
  if (args.image) return [fs.readFileSync(args.image).toString('base64')];
  if (args['frames-dir']) {
    const dir = args['frames-dir'];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort()
      .map((f) => fs.readFileSync(path.join(dir, f)).toString('base64'));
  }
  throw new Error('provide --image <png> or --frames-dir <dir>');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const episode = args.episode, shot = args.shot;
  const model = args.model || 'gpt-5.6-terra';
  if (!episode || !shot) { console.error('Required: --episode <code> --shot <id> (--image <png> | --frames-dir <dir>) [--model]'); process.exit(1); return; }

  const { data: eps } = await sb.from('episodes').select('id,series_id').ilike('episode_code', `%${episode}%`).limit(1);
  const ep = (eps ?? [])[0] as { id: string; series_id: string | null } | undefined;
  if (!ep) { console.error(`episode ${episode} not found`); process.exit(1); return; }

  const contract = await loadShotContract(sb, ep.id, shot);
  if (!contract) { console.error(`shot ${shot} not found in APPROVED storyboard`); process.exit(1); return; }
  const style = ep.series_id ? await loadStyleCanon(sb, ep.series_id) : '(no series style)';
  const frames = collectImages(args);

  console.log(`[visual-critic] ${episode}/${shot} · model=${model} · ${frames.length} frame(s)`);
  const verdict = await runVisualVerdict({ frames, contract, styleCanon: style, model });
  console.log('\n===== VERDICT =====');
  console.log(JSON.stringify(verdict, null, 2));
}

main().catch((e) => { console.error('[visual-critic] FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
