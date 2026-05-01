// Reset an episode back to "brief APPROVED, everything downstream cleared"
// state, then trigger EXEC-SW so the real Screenwriter runs against the brief.
//
// Use after Step 1 of the contract pipeline rollout — this gives a clean
// slate for the Director to walk the pipeline by hand.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/reset-episode-after-brief.ts SS-S03-E01
//
// Effects:
//   1. All non-brief assets for the episode → REVISION (or REJECTED if mock)
//   2. All RUNNING / PENDING jobs for the episode → FAILED (cleanup)
//   3. Inngest event sandystudio/exec-sw/write-script sent → real EXEC-SW runs
//
// Director then watches /episodes/<id> and the new SCR-script asset appears
// with content grounded in the brief.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { Inngest, EventSchemas } from 'inngest';

// Force-load .env.local with override (Windows gotcha — see memory file
// node_env_file_does_not_override.md).
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
    // ignore
  }
}
loadDotenvOverride('.env.local');

interface AssetRow {
  id: string;
  filename: string;
  file_type: string;
  status: string;
}

interface ResetEvents extends Record<string, { data: Record<string, unknown> }> {
  'sandystudio/exec-sw/write-script': {
    data: { episodeId: string; briefAssetId: string };
  };
}

async function main() {
  const epCode = process.argv[2] ?? 'SS-S03-E01';
  console.log(`[reset] target episode: ${epCode}`);

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // ── 1. Locate episode + brief ───────────────────────────────────────────────
  const ep = await sb
    .from('episodes')
    .select('id,episode_code,title_working')
    .eq('episode_code', epCode)
    .single();
  if (ep.error || !ep.data) {
    throw new Error(`Episode ${epCode} not found: ${ep.error?.message}`);
  }
  console.log(`[reset] episode = ${ep.data.id} "${ep.data.title_working}"`);

  const allAssets = await sb
    .from('assets')
    .select('id,filename,file_type,status')
    .eq('episode_id', ep.data.id);
  if (allAssets.error || !allAssets.data) {
    throw new Error(`Asset fetch failed: ${allAssets.error?.message}`);
  }
  const rows = allAssets.data as AssetRow[];

  const brief = rows.find(
    (a) => a.file_type === 'SPC-brief' && a.status === 'APPROVED',
  );
  if (!brief) {
    throw new Error(
      `Cannot reset: no APPROVED SPC-brief found for ${epCode}. Approve the brief first.`,
    );
  }
  console.log(`[reset] brief = ${brief.filename} (${brief.id})`);

  // ── 2. Demote downstream assets (all non-brief) ─────────────────────────────
  // Final statuses (LOCKED/REJECTED) we leave alone — those represent past
  // human decisions. Anything else moves to REVISION so the Director can see
  // a clean slate without losing the historical record.
  const PROTECTED = new Set(['LOCKED', 'REJECTED']);
  const downstream = rows.filter(
    (a) => a.id !== brief.id && !PROTECTED.has(a.status),
  );
  console.log(`[reset] downstream assets to clear: ${downstream.length}`);
  for (const a of downstream) {
    console.log(`        - ${a.filename} (${a.status} → REVISION)`);
    const { error } = await sb
      .from('assets')
      .update({ status: 'REVISION' })
      .eq('id', a.id);
    if (error) console.warn(`        ! update failed: ${error.message}`);
  }

  // ── 3. Cancel non-terminal jobs ─────────────────────────────────────────────
  const stuck = await sb
    .from('jobs')
    .select('id,agent_id,status,started_at')
    .eq('episode_id', ep.data.id)
    .in('status', ['RUNNING', 'PENDING']);
  if (stuck.error) {
    console.warn(`[reset] jobs query failed: ${stuck.error.message}`);
  } else {
    const jobs = stuck.data ?? [];
    console.log(`[reset] in-flight jobs to cancel: ${jobs.length}`);
    for (const j of jobs) {
      console.log(`        - ${j.agent_id} ${j.id}`);
      const { error } = await sb
        .from('jobs')
        .update({
          status: 'FAILED',
          completed_at: new Date().toISOString(),
          error_message:
            'Cancelled by reset-episode-after-brief — pipeline reset to brief stage',
        })
        .eq('id', j.id);
      if (error) console.warn(`        ! update failed: ${error.message}`);
    }
  }

  // ── 4. Trigger real EXEC-SW ────────────────────────────────────────────────
  const inngest = new Inngest({
    id: 'sandystudio',
    schemas: new EventSchemas().fromRecord<ResetEvents>(),
  });
  const send = await inngest.send({
    name: 'sandystudio/exec-sw/write-script',
    data: { episodeId: ep.data.id, briefAssetId: brief.id },
  });
  console.log(`[reset] inngest event sent: ${JSON.stringify(send.ids)}`);

  // ── 5. Audit trail ─────────────────────────────────────────────────────────
  await sb.from('activity_events').insert({
    event_type: 'manual_trigger',
    severity: 'warning',
    title: `Reset: ${epCode} → brief stage`,
    description: `Cleared ${downstream.length} downstream assets and ${stuck.data?.length ?? 0} in-flight jobs; triggered EXEC-SW.`,
    actor: null,
    episode_id: ep.data.id,
    metadata: {
      reason: 'reset-episode-after-brief script',
      brief_asset_id: brief.id,
      downstream_count: downstream.length,
      job_count: stuck.data?.length ?? 0,
      inngest_event_ids: send.ids,
    },
  } as never);

  console.log('');
  console.log(`[reset] DONE. Watch /episodes/${ep.data.id} — EXEC-SW will run shortly.`);
  console.log('[reset] If Anthropic returns 400 (credit balance), top up at console.anthropic.com');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
