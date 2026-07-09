// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-pa-react.ts
// TD-20.B autonomy 2026-05-20 — Polina auto-reaction Inngest consumer.
//
// Sole subscriber to `sandystudio/pa/notify-needed`. Fired fire-and-forget
// from logEvent (after actionable activity_events) and from /api/team-chat/post
// (after claude_message turns). This function:
//
//   1. Debounces events by thread (or episode if thread not known yet) for
//      5 seconds — multiple ambient events in rapid succession collapse to
//      one reaction. Mirrors the throttle plan in soft-swimming-thunder.md.
//   2. Resolves the target thread the same way the Postgres trigger
//      tg_inject_activity_event_into_concierge does (migration 0030): the
//      latest open concierge_thread for the episode, fallback to latest
//      open globally.
//   3. POSTs /api/concierge/chat-internal with PA_INTERNAL_TOKEN Bearer.
//      That endpoint runs a non-streaming, no-tools OpenAI call and
//      persists the assistant turn into concierge_turns; Realtime
//      broadcasts it to the UI.
//
// Errors are logged but do not throw — auto-react is best-effort. A
// failed reaction doesn't break the underlying pipeline.
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { PUBLIC_ENV } from '@/lib/env';
import { resolveOpenThreadId } from '@/lib/concierge/threads';

interface ResolvedTarget {
  threadId: string;
}

async function resolveThreadId(args: {
  threadId?: string | null;
  episodeId?: string | null;
}): Promise<ResolvedTarget | null> {
  if (args.threadId) {
    // Caller already resolved it (team-chat post path).
    return { threadId: args.threadId };
  }
  // Shared resolver (lib/concierge/threads): latest open thread for the
  // episode, else latest open globally. Same logic the watchdog uses so both
  // agree on "which thread".
  const sb = createSupabaseServiceRoleClient();
  const threadId = await resolveOpenThreadId(sb, args.episodeId ?? null);
  return threadId ? { threadId } : null;
}

export const execPaReact = inngest.createFunction(
  {
    id: 'exec-pa-react',
    name: 'EXEC-CONC: Auto-react to non-Director turn',
    retries: 1,
    // Collapse a burst of pa/notify-needed events into a single invocation
    // per target. If thread is unknown at fire time, fall back to episode,
    // else a global bucket. CEL `||` is boolean OR, not nullish coalescing —
    // use ternary on `has()` instead.
    //
    // F4 (2026-06-12, E07 smoke): FAILURES get their OWN debounce bucket.
    // With one shared bucket an agent_failed arriving inside a burst of
    // routine agent_started/completed events collapsed into a single
    // invocation that carried only the LAST event's trigger_id — the
    // failure became invisible to Polina (SH03 Designer died silently for
    // 20 min). The `:fail` suffix keeps the failure reaction alive without
    // re-introducing reaction storms for routine traffic.
    //
    // D17 fail-dedup (2026-07-08): the `:fail` bucket is now keyed on
    // (actor, asset_id) too. A SHARED per-thread fail bucket could still mask a
    // DISTINCT failure that arrived inside another failure's window (E18: 9 VANIM
    // fetch-timeouts). Per-(actor,asset) buckets mean each distinct failing shot
    // wakes her once, while repeated failures of the SAME stuck asset collapse
    // within the window. actor/assetId are carried on the notify payload
    // (lib/api/events.ts); null-asset failures share one bucket, acceptable.
    debounce: {
      // 2026-06-25 — widened 5s→20s (env PA_REACT_DEBOUNCE_SEC) so an EREF
      // fan-out's staggered per-shot completions collapse into ONE auto-react
      // instead of one-per-shot. The `:fail` segment below keeps failures in
      // their own per-(actor,asset) bucket, so widening can't swallow a failure.
      period: `${Math.max(1, Number(process.env.PA_REACT_DEBOUNCE_SEC) || 20)}s`,
      key:
        '(has(event.data.threadId) && event.data.threadId != null ? event.data.threadId : ' +
        '(has(event.data.episodeId) && event.data.episodeId != null ? event.data.episodeId : "global")) + ' +
        '(has(event.data.eventType) && event.data.eventType == "agent_failed" ? ' +
        '":fail:" + (has(event.data.actor) && event.data.actor != null ? event.data.actor : "") + ' +
        '":" + (has(event.data.assetId) && event.data.assetId != null ? event.data.assetId : "") : "")',
    },
    // Cap parallelism so a flood of cross-episode events can't blow up the
    // OpenAI rate limit. Key is per-thread when known, else per-episode.
    concurrency: [
      {
        limit: 1,
        key:
          'has(event.data.threadId) && event.data.threadId != null ? event.data.threadId : ' +
          '(has(event.data.episodeId) && event.data.episodeId != null ? event.data.episodeId : "global")',
      },
    ],
  },
  { event: 'sandystudio/pa/notify-needed' },
  async ({ event, step, logger }) => {
    const data = event.data;

    // Step 1 — resolve the target thread (idempotent, cheap).
    const target = await step.run('resolve-thread', async () => {
      return resolveThreadId({
        threadId: data.threadId ?? null,
        episodeId: data.episodeId ?? null,
      });
    });

    if (!target) {
      logger.info('exec-pa-react: no open thread, skipping', {
        triggerId: data.triggerId,
        source: data.source,
      });
      return { skipped: 'no_open_thread' };
    }

    const internalToken = process.env.PA_INTERNAL_TOKEN?.trim();
    if (!internalToken) {
      logger.warn('exec-pa-react: PA_INTERNAL_TOKEN missing, cannot invoke chat-internal');
      return { skipped: 'pa_internal_token_missing' };
    }

    const appOrigin = PUBLIC_ENV.APP_URL || 'http://localhost:3000';
    const url = `${appOrigin.replace(/\/$/, '')}/api/concierge/chat-internal`;

    // Step 2 — call the internal handler. Returned status flows back to
    // logger so the Inngest dashboard surfaces skipped / failed runs.
    const result = await step.run('invoke-chat-internal', async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({
          thread_id: target.threadId,
          source: data.source,
          trigger_id: data.triggerId,
          event_type: data.eventType ?? undefined,
        }),
      });
      const bodyText = await res.text();
      if (!res.ok) {
        throw new Error(`chat-internal ${res.status}: ${bodyText.slice(0, 300)}`);
      }
      try {
        return JSON.parse(bodyText) as Record<string, unknown>;
      } catch {
        return { ok: true, raw: bodyText.slice(0, 200) };
      }
    });

    return result;
  },
);
