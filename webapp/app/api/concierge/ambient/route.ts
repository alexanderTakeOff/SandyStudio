// ──────────────────────────────────────────────────────────────────────────────
// app/api/concierge/ambient/route.ts
//
// Receives a pipeline activity_event id from the browser, looks up the row
// using the Director session (RLS), decides whether it should land in the
// PA conversation, and persists a `system`-role turn into concierge_turns
// so the next PA reply sees it as context.
//
// This is the server half of the Realtime push pipeline:
//   Supabase Realtime → useActivityRealtime hook (browser) → POST here
//
// Why server-side: persisting requires service-role-style trust over which
// thread to write into and de-dupes by `activity_event_id` so multiple
// browser tabs don't double-inject. The browser doesn't get write access
// to concierge_turns — only the chat route + this route do.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError } from '@/lib/api/errors';
import { persistTurn } from '@/lib/concierge/threads';
import {
  decideAmbientEvent,
  extractAmbientMetadata,
  type ActivityEventRow,
} from '@/lib/concierge/ambient-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  thread_id: z.string().uuid(),
  activity_event_id: z.string().uuid(),
});

export const POST = withApiHandler(async (req) => {
  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, Body);

  // 1. Verify the thread belongs to this Director (cheap RLS-style guard
  //    in addition to the table policy — fail fast if a stale tab posts
  //    a thread id from a previous session).
  const { data: thread, error: threadErr } = await supabase
    .from('concierge_threads')
    .select('id, director_id')
    .eq('id', body.thread_id)
    .maybeSingle();
  if (threadErr) {
    throw new Error(`thread fetch failed: ${threadErr.message}`);
  }
  if (!thread) {
    throw new NotFoundError(`Concierge thread ${body.thread_id}`);
  }
  if (thread.director_id && thread.director_id !== user.id) {
    throw new NotFoundError(`Concierge thread ${body.thread_id}`);
  }

  // 2. De-dup: if a system turn with this activity_event_id was already
  //    persisted, return idempotent ok. Browser hooks across tabs / a
  //    quick reconnect will commonly emit the same event twice.
  const { data: existing } = await supabase
    .from('concierge_turns')
    .select('id')
    .eq('thread_id', body.thread_id)
    .contains('metadata', { activity_event_id: body.activity_event_id })
    .maybeSingle();
  if (existing) {
    return apiOk({ persisted: false, reason: 'duplicate', turn_id: existing.id });
  }

  // 3. Load the activity_event row (RLS already restricts Director to their
  //    own data — same guard the inbox endpoint uses).
  const { data: row, error: evErr } = await supabase
    .from('activity_events')
    .select(
      'id,event_type,severity,title,description,actor,episode_id,asset_id,job_id,metadata,created_at',
    )
    .eq('id', body.activity_event_id)
    .maybeSingle();
  if (evErr) {
    throw new Error(`activity_event fetch failed: ${evErr.message}`);
  }
  if (!row) {
    return apiOk({ persisted: false, reason: 'event_not_found' });
  }

  const decision = decideAmbientEvent(row as ActivityEventRow, {
    directorUserId: user.id,
  });
  if (!decision.inject || !decision.content) {
    return apiOk({ persisted: false, reason: decision.reason ?? 'filtered' });
  }

  // 4. Persist as a system turn — appears in the prompt history loaded by
  //    the chat route on the next Director reply, so PA sees it as context.
  const turn = await persistTurn(supabase, body.thread_id, {
    role: 'system',
    event_type: 'message',
    content: decision.content,
    metadata: extractAmbientMetadata(row as ActivityEventRow),
  });

  return apiOk({
    persisted: true,
    turn_id: turn.id,
    severity: decision.severity ?? 'info',
  });
});
