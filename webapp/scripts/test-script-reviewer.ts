// Smoke test for the real EXEC-SREV (Script Reviewer) runner.
// Reads the latest APPROVED brief + script for SS-S03-E01, calls
// runScriptReviewer on real Anthropic, asserts verdict + structure.
//
// Paid call ~$0.04. Don't loop.

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

import { runScriptReviewer } from '../lib/agents/runners/script-reviewer';

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
  if (ep.error || !ep.data) throw new Error(`Episode ${epCode} not found: ${ep.error?.message}`);
  console.log(`[smoke] episode = ${ep.data.episode_code} (${ep.data.id})`);

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
  const result = await runScriptReviewer({
    inputs: {
      episode_id: ep.data.id,
      agent_id: 'EXEC-SREV',
      episode: ep.data,
      upstream_assets: upstream,
    },
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];

  checks.push({ name: 'markdown non-empty', pass: result.markdown.length > 600, detail: `${result.markdown.length} chars` });
  checks.push({ name: 'JSON body parsed', pass: result.body !== null });
  checks.push({
    name: 'verdict valid',
    pass: ['PASS', 'REVISE', 'FAIL'].includes(result.verdict),
    detail: result.verdict,
  });

  const issues = (result.body as { issues?: unknown }).issues;
  const issuesOk =
    result.verdict === 'PASS'
      ? Array.isArray(issues) // PASS may have empty issues
      : Array.isArray(issues) && issues.length > 0;
  checks.push({
    name: 'issues[] consistent with verdict',
    pass: issuesOk,
    detail: Array.isArray(issues) ? `${issues.length} issues` : 'not array',
  });

  console.log('');
  console.log('=== Result ===');
  console.log(`  contract:  ${result.contract}`);
  console.log(`  model:     ${result.model}`);
  console.log(`  verdict:   ${result.verdict}`);
  console.log(`  cost:      $${result.costUsd.toFixed(4)}`);
  console.log(`  duration:  ${elapsed}s`);
  console.log(`  markdown:  ${result.markdown.length} chars`);
  console.log('');
  console.log('=== Checks ===');
  for (const c of checks) console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
  console.log('');
  console.log('=== Markdown preview (first 800 chars) ===');
  console.log(result.markdown.slice(0, 800));
  console.log('...');
  console.log('');
  console.log('=== JSON body (first 1500 chars) ===');
  console.log(JSON.stringify(result.body, null, 2).slice(0, 1500));

  if (!checks.every((c) => c.pass)) {
    console.error('!!! ONE OR MORE CHECKS FAILED');
    process.exit(1);
  }
  console.log('');
  console.log('✓ ALL CHECKS PASSED');
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
