// ──────────────────────────────────────────────────────────────────────────────
// app/api/director/inbox/route.ts
// Director's task center aggregator. Per director_inbox.md §2 + §15.
//
// Sources:
//   - assets in REVIEW (needs_approval)
//   - activity_events with event_type 'decision_requested' or 'input_requested'
//     that have not been resolved
//   - blocked status: budget_threshold_reached, blocker_raised
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseSearchParams } from '@/lib/api/zod-helpers';
import { VISUAL_CATEGORIES } from '@/lib/supabase/types-phase5b';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ListQuery = z.object({
  limit: z.coerce.number().int().positive().max(50).default(25),
  filter: z
    .enum(['all', 'visual', 'non_visual', 'blockers', 'mine', 'hidden'])
    .default('all'),
  episode_id: z.string().uuid().optional(),
  // Workspace scope (Phase 3). Events filter on their own series_id (0049);
  // assets mostly carry series only via their episode, so the asset arm is
  // «series-scoped Bible assets OR assets of the series' episodes».
  series_id: z.string().uuid().optional(),
});

/**
 * Episode statuses whose work is finished. 2026-07-25: the Inbox used to ignore
 * episode status entirely, so a REVIEW asset or an unresolved event belonging to
 * an ARCHIVED or COMPLETE episode kept demanding triage forever — and since the
 * feed is capped and sorted oldest-first, that dead weight sat permanently at
 * the top. Archiving an episode is the canonical "stop asking me about this"
 * signal (migration 0029); the Inbox now honours it.
 */
const TERMINAL_EPISODE_STATUSES = ['ARCHIVED', 'COMPLETE'] as const;

/** JSON path on `assets.metadata` marking a row hidden from the Inbox. */
const ASSET_DISMISSED_PATH = 'metadata->>inbox_dismissed_at';

const VISUAL_FILE_TYPES: ReadonlySet<string> = new Set(['IMG', 'VID']);

interface InboxItem {
  id: string;                    // composite stable key
  group: 'needs_approval' | 'needs_decision' | 'awaiting_input' | 'blocked';
  title: string;
  subtitle: string;              // agent · time · meta
  created_at: string;
  agent_id: string | null;
  asset_id?: string;
  episode_id?: string;
  is_visual: boolean;
  cta: Array<{ label: string; intent: 'primary' | 'secondary' | 'destructive'; action: string }>;
  metadata: Record<string, unknown>;
}

