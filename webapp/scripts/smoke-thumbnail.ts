// Live smoke for the viral-thumbnail pipeline (distribution tail, 2026-06-01).
//
//   EXEC-THUMB-DESIGNER (real Anthropic Sonnet) → SPC-thumb_plan with N viral
//   variant concepts → insert as APPROVED plan → EXEC-THUMB renderer (real
//   multi-canon gpt-image-2 edits + sharp crop 1280×720 + text overlay) → N
//   IMG-thumbnail REVIEW rows.
//
// PAID: ~$0.02 Anthropic + ~$0.08 × N gpt-image-2 edits (1536×1024 medium).
//       Default N=3 → ~$0.26. Don't loop.
//
//   npx tsx --env-file=.env.local scripts/smoke-thumbnail.ts [SS-S15-E01]

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
  } catch {
    /* ignore */
  }
}
loadDotenvOverride('.env.local');

import { runThumbnailDesigner } from '../lib/agents/runners/thumbnail-designer';
import { runThumbnailRenderer } from '../lib/agents/runners/thumbnail-renderer';
import { loadSeriesBibleCanon } from '../lib/agents/bible-loader';

async function main() {
  const epCode = process.argv[2] ?? 'SS-S15-E01';
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const ep = await sb
    .from('episodes')
    .select('id,episode_code,title_working,metadata')
    .eq('episode_code', epCode)
    .single();
  if (ep.error || !ep.data) throw new Error(`Episode ${epCode} not found: ${ep.error?.message}`);
  const episode = ep.data;
  console.log(`[smoke] episode = ${episode.episode_code} "${episode.title_working}" (${episode.id})`);

  const assets = await sb
    .from('assets')
    .select('id,file_type,filename,status,content')
    .eq('episode_id', episode.id)
    .eq('status', 'APPROVED');
  if (assets.error) throw new Error(`Asset fetch failed: ${assets.error.message}`);
  const upstream = assets.data ?? [];
  const script = upstream.find((a) => a.file_type === 'SCR-script');
  console.log(`[smoke] approved upstream: ${upstream.map((a) => a.file_type).join(', ') || '(none)'}`);
  console.log(`[smoke] script present: ${script ? 'yes' : 'NO (designer leans on Bible + brief)'}`);

  const bible = await loadSeriesBibleCanon(sb as never, episode.id);
  console.log(
    `[smoke] bible: ${bible.characters.length} characters, ${bible.styles.length} styles, total_entries=${bible.total_entries}`,
  );

  const inputs = {
    episode_id: episode.id,
    agent_id: 'EXEC-THUMB-DESIGNER',
    episode,
    upstream_assets: upstream,
    bible,
  } as never;

  // Render-only shortcut: pass an existing APPROVED SPC-thumb_plan id as argv[3]
  // to skip the (paid) designer and just exercise the renderer.
  const existingPlan = process.argv[3];
  let planAssetId: string;
  if (existingPlan) {
    planAssetId = existingPlan;
    console.log(`\n[smoke] Stage 1 SKIPPED — using existing plan ${planAssetId}`);
  } else {
  // ── Stage 1: Designer (real Anthropic) ──────────────────────────────────────
  console.log(`\n[smoke] Stage 1 — Designer (Anthropic Sonnet)...`);
  const t0 = Date.now();
  const plan = await runThumbnailDesigner({ inputs });
  const planVariants = (plan.body as { variants?: unknown[]; halt?: string }).variants ?? [];
  const halt = (plan.body as { halt?: string }).halt;
  console.log(`  cost $${plan.costUsd.toFixed(4)} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  halt: ${halt ?? 'none'}`);
  console.log(`  variants: ${planVariants.length}`);
  for (const v of planVariants as Array<{ concept?: string; overlay_text?: string | null }>) {
    console.log(`    - ${v.concept ?? '?'} · overlay="${v.overlay_text ?? '(none)'}"`);
  }
  if (halt || planVariants.length === 0) {
    throw new Error(`Designer HALTed or produced no variants — aborting before render. halt=${halt}`);
  }

  // Persist the plan as an APPROVED SPC-thumb_plan so the renderer can load it.
  const planInsert = await sb
    .from('assets')
    .insert({
      episode_id: episode.id,
      agent_id: 'EXEC-THUMB-DESIGNER',
      file_type: 'SPC-thumb_plan',
      filename: `${episode.episode_code}-SPC-thumb_plan-v01-APPROVED.md`,
      status: 'APPROVED',
      content: plan.markdown,
      description: plan.description,
    } as never)
    .select('id')
    .single();
  if (planInsert.error || !planInsert.data) {
    throw new Error(`Plan insert failed: ${planInsert.error?.message}`);
  }
  planAssetId = (planInsert.data as { id: string }).id;
  console.log(`  plan asset = ${planAssetId}`);
  }

  // ── Stage 2: Renderer (real multi-canon gpt-image-2 edits + sharp) ──────────
  console.log(`\n[smoke] Stage 2 — Renderer (multi-canon gpt-image-2 edits + sharp crop/overlay)...`);
  const t1 = Date.now();
  const render = await runThumbnailRenderer({
    inputs,
    supabase: sb as never,
    episodeCode: episode.episode_code,
    planAssetId,
  });
  console.log(`  cost $${render.costUsd.toFixed(4)} · ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  console.log(`  rendered ${render.totalImages} thumbnail(s)`);

  const rendered = await sb
    .from('assets')
    .select('id,filename,status,drive_web_view_url,staging_path,metadata')
    .in('id', render.insertedAssetIds);
  console.log('\n=== Rendered thumbnails (REVIEW) ===');
  for (const a of rendered.data ?? []) {
    const m = (a as { metadata?: { concept?: string; overlay_text?: string } }).metadata ?? {};
    console.log(`  ${(a as { filename: string }).filename}`);
    console.log(`    concept=${m.concept ?? '?'} overlay="${m.overlay_text ?? ''}"`);
    console.log(`    drive: ${(a as { drive_web_view_url?: string }).drive_web_view_url ?? '(local only)'}`);
    console.log(`    staging: ${(a as { staging_path?: string }).staging_path ?? ''}`);
  }
  console.log('\n✓ SMOKE COMPLETE — review the thumbnails above and pick a winner.');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
