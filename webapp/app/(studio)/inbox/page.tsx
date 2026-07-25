// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/inbox/page.tsx — Director Inbox per director_inbox.md.
// Full triage UI: groups, hotkeys, bulk actions, visual gate enforcement.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import {
  AlertTriangle,
  Inbox as InboxIcon,
  Filter,
  Keyboard,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { fetcher } from '@/lib/swr';
import {
  InboxNotePromptModal,
  type InboxNoteDecision,
} from '@/components/inbox/InboxNotePromptModal';
import { EpisodeAssetDrawer, type EpisodeAsset } from '@/components/assets/EpisodeAssetDrawer';
import { isClearableInboxItem } from '@/lib/api/inbox-clear';

interface InboxItem {
  id: string;
  group: 'needs_approval' | 'needs_decision' | 'awaiting_input' | 'blocked';
  title: string;
  subtitle: string;
  is_visual: boolean;
  asset_id?: string;
  episode_id?: string;
  cta: Array<{ label: string; intent: 'primary' | 'secondary' | 'destructive'; action: string }>;
  created_at: string;
  metadata?: { event_type?: string; [k: string]: unknown };
}

const GROUP_LABEL: Record<InboxItem['group'], string> = {
  needs_approval: 'Needs approval',
  needs_decision: 'Needs decision',
  awaiting_input: 'Awaiting your input',
  blocked: 'Blocked — awaiting unblock',
};

type FilterId = 'all' | 'visual' | 'non_visual' | 'blockers';

