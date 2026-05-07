// dump-shot1-prompts.ts
//
// One-shot trace dump: every prompt produced by every agent for Shot 1
// of episode SS-S14-E01 "Perfume Vial" — from Series Bible all the way
// down to the Veo 3 prompt actually fired at the video provider.
//
// Run from webapp/:
//   npm run dump-shot1
//
// Output: webapp/scripts/out/SS-S14-E01-shot1-trace.json
// (auto-sync hook will commit + push it; the assistant reads it next session)

import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const EPISODE_CODE = process.env.EPISODE_CODE ?? 'SS-S14-E01';
const SHOT_NEEDLES = ['shot_01', 'shot-01', 'shot_1_', '_s01_shot1', 'shot1_'];

type Json = Record<string, unknown>;

function matchesShot1(s: string | null | undefined): boolean {
  if (!s) return false;
  const lower = s.toLowerCase();
  return SHOT_NEEDLES.some((n) => lower.includes(n));
}

function deepHasShot1(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return matchesShot1(value);
  if (Array.isArray(value)) return value.some(deepHasShot1);
  if (typeof value === 'object') return Object.values(value as Json).some(deepHasShot1);
  return false;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1. Episode
  const { data: ep, error: epErr } = await sb
    .from('episodes')
    .select('*')
    .eq('episode_code', EPISODE_CODE)
    .maybeSingle();
  if (epErr) throw epErr;
  if (!ep) {
    console.error(`Episode ${EPISODE_CODE} not found`);
    process.exit(1);
  }
  console.log(`Episode: ${ep.episode_code}  id=${ep.id}  series_id=${ep.series_id}`);

  // 2. Series row (may not exist if series_id is a legacy text slug)
  let series: Json | null = null;
  if (ep.series_id && /^[0-9a-f-]{36}$/i.test(String(ep.series_id))) {
    const { data: s } = await sb.from('series').select('*').eq('id', ep.series_id).maybeSingle();
    series = s ?? null;
  }

  // 3. Series-scoped assets (Bible: characters, locations, style, objects, idea)
  const { data: seriesAssets } = series
    ? await sb
        .from('assets')
        .select('*')
        .eq('series_id', series.id as string)
        .order('file_type', { ascending: true })
        .order('version', { ascending: true })
    : { data: [] as Json[] };

  // 4. Episode-scoped assets (brief, script, storyboard, reviews, IMG/VID/EREF, copy)
  const { data: episodeAssets } = await sb
    .from('assets')
    .select('*')
    .eq('episode_id', ep.id)
    .order('file_type', { ascending: true })
    .order('version', { ascending: true });

  // 5. Shot 1 focus — assets whose filename or metadata reference shot_01
  const shot1Assets = (episodeAssets ?? []).filter(
    (a: Json) => matchesShot1(String(a.filename)) || deepHasShot1(a.metadata) || deepHasShot1(a.content),
  );

  // 6. Jobs for this episode (input_snapshot is where the *final* generator prompt lives)
  const { data: jobs } = await sb
    .from('jobs')
    .select('*')
    .eq('episode_id', ep.id)
    .order('created_at', { ascending: true });

  const shot1Jobs = (jobs ?? []).filter(
    (j: Json) => matchesShot1(String(j.output_ref)) || deepHasShot1(j.input_snapshot),
  );

  // 7. Approvals for all asset ids we collected
  const allAssetIds = [
    ...(seriesAssets ?? []).map((a: Json) => a.id),
    ...(episodeAssets ?? []).map((a: Json) => a.id),
  ].filter(Boolean) as string[];
  const { data: approvals } = allAssetIds.length
    ? await sb.from('approvals').select('*').in('asset_id', allAssetIds)
    : { data: [] as Json[] };

  // 8. Activity events for the episode (provides agent_started / job_completed timeline)
  const { data: events } = await sb
    .from('activity_events')
    .select('*')
    .eq('episode_id', ep.id)
    .order('created_at', { ascending: true });

  // 9. Budget log — model + provider per job (useful to see who went to Veo 3 vs mock)
  const { data: budget } = await sb
    .from('budget_log')
    .select('*')
    .eq('episode_id', ep.id)
    .order('created_at', { ascending: true });

  // 10. Provider assignments — which provider was selected for each stage
  const { data: providers } = await sb.from('provider_assignments').select('*');

  const trace = {
    generated_at: new Date().toISOString(),
    episode: ep,
    series,
    counts: {
      series_assets: seriesAssets?.length ?? 0,
      episode_assets: episodeAssets?.length ?? 0,
      shot1_assets: shot1Assets.length,
      jobs: jobs?.length ?? 0,
      shot1_jobs: shot1Jobs.length,
      approvals: approvals?.length ?? 0,
      events: events?.length ?? 0,
      budget_rows: budget?.length ?? 0,
    },
    series_assets: seriesAssets ?? [],
    episode_assets: episodeAssets ?? [],
    shot1_assets: shot1Assets,
    jobs: jobs ?? [],
    shot1_jobs: shot1Jobs,
    approvals: approvals ?? [],
    activity_events: events ?? [],
    budget_log: budget ?? [],
    provider_assignments: providers ?? [],
  };

  const outDir = join(process.cwd(), 'scripts', 'out');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${EPISODE_CODE}-shot1-trace.json`);
  writeFileSync(outPath, JSON.stringify(trace, null, 2));

  console.log('\n--- summary ---');
  console.log(JSON.stringify(trace.counts, null, 2));
  console.log(`\nWrote ${outPath}`);
  console.log('Agents seen in jobs:');
  const byAgent = new Map<string, number>();
  for (const j of jobs ?? []) {
    const k = String((j as Json).agent_id ?? 'unknown');
    byAgent.set(k, (byAgent.get(k) ?? 0) + 1);
  }
  for (const [k, v] of [...byAgent.entries()].sort()) console.log(`  ${k}: ${v}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
