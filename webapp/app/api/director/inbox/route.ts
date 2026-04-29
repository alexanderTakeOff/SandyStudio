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
  limit: z.coerce.number().int().positive().max(50).optional().default(25),
  filter: z.enum(['all', 'visual', 'non_visual', 'blockers', 'mine']).optional().default('all'),
  episode_id: z.string().uuid().optional(),
});

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

  // ── Source 1: assets in REVIEW
  let assetQuery = supabase
    .from('assets')
    .select('*')
    .eq('status', 'REVIEW')
    .order('created_at', { ascending: true });
  if (q.episode_id) assetQuery = assetQuery.eq('episode_id', q.episode_id);
  const { data: assets, error: aerr } = await assetQuery;
  if (aerr) throw new Error(`inbox assets failed: ${aerr.message}`);

  // ── Source 2 & 3: activity_events unresolved (decision/input/blocker)
  let evtQuery = supabase
    .from('activity_events')
    .select('*')
    .in('event_type', [
      'decision_requested',
      'input_requested',
      'budget_threshold_reached',
      'blocker_raised',
    ])
    .order('created_at', { ascending: true })
    .limit(q.limit);
  if (q.episode_id) evtQuery = evtQuery.eq('episode_id', q.episode_id);
  const { data: events, error: eerr } = await evtQuery;
  if (eerr) throw new Error(`inbox events failed: ${eerr.message}`);

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
    const isBlocker = e.event_type === 'budget_threshold_reached' || e.event_type === 'blocker_raised';
    const group: InboxItem['group'] =
      isBlocker ? 'blocked'
      : e.event_type === 'decision_requested' ? 'needs_decision'
      : 'awaiting_input';
    const cta: InboxItem['cta'] = isBlocker
      ? [{ label: 'RESOLVE', intent: 'primary', action: 'resolve_blocker' },
         { label: 'HOLD',    intent: 'secondary', action: 'hold' }]
      : [{ label: 'OPEN',    intent: 'primary', action: 'open_event' }];
    items.push({
      id: `event:${e.id}`,
      group,
      title: e.title,
      subtitle: `${e.actor ?? 'system'} · ${e.event_type}`,
      created_at: e.created_at,
      agent_id: e.actor,
      episode_id: e.episode_id ?? undefined,
      is_visual: false,
      cta,
      metadata: { severity: e.severity, event_type: e.event_type },
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