export default function InboxPage() {
  const [filter, setFilter] = useState<FilterId>('all');
  const [helpOpen, setHelpOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notePrompt, setNotePrompt] = useState<{
    item: InboxItem;
    decision: InboxNoteDecision;
  } | null>(null);
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<string | null>(null);

  const { mutate: globalMutate } = useSWRConfig();

  const { data, mutate } = useSWR<{ data: InboxItem[]; meta?: { total: number } }>(
    `/api/director/inbox?filter=${filter}&limit=50`,
    fetcher,
    { refreshInterval: 30_000 },
  );
  const items = useMemo(() => data?.data ?? [], [data]);

  // Fetch the asset row when the drawer is open. Use the single-asset endpoint
  // which already exists at /api/assets/[id].
  const { data: openAssetResp, mutate: mutateOpenAsset } = useSWR<{ data: EpisodeAsset }>(
    openAssetId ? `/api/assets/${openAssetId}` : null,
    fetcher,
  );
  const openAsset: EpisodeAsset | null = openAssetResp?.data ?? null;

  // Group items
  const grouped = useMemo(() => {
    const out: Record<InboxItem['group'], InboxItem[]> = {
      needs_approval: [],
      needs_decision: [],
      awaiting_input: [],
      blocked: [],
    };
    for (const it of items) out[it.group].push(it);
    return out;
  }, [items]);

  const flat = useMemo(() => {
    return [
      ...grouped.needs_approval,
      ...grouped.needs_decision,
      ...grouped.awaiting_input,
      ...grouped.blocked,
    ];
  }, [grouped]);

  // Shown on the Clear button. Counts only what is currently on screen, so it
  // is a floor — the endpoint drains every matching event, including any beyond
  // the 50-row page cap.
  const clearableCount = useMemo(
    () => flat.filter(isClearableInboxItem).length,
    [flat],
  );

  // Auto-dismiss the clear confirmation line.
  useEffect(() => {
    if (!clearResult) return;
    const t = setTimeout(() => setClearResult(null), 6_000);
    return () => clearTimeout(t);
  }, [clearResult]);

  // Hotkeys
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // A modal owns the keyboard while open — otherwise A/R/X would silently
      // decide the focused row behind the dialog.
      if ((helpOpen || clearOpen) && e.key !== 'Escape') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const item = flat[focusIdx];
      switch (e.key.toLowerCase()) {
        case 'j':
          setFocusIdx((i) => Math.min(i + 1, flat.length - 1));
          e.preventDefault();
          break;
        case 'k':
          setFocusIdx((i) => Math.max(i - 1, 0));
          e.preventDefault();
          break;
        case '?':
          setHelpOpen(true);
          break;
        case 'a':
          if (item && !item.is_visual) act(item, 'APPROVE');
          break;
        case 'r':
          if (item) setNotePrompt({ item, decision: 'REQUEST_REVISION' });
          break;
        case 'x':
          if (item) setNotePrompt({ item, decision: 'REJECT' });
          break;
        case 'escape':
          setHelpOpen(false);
          setClearOpen(false);
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, focusIdx, helpOpen, clearOpen]);

  async function act(item: InboxItem, decision: string, note?: string) {
    if (!item.asset_id) return;
    const ack = item.is_visual && decision === 'APPROVE'
      ? window.confirm('Visual asset — confirm preview reviewed before approving?')
      : true;
    if (!ack) return;
    await fetch(`/api/assets/${item.asset_id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decision,
        note,
        preview_acknowledged: item.is_visual ? true : undefined,
      }),
    });
    setSelected((s) => {
      const c = new Set(s);
      c.delete(item.id);
      return c;
    });
    mutate();
  }

  async function bulkApprove() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`Approve ${ids.length} non-visual items?`)) return;
    await fetch('/api/director/inbox/bulk-approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        asset_ids: items
          .filter((i) => ids.includes(i.id) && i.asset_id)
          .map((i) => i.asset_id),
      }),
    }).catch(() => undefined);
    // Phase 5b doesn't ship the bulk endpoint — fall back to per-item POSTs.
    for (const id of ids) {
      const item = items.find((i) => i.id === id);
      if (item && !item.is_visual) await act(item, 'APPROVE');
    }
    setSelected(new Set());
    mutate();
  }

  // "Clear inbox" — dismisses the notification half of the feed (unresolved
  // events) for the ACTIVE filter only. Asset approval gates are untouched:
  // clearing one would mean deciding it, which flips status and fires the DAG.
  async function clearInbox() {
    setClearing(true);
    try {
      const res = await fetch('/api/director/inbox/clear', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filter }),
      });
      const json = (await res.json()) as
        | { success: true; data: { cleared: number } }
        | { success: false; error: string };
      if (!res.ok || !json.success) {
        setClearResult(
          `Clear failed: ${json.success === false ? json.error : res.statusText}`,
        );
        return;
      }
      const n = json.data.cleared;
      setClearResult(
        n === 0
          ? 'Nothing to clear — no dismissible notifications in this view.'
          : `Cleared ${n} notification${n === 1 ? '' : 's'}.`,
      );
      setClearOpen(false);
      setSelected(new Set());
      setFocusIdx(0);
      await mutate();
      // Left-rail badge reads its own SWR key — revalidate it too so the count
      // drops immediately instead of after its 8s poll.
      await globalMutate('/api/director/inbox?limit=50');
    } catch (err) {
      setClearResult(`Clear failed: ${err instanceof Error ? err.message : 'network error'}`);
    } finally {
      setClearing(false);
    }
  }

  function toggleSelect(item: InboxItem) {
    if (item.is_visual) return;
    setSelected((s) => {
      const c = new Set(s);
      if (c.has(item.id)) c.delete(item.id);
      else c.add(item.id);
      return c;
    });
  }

  return (
    <StudioContentFrame>
      <header className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <InboxIcon size={18} className="text-text-secondary" />
            <h1 className="text-2xl font-semibold text-text-primary">
              Inbox · {items.length} items
            </h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Triage everything that needs your decision. Press <kbd>?</kbd> for shortcuts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setClearOpen(true)}
            disabled={clearableCount === 0 || clearing}
            title={
              clearableCount === 0
                ? 'Nothing dismissible in this view — asset approvals are not cleared'
                : `Dismiss ${clearableCount} notification item${clearableCount === 1 ? '' : 's'}`
            }
          >
            <Trash2 size={14} /> Clear inbox
            {clearableCount > 0 && (
              <span className="text-text-muted">· {clearableCount}</span>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)}>
            <Keyboard size={14} /> Help
          </Button>
        </div>
      </header>

      {clearResult && (
        <div
          className="mb-4 rounded-lg border px-3 py-2 text-xs"
          role="status"
          style={{
            borderColor: 'var(--panel-glass-border)',
            background: 'color-mix(in oklab, var(--accent-primary) 8%, transparent)',
            color: 'var(--text-secondary)',
          }}
        >
          {clearResult}
        </div>
      )}

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-5">
        <Filter size={14} className="text-text-muted" />
        {(['all', 'visual', 'non_visual', 'blockers'] as FilterId[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 h-8 rounded-md text-xs font-medium uppercase tracking-wider border transition-colors"
            style={{
              background:
                filter === f
                  ? 'color-mix(in oklab, var(--accent-primary) 14%, transparent)'
                  : 'transparent',
              borderColor:
                filter === f
                  ? 'var(--accent-primary)'
                  : 'var(--panel-glass-border)',
              color:
                filter === f ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {f.replace('_', '-')}
          </button>
        ))}
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <Card className="mb-4">
          <CardBody>
            <div className="flex items-center justify-between">
              <span className="text-sm">
                <strong>{selected.size}</strong> selected (non-visual only)
              </span>
              <div className="flex gap-2">
                <Button onClick={bulkApprove}>Bulk approve</Button>
                <Button variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Empty state */}
      {flat.length === 0 && (
        <Card>
          <CardBody>
            <div className="text-center py-12">
              <p className="text-base text-text-primary">Inbox is clear.</p>
              <p className="text-sm text-text-secondary mt-2">
                Nothing waiting on you. Active episodes continue autonomously per their governance modes.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Groups */}
      {(['needs_approval', 'needs_decision', 'awaiting_input', 'blocked'] as InboxItem['group'][]).map((g) => {
        const rows = grouped[g];
        if (rows.length === 0) return null;
        return (
          <section key={g} className="mb-6">
            <div className="text-xs uppercase tracking-wider text-text-muted mb-2">
              {GROUP_LABEL[g]} · {rows.length}
            </div>
            <div className="space-y-2">
              {rows.map((item) => {
                const idx = flat.indexOf(item);
                const focused = idx === focusIdx;
                const handleOpen = () => {
                  setFocusIdx(idx);
                  if (item.asset_id) {
                    setOpenAssetId(item.asset_id);
                  } else if (item.episode_id) {
                    window.location.href = `/episodes/${item.episode_id}`;
                  }
                };
                return (
                  <div
                    key={item.id}
                    onClick={handleOpen}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpen();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${item.title}`}
                    className="rounded-xl border bg-panel-glass-strong px-4 py-3 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                    style={{
                      borderColor: focused
                        ? 'var(--accent-primary)'
                        : 'var(--panel-glass-border)',
                      boxShadow: focused ? '0 0 0 2px color-mix(in oklab, var(--accent-primary) 25%, transparent)' : undefined,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {!item.is_visual && (
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelect(item)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1"
                          aria-label={`Select ${item.title} for bulk approve`}
                        />
                      )}
                      {item.is_visual && <span className="w-4" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-text-primary">
                            {item.title}
                          </span>
                          {item.is_visual && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                              style={{
                                background: 'color-mix(in oklab, var(--accent-warning) 14%, transparent)',
                                color: 'var(--accent-warning)',
                              }}
                            >
                              <AlertTriangle size={9} />
                              visual — review in drawer
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-text-muted mt-0.5">{item.subtitle}</div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpen();
                        }}
                        className="shrink-0 inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-colors"
                        style={{
                          background: 'var(--accent-primary)',
                          color: 'var(--text-inverse)',
                        }}
                      >
                        <ExternalLink size={11} /> Open
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <InboxNotePromptModal
        open={notePrompt !== null}
        decision={notePrompt?.decision ?? 'REJECT'}
        subjectLabel={notePrompt?.item.title}
        onClose={() => setNotePrompt(null)}
        onSubmit={async (note) => {
          if (notePrompt) await act(notePrompt.item, notePrompt.decision, note);
        }}
      />

      {openAsset && (
        <EpisodeAssetDrawer
          open={true}
          asset={openAsset}
          onClose={() => setOpenAssetId(null)}
          onChange={() => {
            // Refresh both: the open asset (status / metadata changed) and the
            // inbox list (decided items disappear from feed).
            mutateOpenAsset();
            mutate();
          }}
          onPickAsset={(id) => setOpenAssetId(id)}
          kindLabel="Inbox asset"
        />
      )}

      <Modal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Clear inbox"
        size="md"
      >
        <div className="space-y-4 text-sm">
          <p className="text-text-secondary">
            Dismisses the <strong className="text-text-primary">notification</strong>{' '}
            rows in the current view — decision / input requests, blockers and budget
            alerts. These never expire on their own, which is why the feed grows.
          </p>
          <ul className="space-y-1.5 text-xs text-text-muted">
            <li>
              <strong className="text-text-primary">Not touched:</strong> assets awaiting
              approval. Clearing one would mean approving or rejecting it, which fires the
              agent pipeline.
            </li>
            <li>
              <strong className="text-text-primary">Not touched:</strong> Bible extension
              proposals — the proposals live inside those items, so they stay until you
              decide them.
            </li>
            <li>
              Scope: the <strong className="text-text-primary">{filter.replace('_', '-')}</strong>{' '}
              filter. At least {clearableCount} item{clearableCount === 1 ? '' : 's'} shown;
              anything past the 50-row page is cleared too.
            </li>
            <li>Dismissed items stay in the Activity feed as an audit record.</li>
          </ul>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setClearOpen(false)} disabled={clearing}>
              Cancel
            </Button>
            <Button variant="danger" onClick={clearInbox} disabled={clearing}>
              {clearing ? 'Clearing…' : 'Clear notifications'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Inbox shortcuts">
        <ul className="text-sm space-y-2">
          <Shortcut k="J / K" desc="Move focus down/up" />
          <Shortcut k="A" desc="Approve focused item (non-visual)" />
          <Shortcut k="R" desc="Request revision (note required)" />
          <Shortcut k="X" desc="Reject (note required)" />
          <Shortcut k="?" desc="Open this help" />
          <Shortcut k="Esc" desc="Close help" />
        </ul>
      </Modal>
    </StudioContentFrame>
  );
}

function Shortcut({ k, desc }: { k: string; desc: string }) {
  return (
    <li className="flex items-center justify-between gap-3 text-text-secondary">
      <kbd className="px-2 py-0.5 rounded border border-glass bg-[var(--bg-elevated)] text-[11px] font-mono text-text-primary">
        {k}
      </kbd>
      <span>{desc}</span>
    </li>
  );
}
