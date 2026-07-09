// One-off backfill: inject ambient pipeline-event system turns for
// activity_events that fired while Realtime push was broken by RLS.
// 2026-05-13 evening recovery.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[line.slice(0, eq).trim()] = val;
  }
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const THREAD = 'bdbdafcf-2a38-4c58-b706-362fd7ff0f16';
const SINCE = '2026-05-13T08:30:00Z';

// Mirror of decideAmbientEvent's actionable list. Kept in sync 2026-07-08 (D17
// curation): dropped 'approval_granted' + 'manual_trigger' (this one-off backfill
// never listed 'agent_started').
const ACTIONABLE = new Set([
  'agent_completed',
  'agent_failed',
  'approval_revision',
  'approval_rejected',
  'blocker_raised',
  'decision_requested',
  'canon_extension_proposed',
]);

interface Row {
  id: string;
  event_type: string;
  severity: string | null;
  title: string;
  description: string | null;
  actor: string | null;
  episode_id: string | null;
  asset_id: string | null;
  job_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

async function main() {
  const write = process.argv.includes('--write');

  const { data: rows, error } = await sb
    .from('activity_events')
    .select('id,event_type,severity,title,description,actor,episode_id,asset_id,job_id,metadata,created_at')
    .gte('created_at', SINCE)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetch err:', error.message);
    process.exit(2);
  }

  const candidates = (rows ?? []).filter((r) => ACTIONABLE.has(r.event_type));
  console.log(`Found ${rows?.length ?? 0} events since ${SINCE}, ${candidates.length} actionable.`);

  // Skip events already in concierge_turns (dedup by metadata.activity_event_id).
  const { data: existing } = await sb
    .from('concierge_turns')
    .select('metadata')
    .eq('thread_id', THREAD)
    .eq('role', 'system');
  const seen = new Set<string>();
  for (const t of existing ?? []) {
    const m = t.metadata as { activity_event_id?: string } | null;
    if (m?.activity_event_id) seen.add(m.activity_event_id);
  }
  console.log(`Already in PA thread as system turns: ${seen.size}`);

  const toInsert = candidates.filter((r) => !seen.has(r.id));
  console.log(`Will insert: ${toInsert.length}`);

  if (toInsert.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  if (!write) {
    console.log('--- DRY RUN — pass --write to insert ---');
    for (const r of toInsert.slice(0, 5)) {
      console.log(`  ${r.created_at.slice(11, 19)} ${r.event_type} · ${r.title.slice(0, 80)}`);
    }
    if (toInsert.length > 5) console.log(`  ...and ${toInsert.length - 5} more`);
    return;
  }

  // Insert each as a system turn — mirror /api/concierge/ambient logic.
  const payload = toInsert.map((r) => {
    const sev = r.severity === 'error' ? 'error' : r.severity === 'warning' ? 'warning' : 'info';
    const desc = r.description?.trim() ?? '';
    const summary =
      desc.length > 0 && desc.length <= 220 ? `${r.title} — ${desc}` : r.title;
    const content = `[ambient pipeline event · ${r.event_type}] ${summary} (actor=${r.actor ?? 'system'})`;
    const m = r.metadata ?? {};
    return {
      thread_id: THREAD,
      role: 'system' as const,
      event_type: 'message' as const,
      content,
      metadata: {
        kind: 'pipeline_event',
        activity_event_id: r.id,
        event_type: r.event_type,
        severity: sev,
        actor: r.actor ?? null,
        episode_id: r.episode_id,
        asset_id: r.asset_id,
        job_id: r.job_id,
        created_at: r.created_at,
        file_type: typeof (m as { file_type?: unknown }).file_type === 'string' ? (m as { file_type: string }).file_type : null,
        agent: typeof (m as { agent?: unknown }).agent === 'string' ? (m as { agent: string }).agent : null,
        backfilled: true,
      },
      // created_at preserved so PA reads them in chronological order in
      // PIPELINE_EVENTS_SINCE_LAST_REPLY (which sorts by created_at).
      created_at: r.created_at,
    };
  });

  const { error: insErr } = await sb.from('concierge_turns').insert(payload as never);
  if (insErr) {
    console.error('insert err:', insErr.message);
    process.exit(2);
  }
  console.log(`Inserted ${payload.length} ambient system turns.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
