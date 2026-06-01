// Direct fal.ai Seedance call for SH19 using BOTH anchors:
//   start_image = SH19 IMG-episode_ref v02 APPROVED (setup pose, finger touch)
//   end_image   = SH20 IMG-episode_ref v02 APPROVED (wall hole with daylight)
//   prompt      = latest SH19 Shot Plan (v09 per Polина 2026-05-27) prompt body
//
// Bypasses entire SandyStudio pipeline. Director wants empirical truth on what
// Seedance 2.0 produces given the right inputs — answer should be «correct
// gag with match-cut continuity to SH20». Outputs to webapp/public/staging/
// for the dev server to serve at /staging/<filename>.
//
// Cost: ~$1.51 (5s × $0.3024/s, standard tier, 720p).
//
// Run: cd webapp && npx tsx scripts/manual-sh19-direct-vgen.ts

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

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
const FAL_KEY = (process.env.FAL_KEY ?? process.env.FAL_API_KEY)?.trim();

const EPISODE = 'f019c29f-5e1e-4964-b62b-6c59fc3aa966';
const SH19_REF_ID = 'de322626-70ab-4b0e-bd8c-28257874f6b8';
// Director directive 2026-05-27: swap end-image from SH20 ref (close-up on
// wall hole, NOT a match-cut for SH19 medium-wide composition) to SH22 ref
// v04 — Anvil pat squashes Sandy, dyra still visible in background. Test
// whether a different end-anchor produces less character evacuation.
const SH22_REF_ID = '3f634026-aa7e-4e2f-815d-81fd36206302';
const END_REF_ID = SH22_REF_ID;

if (!FAL_KEY) {
  console.error('FAL_KEY not set in .env.local');
  process.exit(1);
}

async function rest(q: string): Promise<unknown> {
  const r = await fetch(`${U}/rest/v1/${q}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } });
  return r.json();
}

interface AssetRow {
  id: string;
  filename: string;
  status: string;
  version: number;
  content: string | null;
  staging_path: string | null;
}

function extractPromptFromPlanContent(content: string): string | null {
  // Try the «## Промпт ... ``` ... ``` ... ```json ... ```» layout.
  // The PROMPT block is the FIRST fenced ``` block; the LAST is JSON.
  const blocks = [...content.matchAll(/```(\w*)\s*\n([\s\S]+?)\n```/g)];
  // Prefer the first non-json block.
  for (const b of blocks) {
    const lang = b[1] ?? '';
    if (lang === 'json') continue;
    return b[2].trim();
  }
  // Fallback: extract `prompt` from JSON body.
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i][1] === 'json') {
      try {
        const obj = JSON.parse(blocks[i][2].trim()) as { prompt?: string };
        if (typeof obj.prompt === 'string' && obj.prompt.length > 0) return obj.prompt;
      } catch { /* try next */ }
    }
  }
  return null;
}

function diskPathFromStaging(stagingPath: string | null): string | null {
  if (!stagingPath) return null;
  // staging_path is URL-relative like `/staging/file.png`. Disk path is
  // webapp/public/staging/file.png (relative to webapp cwd).
  const rel = stagingPath.startsWith('/') ? stagingPath.slice(1) : stagingPath;
  return join(process.cwd(), 'public', rel);
}

