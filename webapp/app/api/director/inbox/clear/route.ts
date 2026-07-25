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
  /**
   * Also sweep assets awaiting approval out of the Inbox — WITHOUT deciding
   * them. Status stays REVIEW (so the DAG is untouched and the asset is still
   * reachable from Episodes / the drawer); a `metadata.inbox_dismissed_at`
   * stamp takes it out of triage. Reversible: `?filter=hidden` lists them and
   * `restore: true` un-stamps them.
   *
   * Added 2026-07-25 — Director could not clear an Inbox made almost entirely
   * of stale approval gates, because notification-only clearing left the
   * button disabled.
   */
  include_assets: z.boolean().optional(),
  /** Un-stamp previously hidden assets instead of hiding more. */
  restore: z.boolean().optional(),
});

/** Cap per call — keeps one accidental click from stamping an unbounded set. */
const ASSET_SWEEP_CAP = 500;

export const POST = withApiHandler(async (req) => {
  const { supabase, principal } = await requireDirector();
  const body = await parseJson(req, ClearBody);

  const now = new Date().toISOString();

  // ── Restore path: un-hide previously dismissed assets and stop.
  if (body.restore) {
    const restored = await sweepAssets(supabase, body, { restore: true });
    if (restored.length > 0) {
      await logEvent(supabase, {
        event_type: 'config_updated',
        severity: 'info',
        title: `Inbox restore — ${restored.length} asset${restored.length === 1 ? '' : 's'} back in triage`,
        description: `Director un-hid ${restored.length} asset(s) previously swept out of the Inbox. No status changed.`,
        actor: principal,
        episode_id: body.episode_id ?? null,
        metadata: {
          action: 'inbox_restore',
          filter: body.filter,
          restored_count: restored.length,
          restored_asset_ids: restored,
        },
      });
    }
    return apiOk(
      { cleared: 0, cleared_ids: [], assets_hidden: 0, assets_restored: restored.length },
      { total: restored.length },
    );
  }

  const types = eventTypesForFilter(body.filter);

  // ── Half 1: notification events. The `visual` pill shows only IMG/VID assets,
  // so there are no event rows behind it — an empty `.in()` must not be issued.
  let clearedIds: string[] = [];
  if (types.length > 0) {
    let update = supabase
      .from('activity_events')
      .update({ resolved_at: now } as never)
      .is('resolved_at', null)
      .in('event_type', types as string[]);
    if (body.episode_id) update = update.eq('episode_id', body.episode_id);

    const { data, error } = await update.select('id');
    if (error) throw new Error(`inbox clear failed: ${error.message}`);
    clearedIds = (data ?? []).map((r) => (r as { id: string }).id);
  }

  // ── Half 2 (opt-in): hide asset approval gates without deciding them.
  const hiddenIds = body.include_assets
    ? await sweepAssets(supabase, body, { restore: false, at: now })
    : [];

  if (hiddenIds.length > 0) {
    await logEvent(supabase, {
      event_type: 'config_updated',
      severity: 'info',
      title: `Inbox cleared — ${hiddenIds.length} approval gate${hiddenIds.length === 1 ? '' : 's'} hidden`,
      description:
        `Director swept ${hiddenIds.length} asset(s) out of Inbox triage. Status stays ` +
        `REVIEW — nothing was approved or rejected, and no pipeline event fired. ` +
        `Recover them with the "hidden" filter.`,
      actor: principal,
      episode_id: body.episode_id ?? null,
      metadata: {
        action: 'inbox_hide_assets',
        filter: body.filter,
        hidden_count: hiddenIds.length,
        hidden_asset_ids: hiddenIds,
        inbox_dismissed_at: now,
      },
    });
  }

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
        resolved_at: now,
      },
    });
  }

  return apiOk(
    {
      cleared: clearedIds.length,
      cleared_ids: clearedIds,
      assets_hidden: hiddenIds.length,
      assets_restored: 0,
    },
    { total: clearedIds.length + hiddenIds.length },
  );
});

/**
 * Stamp (or clear) `metadata.inbox_dismissed_at` on REVIEW assets in scope.
 *
 * `metadata` is free-form JSONB shared with image-prompt and description
 * history (migration 0020), so each row is merged rather than overwritten —
 * hence read-then-write instead of one bulk UPDATE. Rows are fetched id+metadata
 * only, so the multi-KB `content` column never crosses the wire.
 */
async function sweepAssets(
  supabase: Awaited<ReturnType<typeof requireDirector>>['supabase'],
  body: z.infer<typeof ClearBody>,
  opts: { restore: boolean; at?: string },
): Promise<string[]> {
  let query = supabase
    .from('assets')
    .select('id,metadata')
    .eq('status', 'REVIEW')
    .order('created_at', { ascending: true })
    .limit(ASSET_SWEEP_CAP);
  if (body.episode_id) query = query.eq('episode_id', body.episode_id);
  // Only touch rows that need it: hide the still-visible ones, restore the
  // already-hidden ones. Keeps the write count honest in the audit row.
  query = opts.restore
    ? query.not('metadata->>inbox_dismissed_at', 'is', null)
    : query.is('metadata->>inbox_dismissed_at', null);
  // The visual gate is about DECIDING, not about triage housekeeping — hiding
  // an IMG/VID row approves nothing — so `visual`/`non_visual` narrow the sweep
  // rather than block it.
  if (body.filter === 'visual') query = query.in('file_type', ['IMG', 'VID']);
  if (body.filter === 'non_visual') query = query.not('file_type', 'in', '("IMG","VID")');
  // `blockers` is an event-only view; it has no asset rows behind it.
  if (body.filter === 'blockers') return [];

  const { data, error } = await query;
  if (error) throw new Error(`inbox asset sweep failed: ${error.message}`);

  const rows = (data ?? []) as Array<{ id: string; metadata: unknown }>;
  const touched: string[] = [];
  for (const row of rows) {
    const base =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {};
    if (opts.restore) delete base.inbox_dismissed_at;
    else base.inbox_dismissed_at = opts.at;
    const { error: uerr } = await supabase
      .from('assets')
      .update({ metadata: base } as never)
      .eq('id', row.id);
    if (uerr) throw new Error(`inbox asset sweep failed on ${row.id}: ${uerr.message}`);
    touched.push(row.id);
  }
  return touched;
}
