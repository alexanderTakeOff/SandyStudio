// ──────────────────────────────────────────────────────────────────────────────
// app/api/director/inbox/clear/route.ts
// "Clear inbox" — bulk-dismiss the NOTIFICATION half of the Director Inbox.
//
// Why this exists (2026-07-25, Director directive): the Inbox has two sources
// (see ../route.ts). Asset rows self-clear — they are shown only while
// `status='REVIEW'`, so any decision drops them from the feed. Event rows do
// NOT: they are shown while `resolved_at IS NULL`, and before this route the
// ONLY code path in the repo that ever set `resolved_at` was the canon-extension
// sweep (lib/api/canon-extensions.ts). Everything else — decision_requested,
// input_requested, blocker_raised, budget_threshold_reached, rule_proposal —
// accumulate forever with no TTL and no cleanup job. Since the GET caps at
// `limit=50` and sorts oldest-first inside each group, that dead backlog
// crowded fresh work out of the feed. This route is the drain.
//
// Deliberately NOT cleared (scope lives in lib/api/inbox-clear.ts):
//   - assets in REVIEW      — those are the Director's creative gates. Clearing
//                             them would mean approving or rejecting, which
//                             flips status and fires the agent DAG.
//   - canon_extension_proposed — the proposals themselves live in the event's
//                             `metadata.proposals`; resolving the event is what
//                             marks them dispositioned (and makes the extensions
//                             endpoint reject further work on them). Not noise —
//                             a pending canon decision with data attached.
//   - rule_proposal         — Skill Editor rule changes. Director ruling
//                             2026-07-25: leave them. A change to how agents
//                             behave is a standing decision, not a notification.
//
// Per CLAUDE.md §11 rule 8 + specs/system/director_inbox.md.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { logEvent } from '@/lib/api/events';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { eventTypesForFilter } from '@/lib/api/inbox-clear';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ClearBody = z.object({
  /** Mirrors the Inbox filter pills so "Clear" only drains what is on screen. */
  filter: z.enum(['all', 'visual', 'non_visual', 'blockers']).default('all'),
  episode_id: z.string().uuid().optional(),
});

export const POST = withApiHandler(async (req) => {
  const { supabase, principal } = await requireDirector();
  const body = await parseJson(req, ClearBody);

  const types = eventTypesForFilter(body.filter);

  // The `visual` pill shows only IMG/VID assets — no event rows behind it. Bail
  // out instead of letting an empty `.in()` drain (or error on) the whole feed.
  if (types.length === 0) {
    return apiOk({ cleared: 0, cleared_ids: [] as string[] }, { total: 0 });
  }

  const resolvedAt = new Date().toISOString();
  let update = supabase
    .from('activity_events')
    .update({ resolved_at: resolvedAt } as never)
    .is('resolved_at', null)
    .in('event_type', types as string[]);
  if (body.episode_id) update = update.eq('episode_id', body.episode_id);

  const { data, error } = await update.select('id');
  if (error) throw new Error(`inbox clear failed: ${error.message}`);

  const clearedIds = (data ?? []).map((r) => (r as { id: string }).id);

  // Audit trail. `config_updated` is used rather than a dedicated
  // `inbox_cleared` type because the latter is not yet in the
  // activity_events_type_valid CHECK (migration 0035) and logEvent swallows
  // constraint violations — a new type would silently lose the audit row until
  // a migration lands. `metadata.action` keeps it greppable.
  if (clearedIds.length > 0) {
    await logEvent(supabase, {
      event_type: 'config_updated',
      severity: 'info',
      title: `Inbox cleared — ${clearedIds.length} notification${clearedIds.length === 1 ? '' : 's'} dismissed`,
      description:
        `Director dismissed ${clearedIds.length} unresolved inbox event(s) ` +
        `(filter=${body.filter}). Asset approval gates were not touched.`,
      actor: principal,
      episode_id: body.episode_id ?? null,
      metadata: {
        action: 'inbox_clear',
        filter: body.filter,
        event_types: types,
        cleared_count: clearedIds.length,
        cleared_event_ids: clearedIds,
        resolved_at: resolvedAt,
      },
    });
  }

  return apiOk(
    { cleared: clearedIds.length, cleared_ids: clearedIds },
    { total: clearedIds.length },
  );
});
