// One-shot recovery for SS-S03-E01:
//   1. Mark stuck RUNNING jobs as FAILED.
//   2. Demote stale mock VID-animatic from REVIEW → REVISION.
//   3. Re-trigger EXEC-EDIT via direct Inngest event.

import { createClient } from '@supabase/supabase-js';
import { Inngest, EventSchemas } from 'inngest';

const EPISODE_CODE = 'SS-S03-E01';

interface AnimaticTriggerEvents extends Record<string, { data: Record<string, unknown> }> {
  'sandystudio/exec-edit/create-animatic': {
    data: { episodeId: string; storyboardAssetIds: string[] };
  };
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: ep } = await sb
    .from('episodes')
    .select('id,episode_code')
    .eq('episode_code', EPISODE_CODE)
    .single();
  if (!ep) throw new Error(`episode ${EPISODE_CODE} not found`);
  console.log(`[fix] episode ${ep.episode_code} = ${ep.id}`);

  // ── 1. Stuck RUNNING jobs older than 10 min → FAILED ──────────────────────
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: stuck } = await sb
    .from('jobs')
    .select('id,agent_id,started_at')
    .eq('episode_id', ep.id)
    .eq('status', 'RUNNING')
    .lt('started_at', cutoff);
  console.log(`[fix] stuck RUNNING jobs: ${stuck?.length ?? 0}`);
  for (const j of stuck ?? []) {
    console.log(`       - ${j.agent_id} ${j.id} (started ${j.started_at})`);
    await sb
      .from('jobs')
      .update({
        status: 'FAILED',
        completed_at: new Date().toISOString(),
        error_message: 'Cleaned up: dev process restart left job orphaned in RUNNING state',
      })
      .eq('id', j.id);
  }

  // ── 2. Mock VID-animatic → REVISION ───────────────────────────────────────
  const { data: anim } = await sb
    .from('assets')
    .select('id,filename,status,drive_path')
    .eq('episode_id', ep.id)
    .eq('file_type', 'VID-animatic')
    .order('created_at', { ascending: false });
  for (const a of anim ?? []) {
    const isMock = (a.drive_path ?? '').includes('mock_');
    if (isMock && a.status === 'REVIEW') {
      console.log(`[fix] demoting mock animatic ${a.filename} REVIEW → REVISION`);
      await sb.from('assets').update({ status: 'REVISION' }).eq('id', a.id);
    }
  }

  // ── 3. Collect APPROVED storyboard asset ids ──────────────────────────────
  const { data: stb } = await sb
    .from('assets')
    .select('id,filename,status')
    .eq('episode_id', ep.id)
    .eq('file_type', 'STB-storyboard')
    .eq('status', 'APPROVED')
    .order('created_at', { ascending: true });
  const stbIds = (stb ?? []).map((s) => s.id);
  console.log(`[fix] APPROVED storyboards: ${stbIds.length}`);
  if (stbIds.length === 0) {
    throw new Error('No APPROVED storyboards — cannot trigger EXEC-EDIT');
  }

  // ── 4. Trigger EXEC-EDIT via Inngest ──────────────────────────────────────
  const inngest = new Inngest({
    id: 'sandystudio',
    schemas: new EventSchemas().fromRecord<AnimaticTriggerEvents>(),
  });
  const sendRes = await inngest.send({
    name: 'sandystudio/exec-edit/create-animatic',
    data: { episodeId: ep.id, storyboardAssetIds: stbIds },
  });
  console.log(`[fix] inngest event sent ids=${JSON.stringify(sendRes.ids)}`);
  console.log(`[fix] DONE — watch /episodes/${ep.id} for new animatic.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
