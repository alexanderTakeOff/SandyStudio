// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/inbox/page.tsx — Director Inbox per director_inbox.md.
// Full triage UI: groups, hotkeys, bulk actions, visual gate enforcement.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, Inbox as InboxIcon, Filter, Keyboard, ExternalLink } from 'lucide-react';
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

  const { data, mutate } = useSWR<{ data: InboxItem[]; meta?: { total: number } }>(
    `/api/director/inbox?filter=${filter}&limit=50`,
    fetcher,
    { refreshInterval: 30_000 },
  );
  const items = useMemo(() => data?.data ?? [], [data]);

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

  // Hotkeys
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (helpOpen && e.key !== 'Escape') return;
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
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, focusIdx, helpOpen]);

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
          <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)}>
            <Keyboard size={14} /> Help
          </Button>
        </div>
      </header>

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
                return (
                  <div
                    key={item.id}
                    onClick={() => setFocusIdx(idx)}
                    className="rounded-xl border bg-panel-glass-strong px-4 py-3 transition-all cursor-pointer"
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
                              visual — bulk disabled
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-text-muted mt-0.5">{item.subtitle}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3 ml-7">
                      {item.cta.map((b) => (
                        <button
                          key={b.action}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Canon-extension proposals: deep-link to the
                            // episode page; Director clicks Continuity kebab
                            // → Preview to open the CanonExtensionsPanel.
                            if (b.action === 'open_asset_preview') {
                              if (item.episode_id) {
                                window.location.href = `/episodes/${item.episode_id}`;
                              } else if (item.asset_id) {
                                window.location.href = `/assets/${item.asset_id}`;
                              }
                              return;
                            }
                            const map: Record<string, string> = {
                              approve: 'APPROVE',
                              revise: 'REQUEST_REVISION',
                              reject: 'REJECT',
                              needs_human_tweak: 'NEEDS_HUMAN_TWEAK',
                            };
                            const decision = map[b.action];
                            if (!decision) return;
                            if (decision === 'REQUEST_REVISION' || decision === 'REJECT') {
                              setNotePrompt({ item, decision });
                            } else {
                              act(item, decision);
                            }
                          }}
                          className="px-2.5 h-8 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-colors"
                          style={{
                            background:
                              b.intent === 'primary'
                                ? 'var(--accent-primary)'
                                : b.intent === 'destructive'
                                ? 'var(--accent-danger)'
                                : 'transparent',
                            color:
                              b.intent === 'primary' || b.intent === 'destructive'
                                ? 'var(--text-inverse)'
                                : 'var(--text-secondary)',
                            border:
                              b.intent === 'secondary' ? '1px solid var(--panel-glass-border)' : 'none',
                          }}
                        >
                          {b.label}
                        </button>
                      ))}
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
