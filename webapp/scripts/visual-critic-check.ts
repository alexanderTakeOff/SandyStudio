/**
 * visual-critic-check.ts — calibration harness for the post-render Visual Critic.
 *
 * Proves the `visual-shot-verdict` rubric on REAL rendered pixels before any DAG
 * wiring (runtime > static — Director doctrine). Reuses everything: the rubric skill
 * text, the storyboard shot contract (DB), the style Bible (DB), an OpenAI-SDK vision
 * call (the same client shape the concierge uses — openai/gemini/anthropic by model
 * prefix), and `clip-frames` output for video. NO new infra.
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

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1/';
const RUBRIC_PATH = 'C:/SandyStudio/.claude/skills/visual-shot-verdict/SKILL.md';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const n = argv[i + 1]; if (n && !n.startsWith('--')) { out[k] = n; i++; } else out[k] = 'true'; }
  }
  return out;
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** Vision client + token param, provider inferred from model prefix (mirrors concierge). */
function visionClient(model: string): { client: OpenAI; tokenParam: Record<string, number> } {
  if (model.startsWith('gemini')) return { client: new OpenAI({ apiKey: process.env.GEMINI_API_KEY!, baseURL: GEMINI_BASE }), tokenParam: { max_tokens: 1800 } };
  if (model.startsWith('claude')) return { client: new OpenAI({ apiKey: process.env.ANTHROPIC_API_KEY!, baseURL: ANTHROPIC_BASE }), tokenParam: { max_tokens: 1800 } };
  return { client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }), tokenParam: { max_completion_tokens: 1800 } };
}

async function loadShotContract(episodeCode: string, shotId: string): Promise<unknown> {
  const { data: eps } = await sb.from('episodes').select('id').ilike('episode_code', `%${episodeCode}%`).limit(1);
  const epId = (eps ?? [])[0]?.id;
  if (!epId) throw new Error(`episode ${episodeCode} not found`);
  const { data } = await sb.from('assets').select('content').eq('episode_id', epId)
    .like('file_type', 'STB%').in('status', ['APPROVED', 'LOCKED']).order('version', { ascending: false }).limit(1);
  const content = (data ?? [])[0]?.content as string | undefined;
  if (!content) throw new Error('no APPROVED storyboard');
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) throw new Error('storyboard has no ```json block');
  const board = JSON.parse(jsonMatch[1]);
  const want = shotId.toUpperCase();
  for (const act of board.acts ?? []) {
    for (const shot of act.shots ?? []) {
      if (String(shot.shot_id).toUpperCase().endsWith(want)) return shot;
    }
  }
  throw new Error(`shot ${shotId} not found in storyboard`);
}

async function loadStyleCanon(episodeCode: string): Promise<string> {
  const { data: eps } = await sb.from('episodes').select('series_id').ilike('episode_code', `%${episodeCode}%`).limit(1);
  const seriesId = (eps ?? [])[0]?.series_id;
  if (!seriesId) return '(no series style found)';
  const { data } = await sb.from('assets').select('content,file_type').eq('series_id', seriesId)
    .like('file_type', 'SBL-style%').in('status', ['APPROVED', 'LOCKED']).limit(3);
  return (data ?? []).map((r: any) => `## ${r.file_type}\n${r.content ?? ''}`).join('\n\n') || '(no style doc)';
}

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

  const rubric = fs.readFileSync(RUBRIC_PATH, 'utf8');
  const contract = await loadShotContract(episode, shot);
  const style = await loadStyleCanon(episode);
  const images = collectImages(args);

  console.log(`[visual-critic] ${episode}/${shot} · model=${model} · ${images.length} frame(s)`);

  const { client, tokenParam } = visionClient(model);
  const promptText =
    `SHOT CONTRACT (storyboard — the intent to verify against):\n${JSON.stringify(contract, null, 2)}\n\n` +
    `STYLE CANON (Bible — style/genre/on-model reference):\n${style.slice(0, 6000)}\n\n` +
    `Judge the attached ${images.length > 1 ? 'video frames (in order)' : 'reference image'} against the contract and canon using the rubric. ` +
    `Run every check IN ORDER. Output ONLY the JSON verdict object, no prose around it.`;

  const res = await client.chat.completions.create({
    model,
    ...tokenParam,
    messages: [
      { role: 'system', content: rubric },
      {
        role: 'user',
        content: [
          { type: 'text', text: promptText },
          ...images.map((b64) => ({ type: 'image_url' as const, image_url: { url: `data:image/png;base64,${b64}` } })),
        ],
      },
    ],
  });

  const raw = res.choices[0]?.message?.content ?? '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  console.log('\n===== VERDICT =====');
  if (jsonMatch) {
    try { console.log(JSON.stringify(JSON.parse(jsonMatch[0]), null, 2)); }
    catch { console.log(raw); }
  } else {
    console.log(raw);
  }
}

main().catch((e) => { console.error('[visual-critic] FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
