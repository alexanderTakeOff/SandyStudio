// Sprint α smoke — verifies the two team-chat lanes end-to-end:
//   1. Postgres trigger: insert a synthetic activity_event → expect a
//      kind=pipeline_event system turn to materialise in the latest open
//      concierge_thread within ~1s.
//   2. /api/team-chat/post: POST with Bearer token → expect a
//      kind=claude_message system turn to land in the same thread.
//
// Pass `--ensure-thread` to create a temporary open thread if none exists
// (useful when nobody has the PA panel open). Cleans up on exit unless
// `--keep-thread` is also passed.
//
// Pass `--cleanup` to remove probe turns/events after verification so the
// real chat history isn't polluted. Default cleanup=on.

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[line.slice(0, eq).trim()] = val;
  }
}

const ENSURE = process.argv.includes('--ensure-thread');
const KEEP = process.argv.includes('--keep-thread');
const CLEANUP = !process.argv.includes('--no-cleanup');
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureThread(): Promise<{ id: string; created: boolean }> {
  const { data: open } = await sb
    .from('concierge_threads')
    .select('id')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) return { id: open.id, created: false };
  if (!ENSURE) {
    console.error('No open concierge_thread. Re-run with --ensure-thread to create a probe one.');
    process.exit(1);
  }
  const { data: created, error } = await sb
    .from('concierge_threads')
    .insert({ title: 'α smoke probe' })
    .select('id')
    .single();
  if (error || !created) {
    console.error('Failed to create probe thread:', error);
    process.exit(1);
  }
  return { id: created.id, created: true };
}

interface CleanupHandles {
  thread: { id: string; created: boolean };
  eventIds: string[];
  turnIds: string[];
}

async function cleanup({ thread, eventIds, turnIds }: CleanupHandles) {
  if (!CLEANUP) return;
  if (turnIds.length > 0) {
    await sb.from('concierge_turns').delete().in('id', turnIds);
  }
  if (eventIds.length > 0) {
    await sb.from('activity_events').delete().in('id', eventIds);
  }
  if (thread.created && !KEEP) {
    await sb.from('concierge_threads').delete().eq('id', thread.id);
  }
}

async function main() {
  const thread = await ensureThread();
  console.log(`thread_id: ${thread.id} (${thread.created ? 'created for probe' : 'pre-existing'})`);

  const handles: CleanupHandles = { thread, eventIds: [], turnIds: [] };

  // ── Lane 1: Postgres trigger ────────────────────────────────────────
  console.log('\n[lane 1] inserting synthetic activity_event …');
  const { data: ev, error: evErr } = await sb
    .from('activity_events')
    .insert({
      event_type: 'manual_trigger',
      severity: 'info',
      title: 'α-smoke synthetic',
      description: 'Postgres trigger lane probe',
      actor: 'alpha-smoke',
      metadata: { kind: 'alpha_smoke_probe' },
    })
    .select('id')
    .single();
  if (evErr || !ev) {
    console.error('event insert failed:', evErr);
    await cleanup(handles);
    process.exit(1);
  }
  handles.eventIds.push(ev.id);

  // Trigger fires synchronously, but read replication can lag — poll briefly.
  let pipelineTurn: { id: string; content: string } | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(200);
    const { data } = await sb
      .from('concierge_turns')
      .select('id,content,metadata')
      .eq('thread_id', thread.id)
      .eq('role', 'system')
      .contains('metadata', { activity_event_id: ev.id })
      .maybeSingle();
    if (data) {
      pipelineTurn = { id: data.id, content: data.content };
      break;
    }
  }
  if (!pipelineTurn) {
    console.error('FAIL: pipeline_event turn never appeared from trigger.');
    await cleanup(handles);
    process.exit(1);
  }
  handles.turnIds.push(pipelineTurn.id);
  console.log(`  ✓ trigger wrote turn ${pipelineTurn.id}`);
  console.log(`    content: ${pipelineTurn.content}`);

  // ── Lane 2: /api/team-chat/post ─────────────────────────────────────
  console.log('\n[lane 2] POST /api/team-chat/post …');
  const token = process.env.TEAM_CHAT_TOKEN;
  if (!token) {
    console.error('TEAM_CHAT_TOKEN not set in .env.local');
    await cleanup(handles);
    process.exit(1);
  }
  const res = await fetch(`${APP_URL}/api/team-chat/post`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      thread_id: thread.id,
      content: 'α smoke — hello from Claude (CLI agent).',
      author: 'Claude',
      tag: 'alpha_smoke',
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: { turn_id?: string; content?: string };
    error?: string;
  };
  if (!res.ok || !body.data?.turn_id) {
    console.error(`FAIL: /api/team-chat/post ${res.status} ${body.error ?? ''}`);
    await cleanup(handles);
    process.exit(1);
  }
  handles.turnIds.push(body.data.turn_id);
  console.log(`  ✓ endpoint returned turn ${body.data.turn_id}`);
  console.log(`    content: ${body.data.content}`);

  // Verify the row really lands with the correct shape.
  const { data: claudeTurn } = await sb
    .from('concierge_turns')
    .select('role,content,metadata')
    .eq('id', body.data.turn_id)
    .maybeSingle();
  if (!claudeTurn) {
    console.error('FAIL: claude_message turn not found post-insert');
    await cleanup(handles);
    process.exit(1);
  }
  const meta = (claudeTurn.metadata ?? {}) as Record<string, unknown>;
  if (claudeTurn.role !== 'system' || meta.kind !== 'claude_message') {
    console.error('FAIL: shape mismatch', { role: claudeTurn.role, meta });
    await cleanup(handles);
    process.exit(1);
  }

  await cleanup(handles);
  console.log('\nALL ASSERTIONS PASSED');
  console.log(`(cleanup=${CLEANUP}, thread_kept=${!handles.thread.created || KEEP})`);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
