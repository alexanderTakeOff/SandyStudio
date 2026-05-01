// Smoke test for the real EXEC-SB (Storyboarder) runner.
// Reads APPROVED brief + script for SS-S03-E01, calls runStoryboarder
// on real Anthropic, asserts 3-act structure + shot totals.
//
// Paid call ~$0.10. Don't loop.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadDotenvOverride(filename: string): void {
  try {
    const text = readFileSync(resolve(process.cwd(), filename), 'utf-8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch { /* ignore */ }
}
loadDotenvOverride('.env.local');

import { runStoryboarder } from '../lib/agents/runners/storyboarder';

interface AssetRow {
  id: string;
  file_type: string;
  filename: string;
  status: string;
  content: string | null;
  version: number | null;
  drive_path: string | null;
  staging_path: string | null;
}

async function main() {
  const epCode = process.argv[2] ?? 'SS-S03-E01';
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const ep = await sb
    .from('episodes')
    .select('id,episode_code,title_working')
    .eq('episode_code', epCode)
    .single();
  if (ep.error || !ep.data) throw new Error(`Episode ${epCode} not found`);
  console.log(`[smoke] episode = ${ep.data.episode_code}`);

  const assets = await sb
    .from('assets')
    .select('id,file_type,filename,status,content,version,drive_path,staging_path')
    .eq('episode_id', ep.data.id)
    .eq('status', 'APPROVED');
  if (assets.error) throw new Error(`Asset fetch: ${assets.error.message}`);
  const upstream = assets.data as AssetRow[];

  const brief = upstream.find((a) => a.file_type === 'SPC-brief');
  const script = upstream
    .filter((a) => a.file_type === 'SCR-script')
    .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  if (!brief?.content) throw new Error('No APPROVED SPC-brief');
  if (!script?.content) throw new Error('No APPROVED SCR-script');
  console.log(`[smoke] brief: ${brief.filename}, script: ${script.filename} (v${script.version})`);

  console.log(`[smoke] calling Anthropic Sonnet...`);
  const t0 = Date.now();
  const result = await runStoryboarder({
    inputs: {
      episode_id: ep.data.id,
      agent_id: 'EXEC-SB',
      episode: ep.data,
      upstream_assets: upstream,
    },
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];

  checks.push({ name: 'markdown non-empty', pass: result.markdown.length > 1500, detail: `${result.markdown.length} chars` });
  checks.push({ name: 'JSON body parsed', pass: result.body !== null });

  const acts = (result.body as { acts?: unknown[] }).acts;
  checks.push({
    name: 'exactly 3 acts',
    pass: Array.isArray(acts) && acts.length === 3,
    detail: Array.isArray(acts) ? `${acts.length} acts` : 'not array',
  });

  checks.push({ name: 'totalShots > 0', pass: result.totalShots > 0, detail: `${result.totalShots} shots` });
  checks.push({ name: 'totalDuration_s > 0', pass: result.totalDurationS > 0, detail: `${result.totalDurationS}s` });

  // Anti-mock check
  const md = result.markdown.toLowerCase();
  checks.push({ name: 'no "red carpet" leak', pass: !md.includes('red carpet') && !md.includes('red_carpet') });
  checks.push({ name: 'no "stopwatch" leak', pass: !md.includes('stopwatch') });

  // Brief grounding — Sandy + Флакон should appear
  const hasSandy = md.includes('sandy') || md.includes('сэнди');
  const hasFlakon = md.includes('флакон') || md.includes('flacon') || md.includes('vial') || md.includes('perfume');
  checks.push({ name: 'mentions Sandy', pass: hasSandy });
  checks.push({ name: 'mentions Flacon/Perfume Vial', pass: hasFlakon });

  console.log('');
  console.log('=== Result ===');
  console.log(`  contract:        ${result.contract}`);
  console.log(`  model:           ${result.model}`);
  console.log(`  total shots:     ${result.totalShots}`);
  console.log(`  total duration:  ${result.totalDurationS}s`);
  console.log(`  cost:            $${result.costUsd.toFixed(4)}`);
  console.log(`  duration:        ${elapsed}s`);
  console.log(`  markdown:        ${result.markdown.length} chars`);
  console.log('');
  console.log('=== Checks ===');
  for (const c of checks) console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
  console.log('');
  console.log('=== Markdown preview (first 1000 chars) ===');
  console.log(result.markdown.slice(0, 1000));
  console.log('...');
  console.log('');
  console.log('=== Acts summary ===');
  if (Array.isArray(acts)) {
    for (const a of acts) {
      const ax = a as { act?: number; beat_summary?: string; shots?: unknown[] };
      console.log(`  Act ${ax.act}: ${ax.beat_summary} — ${Array.isArray(ax.shots) ? ax.shots.length : '?'} shots`);
    }
  }

  if (!checks.every((c) => c.pass)) {
    console.error('!!! ONE OR MORE CHECKS FAILED');
    process.exit(1);
  }
  console.log('');
  console.log('✓ ALL CHECKS PASSED');
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
