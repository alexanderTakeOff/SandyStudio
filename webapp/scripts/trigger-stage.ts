// Manually trigger any pipeline-stage Inngest event for an episode.
// Use when auto-fanout did not fire (Mode 1 / asset-approve route bug)
// or when you want to re-run a stage in real provider mode.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/trigger-stage.ts SREV SS-S03-E01
//   npx tsx --env-file=.env.local scripts/trigger-stage.ts SB   SS-S03-E01
//   npx tsx --env-file=.env.local scripts/trigger-stage.ts WCHK SS-S03-E01
//
// Stages map to Inngest event names from lib/inngest/client.ts.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { Inngest, EventSchemas } from 'inngest';

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

interface StageEvents extends Record<string, { data: Record<string, unknown> }> {
  'sandystudio/exec-sw/write-script': { data: { episodeId: string; briefAssetId: string } };
  'sandystudio/exec-srev/review-script': { data: { episodeId: string; scriptAssetId: string } };
  'sandystudio/exec-sb/create-storyboard': { data: { episodeId: string; scriptAssetId: string } };
  'sandystudio/exec-wchk/check-world': { data: { episodeId: string; storyboardAssetIds: string[] } };
  'sandystudio/exec-edit/create-animatic': { data: { episodeId: string; storyboardAssetIds: string[] } };
  'sandystudio/exec-copy/write-metadata': { data: { episodeId: string; scriptAssetId: string } };
}

interface AssetRow {
  id: string;
  file_type: string;
  status: string;
  version: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findApproved(
  sb: any,
  episodeId: string,
  fileType: string,
): Promise<AssetRow | null> {
  const { data } = await sb
    .from('assets')
    .select('id,file_type,status,version')
    .eq('episode_id', episodeId)
    .eq('file_type', fileType)
    .eq('status', 'APPROVED')
    .order('version', { ascending: false })
    .limit(1);
  return (data?.[0] as AssetRow | undefined) ?? null;
}

async function main() {
  const stageRaw = (process.argv[2] ?? '').toUpperCase();
  const epCode = process.argv[3] ?? 'SS-S03-E01';
  if (!stageRaw) {
    console.error('Usage: trigger-stage.ts <STAGE> [EPISODE_CODE]');
    console.error('Stages: SW SREV SB WCHK EDIT COPY');
    process.exit(1);
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const ep = await sb
    .from('episodes')
    .select('id,episode_code')
    .eq('episode_code', epCode)
    .single();
  if (ep.error || !ep.data) throw new Error(`Episode ${epCode} not found`);
  const eid = ep.data.id;
  console.log(`[trigger] episode ${epCode} = ${eid}`);

  const inngest = new Inngest({
    id: 'sandystudio',
    schemas: new EventSchemas().fromRecord<StageEvents>(),
  });

  let eventName: keyof StageEvents;
  let eventData: Record<string, unknown>;

  switch (stageRaw) {
    case 'SW': {
      const brief = await findApproved(sb, eid, 'SPC-brief');
      if (!brief) throw new Error('No APPROVED SPC-brief');
      eventName = 'sandystudio/exec-sw/write-script';
      eventData = { episodeId: eid, briefAssetId: brief.id };
      break;
    }
    case 'SREV': {
      const script = await findApproved(sb, eid, 'SCR-script');
      if (!script) throw new Error('No APPROVED SCR-script');
      eventName = 'sandystudio/exec-srev/review-script';
      eventData = { episodeId: eid, scriptAssetId: script.id };
      break;
    }
    case 'SB': {
      const script = await findApproved(sb, eid, 'SCR-script');
      if (!script) throw new Error('No APPROVED SCR-script');
      eventName = 'sandystudio/exec-sb/create-storyboard';
      eventData = { episodeId: eid, scriptAssetId: script.id };
      break;
    }
    case 'WCHK': {
      const sbAssets = await sb
        .from('assets')
        .select('id,file_type,status')
        .eq('episode_id', eid)
        .eq('status', 'APPROVED')
        .like('file_type', 'STB%');
      const ids = (sbAssets.data ?? []).map((a) => a.id as string);
      if (ids.length === 0) throw new Error('No APPROVED STB-* assets');
      eventName = 'sandystudio/exec-wchk/check-world';
      eventData = { episodeId: eid, storyboardAssetIds: ids };
      break;
    }
    case 'EDIT': {
      const sbAssets = await sb
        .from('assets')
        .select('id,file_type,status')
        .eq('episode_id', eid)
        .eq('status', 'APPROVED')
        .like('file_type', 'STB%');
      const ids = (sbAssets.data ?? []).map((a) => a.id as string);
      if (ids.length === 0) throw new Error('No APPROVED STB-* assets');
      eventName = 'sandystudio/exec-edit/create-animatic';
      eventData = { episodeId: eid, storyboardAssetIds: ids };
      break;
    }
    case 'COPY': {
      const script = await findApproved(sb, eid, 'SCR-script');
      if (!script) throw new Error('No APPROVED SCR-script');
      eventName = 'sandystudio/exec-copy/write-metadata';
      eventData = { episodeId: eid, scriptAssetId: script.id };
      break;
    }
    default:
      throw new Error(`Unknown stage: ${stageRaw}`);
  }

  console.log(`[trigger] event = ${String(eventName)}`);
  console.log(`[trigger] data  = ${JSON.stringify(eventData)}`);
  const send = await inngest.send({ name: eventName, data: eventData as never });
  console.log(`[trigger] sent: ${JSON.stringify(send.ids)}`);
  console.log(`[trigger] watch /episodes/${eid} — should land in 30-150s depending on stage.`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
