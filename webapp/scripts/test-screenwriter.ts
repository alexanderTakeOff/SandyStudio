// Smoke test for the real EXEC-SW (Screenwriter) runner.
//
// Loads the APPROVED brief for the requested episode (default SS-S03-E01)
// from Supabase, calls runScreenwriter against the real Anthropic API, and
// asserts the output (a) is non-empty markdown, (b) contains a parseable
// fenced JSON block, (c) is grounded in the brief — not a generic
// "Red Carpet" mock stub.
//
// This is a paid call (~$0.02-0.05 per run on Sonnet). Don't loop it.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Force-load .env.local *with override* — Node's `--env-file` flag does NOT
// overwrite existing environment variables (e.g. an empty ANTHROPIC_API_KEY
// pre-set at the Windows system level). Override here so smoke tests use
// the project's actual keys.
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
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    // ignore — caller will see "X not set" if key missing
  }
}
loadDotenvOverride('.env.local');

// Static import is fine — it's resolved at call time (after env load above)
// because runScreenwriter only reads env on its first invocation.
import { runScreenwriter } from '../lib/agents/runners/screenwriter';

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
  if (ep.error || !ep.data) {
    throw new Error(`Episode ${epCode} not found: ${ep.error?.message}`);
  }
  const episode = ep.data;
  console.log(`[smoke] episode = ${episode.episode_code} "${episode.title_working}" (${episode.id})`);

  const assets = await sb
    .from('assets')
    .select('id,file_type,filename,status,content,version,drive_path,staging_path')
    .eq('episode_id', episode.id)
    .eq('status', 'APPROVED');
  if (assets.error || !assets.data) {
    throw new Error(`Asset fetch failed: ${assets.error?.message}`);
  }
  const upstream = assets.data as AssetRow[];
  const brief = upstream.find((a) => a.file_type === 'SPC-brief');
  if (!brief?.content) {
    throw new Error(`No APPROVED SPC-brief with non-empty content for ${epCode}`);
  }
  console.log(`[smoke] brief = ${brief.filename} (${brief.content.length} chars)`);

  console.log(`[smoke] calling Anthropic Sonnet...`);
  const t0 = Date.now();
  const result = await runScreenwriter({
    inputs: {
      episode_id: episode.id,
      agent_id: 'EXEC-SW',
      episode,
      upstream_assets: upstream,
    },
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // ── assertions ──────────────────────────────────────────────────────────
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];

  checks.push({
    name: 'markdown non-empty',
    pass: result.markdown.length > 1500,
    detail: `${result.markdown.length} chars`,
  });

  checks.push({
    name: 'JSON body parsed',
    pass: typeof result.body === 'object' && result.body !== null,
  });

  const scenes = (result.body as { scenes?: unknown }).scenes;
  checks.push({
    name: 'JSON has scenes[]',
    pass: Array.isArray(scenes) && scenes.length > 0,
    detail: Array.isArray(scenes) ? `${scenes.length} scenes` : 'not an array',
  });

  // Anti-mock guard — Director's biggest fear: silent regression to mock.
  const md = result.markdown.toLowerCase();
  const hasRedCarpet = md.includes('red carpet') || md.includes('red_carpet');
  const hasStopwatch = md.includes('stopwatch') || md.includes('inspector stopwatch');
  checks.push({
    name: 'no "red carpet" leak from mock',
    pass: !hasRedCarpet,
    detail: hasRedCarpet ? 'FOUND — output is mock!' : 'clean',
  });
  checks.push({
    name: 'no "stopwatch" leak from mock',
    pass: !hasStopwatch,
    detail: hasStopwatch ? 'FOUND — output is mock!' : 'clean',
  });

  // Brief grounding — script should reference at least one character or beat
  // from the actual brief content.
  const briefLower = brief.content.toLowerCase();
  const hasSandy = briefLower.includes('sandy') ? md.includes('sandy') : true;
  checks.push({
    name: 'output grounded in brief (Sandy reference if in brief)',
    pass: hasSandy,
    detail: hasSandy ? 'present' : 'missing',
  });

  // ── report ──────────────────────────────────────────────────────────────
  console.log('');
  console.log('=== Result ===');
  console.log(`  model:      ${result.model}`);
  console.log(`  contract:   ${result.contract}`);
  console.log(`  cost:       $${result.costUsd.toFixed(4)}`);
  console.log(`  duration:   ${elapsed}s`);
  console.log(`  markdown:   ${result.markdown.length} chars`);
  console.log(`  scenes:     ${Array.isArray(scenes) ? scenes.length : 'N/A'}`);
  console.log(`  notes:      ${result.notes.join('; ') || '(none)'}`);
  console.log('');
  console.log('=== Checks ===');
  for (const c of checks) {
    const sym = c.pass ? '✓' : '✗';
    console.log(`  ${sym} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  console.log('');
  console.log('=== Markdown preview (first 800 chars) ===');
  console.log(result.markdown.slice(0, 800));
  console.log('...');
  console.log('');
  console.log('=== JSON body preview ===');
  console.log(JSON.stringify(result.body, null, 2).slice(0, 1200));

  const allPassed = checks.every((c) => c.pass);
  if (!allPassed) {
    console.error('');
    console.error('!!! ONE OR MORE CHECKS FAILED');
    process.exit(1);
  }
  console.log('');
  console.log('✓ ALL CHECKS PASSED');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