export const GET = withApiHandler(async (req) => {
  const { supabase } = await requireDirector();
  const q = parseSearchParams(req.url, ListQuery);

  // ── Terminal episodes: anything belonging to them is not triage work.
  // Fetched as an id list rather than an embedded join because `!inner` would
  // drop rows with a NULL episode_id (Bible assets), which DO belong in the
  // Inbox. The list is bounded by the season size, so the `in.(…)` stays small.
  const { data: doneEpisodes, error: depErr } = await supabase
    .from('episodes')
    .select('id')
    .in('status', TERMINAL_EPISODE_STATUSES as unknown as never[]);
  if (depErr) throw new Error(`inbox terminal episodes failed: ${depErr.message}`);
  const doneEpisodeIds = (doneEpisodes ?? []).map((e) => (e as { id: string }).id);
  // PostgREST renders `NOT IN` as SQL NOT IN, which is NULL — hence false — for a
  // NULL episode_id. The explicit `is.null` arm keeps episode-less rows visible.
  const notTerminal = doneEpisodeIds.length
    ? `episode_id.is.null,episode_id.not.in.(${doneEpisodeIds.join(',')})`
    : null;

  // Workspace scope: the asset arm needs the series' episode-id list (episode
  // assets don't carry series_id). Bounded by the series size. Multiple .or()
  // calls AND together in PostgREST, so this composes with notTerminal.
  let assetScopeOr: string | null = null;
  if (q.series_id) {
    const { data: seriesEps, error: sepErr } = await supabase
      .from('episodes')
      .select('id')
      .eq('series_id', q.series_id);
    if (sepErr) throw new Error(`inbox series episodes failed: ${sepErr.message}`);
    const ids = (seriesEps ?? []).map((e) => (e as { id: string }).id);
    assetScopeOr = ids.length
      ? `series_id.eq.${q.series_id},episode_id.in.(${ids.join(',')})`
      : `series_id.eq.${q.series_id}`;
  }

  // ── Source 1: assets in REVIEW
  // Select only the columns the inbox renders — avoid hauling `content`
  // (multi-KB TEXT) and `metadata` (JSON) on every 10s poll. The dropped
  // payload was visible as 1+ second response times even with a warm route.
  // Apply the same `limit` ceiling as events; assets are sorted oldest-first
  // and downstream re-sorting still works on a truncated list.
  let assetQuery = supabase
    .from('assets')
    .select('id,filename,file_type,status,agent_id,created_at,episode_id,version')
    .eq('status', 'REVIEW')
    .order('created_at', { ascending: true })
    .limit(q.limit);
  if (q.episode_id) assetQuery = assetQuery.eq('episode_id', q.episode_id);
  if (assetScopeOr) assetQuery = assetQuery.or(assetScopeOr);
  if (notTerminal) assetQuery = assetQuery.or(notTerminal);
  // `hidden` is the recovery view: it shows ONLY the rows a previous "Clear
  // inbox" swept out of triage, so a dismissal is never a one-way door. Every
  // other filter hides them. Filtered in SQL on the JSON path so the multi-KB
  // `metadata` payload still never crosses the wire.
  assetQuery =
    q.filter === 'hidden'
      ? assetQuery.not(ASSET_DISMISSED_PATH, 'is', null)
      : assetQuery.is(ASSET_DISMISSED_PATH, null);
  const { data: assets, error: aerr } = await assetQuery;
  if (aerr) throw new Error(`inbox assets failed: ${aerr.message}`);

  // ── Source 2 & 3: activity_events unresolved (decision/input/blocker)
  // Backbone v2: include canon_extension_proposed so agents that surface
  // Bible extensions land in the Director Inbox automatically. The
  // resolved_at filter (added migration 0019) hides items already
  // dispositioned via CanonExtensionsPanel.
  let evtQuery = supabase
    .from('activity_events')
    .select('id,event_type,severity,title,actor,episode_id,asset_id,created_at,metadata')
    .in('event_type', [
      'decision_requested',
      'input_requested',
      'budget_threshold_reached',
      'blocker_raised',
      'canon_extension_proposed',
      // Slow-loop calibration proposals (critic discriminator) + Skill-Editor
      // rule changes — both are Director-actionable and must surface, not bury
      // in the raw feed. Render generically (awaiting_input · OPEN).
      'rule_proposal',
    ])
    .is('resolved_at', null)
    .order('created_at', { ascending: true })
    .limit(q.limit);
  if (q.episode_id) evtQuery = evtQuery.eq('episode_id', q.episode_id);
  if (q.series_id) evtQuery = evtQuery.eq('series_id', q.series_id);
  if (notTerminal) evtQuery = evtQuery.or(notTerminal);
  // The recovery view is about dismissed ASSETS; events are cleared outright
  // (resolved_at) and have no hidden state to recover, so skip them entirely.
  const evtResult = q.filter === 'hidden' ? null : await evtQuery;
  if (evtResult?.error) throw new Error(`inbox events failed: ${evtResult.error.message}`);
  const events = evtResult?.data ?? [];

  // ── Build items
  const items: InboxItem[] = [];

  for (const a of assets ?? []) {
    const isVisual = VISUAL_FILE_TYPES.has(a.file_type);
    const cta: InboxItem['cta'] = [
      { label: 'APPROVE',  intent: 'primary',     action: 'approve' },
      { label: 'REVISE',   intent: 'secondary',   action: 'revise' },
      { label: 'REJECT',   intent: 'destructive', action: 'reject' },
      { label: 'TWEAK',    intent: 'secondary',   action: 'needs_human_tweak' },
    ];
    items.push({
      id: `asset:${a.id}`,
      group: 'needs_approval',
      title: a.filename,
      subtitle: `${a.agent_id ?? 'agent'} · ${a.file_type}`,
      created_at: a.created_at,
      agent_id: a.agent_id,
      asset_id: a.id,
      episode_id: a.episode_id ?? undefined,
      is_visual: isVisual,
      cta,
      metadata: { file_type: a.file_type, version: a.version },
    });
  }

  for (const e of events ?? []) {
    const isBlocker =
      e.event_type === 'budget_threshold_reached' || e.event_type === 'blocker_raised';
    const isCanonExt = e.event_type === 'canon_extension_proposed';
    const group: InboxItem['group'] =
      isBlocker ? 'blocked'
      : e.event_type === 'decision_requested' ? 'needs_decision'
      : 'awaiting_input';

    let cta: InboxItem['cta'];
    if (isBlocker) {
      cta = [
        { label: 'RESOLVE', intent: 'primary', action: 'resolve_blocker' },
        { label: 'HOLD',    intent: 'secondary', action: 'hold' },
      ];
    } else if (isCanonExt) {
      cta = [
        { label: 'REVIEW PROPOSALS', intent: 'primary', action: 'open_asset_preview' },
      ];
    } else {
      cta = [{ label: 'OPEN', intent: 'primary', action: 'open_event' }];
    }

    items.push({
      id: `event:${e.id}`,
      group,
      title: e.title,
      subtitle: isCanonExt
        ? `${e.actor ?? 'agent'} · ${(e.metadata as { proposal_count?: number } | null)?.proposal_count ?? 0} extension${((e.metadata as { proposal_count?: number } | null)?.proposal_count ?? 0) === 1 ? '' : 's'}`
        : `${e.actor ?? 'system'} · ${e.event_type}`,
      created_at: e.created_at,
      agent_id: e.actor,
      asset_id: (e.asset_id as string | undefined) ?? undefined,
      episode_id: e.episode_id ?? undefined,
      is_visual: false,
      cta,
      metadata: {
        severity: e.severity,
        event_type: e.event_type,
        ...(isCanonExt && e.metadata && typeof e.metadata === 'object'
          ? { proposal_count: (e.metadata as { proposal_count?: number }).proposal_count }
          : {}),
      },
    });
  }

  // ── Filter
  let filtered = items;
  if (q.filter === 'visual') filtered = filtered.filter((i) => i.is_visual);
  if (q.filter === 'non_visual') filtered = filtered.filter((i) => !i.is_visual);
  if (q.filter === 'blockers') filtered = filtered.filter((i) => i.group === 'blocked');

  // ── Sort: groups in canonical order; within group oldest first; visuals last in needs_approval
  const groupOrder: InboxItem['group'][] = ['needs_approval', 'needs_decision', 'awaiting_input', 'blocked'];
  filtered.sort((a, b) => {
    const ga = groupOrder.indexOf(a.group);
    const gb = groupOrder.indexOf(b.group);
    if (ga !== gb) return ga - gb;
    if (a.group === 'needs_approval' && a.is_visual !== b.is_visual) {
      return a.is_visual ? 1 : -1;
    }
    return a.created_at.localeCompare(b.created_at);
  });

  filtered = filtered.slice(0, q.limit);

  return apiOk(filtered, {
    total: items.length,
    visual_count: items.filter((i) => i.is_visual).length,
    visual_categories: Array.from(VISUAL_CATEGORIES),
  });
});