async function main(): Promise<void> {
  // 1. Latest SH19 Shot Plan with prompt.
  console.log('Fetching latest SH19 Shot Plan…');
  const plans = await rest(
    `assets?episode_id=eq.${EPISODE}&filename=ilike.*SPC-shot_plan*SH19*&select=id,filename,status,version,content&order=version.desc,updated_at.desc&limit=2`,
  ) as AssetRow[];
  if (!plans.length) {
    console.error('No SH19 Shot Plan found');
    process.exit(1);
  }
  const plan = plans[0];
  console.log(`  Plan: ${plan.filename}  status=${plan.status}  v=${plan.version}  id=${plan.id}`);
  if (!plan.content) {
    console.error('Plan content empty');
    process.exit(1);
  }
  const prompt = extractPromptFromPlanContent(plan.content);
  if (!prompt) {
    console.error('Could not extract prompt from Plan content');
    process.exit(1);
  }
  console.log(`  prompt (${prompt.length} chars): ${prompt.slice(0, 200)}…`);

  // 2. Start + end reference images.
  console.log('\nFetching start (SH19) + end IMG-episode_ref staging_paths…');
  const refs = await rest(
    `assets?id=in.(${SH19_REF_ID},${END_REF_ID})&select=id,filename,staging_path`,
  ) as Array<{ id: string; filename: string; staging_path: string | null }>;
  const startRef = refs.find((r) => r.id === SH19_REF_ID);
  const endRef = refs.find((r) => r.id === END_REF_ID);
  if (!startRef?.staging_path || !endRef?.staging_path) {
    console.error('start or end ref missing staging_path');
    process.exit(1);
  }
  console.log(`  start ref: ${startRef.filename}`);
  console.log(`             staging=${startRef.staging_path}`);
  console.log(`  end ref:   ${endRef.filename}`);
  console.log(`             staging=${endRef.staging_path}`);

  // 3. Read PNG bytes from disk.
  const startDiskPath = diskPathFromStaging(startRef.staging_path);
  const endDiskPath = diskPathFromStaging(endRef.staging_path);
  if (!startDiskPath || !endDiskPath) {
    console.error('Could not resolve disk paths');
    process.exit(1);
  }
  if (!existsSync(startDiskPath)) {
    console.error(`start PNG missing on disk: ${startDiskPath}`);
    process.exit(1);
  }
  if (!existsSync(endDiskPath)) {
    console.error(`end PNG missing on disk: ${endDiskPath}`);
    process.exit(1);
  }
  const startBytes = readFileSync(startDiskPath);
  const endBytes = readFileSync(endDiskPath);
  console.log(`\n  start PNG bytes: ${startBytes.length}  (${startDiskPath})`);
  console.log(`  end PNG bytes:   ${endBytes.length}  (${endDiskPath})`);

  // 4. Reuse the production adapter via dynamic import so this script
  //    matches the runtime pipeline exactly.
  const { generateVideoFalSeedance } = await import('@/lib/agents/providers/fal-seedance');

  console.log('\nSubmitting to fal.ai Seedance 2.0 (standard, 5s, 16:9, 720p, start+end)…');
  console.log('  (Polling every 4s; standard tier typically completes in 90–180s.)');
  const t0 = Date.now();
  const result = await generateVideoFalSeedance({
    prompt,
    durationSeconds: 5,
    aspectRatio: '16:9',
    resolution: '720p',
    quality: 'standard',
    referenceImageBase64: startBytes.toString('base64'),
    referenceImageMime: 'image/png',
    endImageBase64: endBytes.toString('base64'),
    endImageMime: 'image/png',
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n✅ DONE in ${dt}s`);
  console.log(`   model:     ${result.model_id}`);
  console.log(`   request_id ${result.operation_name}`);
  console.log(`   size:      ${result.size_bytes} bytes  (${(result.size_bytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`   dim:       ${result.width}×${result.height}`);
  console.log(`   cost:      $${result.cost_usd.toFixed(4)}`);

  // 5. Save to webapp/public/staging/ so dev server serves it.
  const outFileName = `manual-sh19-direct-vgen-${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`;
  const outDiskPath = join(process.cwd(), 'public', 'staging', outFileName);
  writeFileSync(outDiskPath, Buffer.from(result.mp4_b64, 'base64'));
  console.log(`\n   saved:     ${outDiskPath}`);
  console.log(`   view:      http://localhost:3000/staging/${outFileName}`);
  console.log('\nDirector can open the URL in browser to watch the result.');
}

main().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  process.exit(1);
});
