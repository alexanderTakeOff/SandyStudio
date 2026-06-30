// ──────────────────────────────────────────────────────────────────────────────
// app/api/concierge/new-thread/route.ts
// "New conversation" control for the Prod Assistant (q9a Part B2, 2026-06-30).
//
// Non-destructive context reset: archives the current thread (sets ended_at) and
// opens a fresh one bound to the same episode. History is preserved in the DB —
// this is "Новый разговор", not "Clear". Pairs with the B1 chat-route guard
// (never append to an ENDED thread) so a long-lived browser session can start a
// clean thread on demand instead of dragging a months-old one along.
//
// Like chat/route.ts this is gated by middleware auth (Director-only); it uses
// the service-role client and reuses the existing thread helpers.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { createThread, endThread, getThread } from '@/lib/concierge/threads';
import { resolveEffectiveConciergeMode } from '@/lib/concierge/resolve-mode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface NewThreadRequest {
  threadId?: string | null;
  episodeId?: string | null;
}

export async function POST(req: Request) {
  let body: NewThreadRequest;
  try {
    body = (await req.json()) as NewThreadRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const episodeId = body.episodeId ?? null;
  const currentThreadId = body.threadId ?? null;

  const supabase = createSupabaseServiceRoleClient();

  try {
    // Archive the current thread if it exists and is still open. Best-effort —
    // a missing/already-ended thread must not block opening a fresh one.
    if (currentThreadId) {
      const existing = await getThread(supabase, currentThreadId);
      if (existing && existing.ended_at === null) {
        await endThread(supabase, currentThreadId);
      }
    }

    // New thread inherits the episode binding + the episode-derived governance
    // mode (same resolver the chat route uses — never a client-sent mode).
    const activeMode = await resolveEffectiveConciergeMode(supabase, episodeId);
    const thread = await createThread(supabase, { episodeId, activeMode });

    return NextResponse.json({ threadId: thread.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'failed to start a new thread' },
      { status: 500 },
    );
  }
}
