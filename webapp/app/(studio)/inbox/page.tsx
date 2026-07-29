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
  RotateCcw,
} from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { fetcher } from '@/lib/swr';
import { useWorkspaceScope } from '@/components/providers/WorkspaceScopeProvider';
import {
  InboxNotePromptModal,
  type InboxNoteDecision,
} from '@/components/inbox/InboxNotePromptModal';
import { EpisodeAssetDrawer, type EpisodeAsset } from '@/components/assets/EpisodeAssetDrawer';
import { CriticVerdictOverrideModal } from '@/components/assets/CriticVerdictOverrideModal';
import {
  postAssetDecision,
  withCriticOverride,
  CriticVerdictBlockedError,
  type AssetDecisionBody,
  type AssetDecisionVerb,
  type CriticFailure,
} from '@/lib/api/asset-decision';
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

type FilterId = 'all' | 'visual' | 'non_visual' | 'blockers' | 'hidden';

/** Pills in render order. `hidden` is the recovery view for swept asset gates. */
const FILTERS: FilterId[] = ['all', 'visual', 'non_visual', 'blockers', 'hidden'];

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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<string | null>(null);
  const [includeAssets, setIncludeAssets] = useState(false);
  // A refused decision is shown, never swallowed.
  const [actError, setActError] = useState<string | null>(null);
  // Refusal on a frozen critic verdict — keeps the body so the Director can
  // knowingly re-send it over the verdict.
  const [criticBlock, setCriticBlock] = useState<{
    item: InboxItem;
    body: AssetDecisionBody;
    failures: readonly CriticFailure[];
  } | null>(null);

  const { mutate: globalMutate } = useSWRConfig();

  const { seriesId } = useWorkspaceScope();
  const { data, mutate } = useSWR<{ data: InboxItem[]; meta?: { total: number } }>(
    `/api/director/inbox?filter=${filter}&limit=50${seriesId ? `&series_id=${seriesId}` : ''}`,
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

  // Asset approval gates on screen. Counted separately because clearing them
  // only HIDES them (status stays REVIEW) and is therefore opt-in.
  const assetGateCount = useMemo(
    () => flat.filter((i) => i.id.startsWith('asset:')).length,
    [flat],
  );

  // Rows the checkboxes can reach. Visual rows are excluded by the visual gate
  // (character_consistency.md §3.3) — they must be reviewed in the drawer.
  const selectable = useMemo(() => flat.filter((i) => !i.is_visual), [flat]);
  const allSelected = selectable.length > 0 && selected.size === selectable.length;

  function setSelection(rows: InboxItem[], on: boolean) {
    setSelected((s) => {
      const c = new Set(s);
      for (const r of rows) {
        if (r.is_visual) continue;
        if (on) c.add(r.id);
        else c.delete(r.id);
      }
      return c;
    });
  }

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
      if ((helpOpen || clearOpen || bulkOpen) && e.key !== 'Escape') return;
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
          setBulkOpen(false);
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, focusIdx, helpOpen, clearOpen, bulkOpen]);

  async function act(item: InboxItem, decision: AssetDecisionVerb, note?: string) {
    if (!item.asset_id) return;
    const ack = item.is_visual && decision === 'APPROVE'
      ? window.confirm('Visual asset — confirm preview reviewed before approving?')
      : true;
    if (!ack) return;
    await submitDecision(item, {
      decision,
      ...(note ? { note } : {}),
      ...(item.is_visual ? { preview_acknowledged: true } : {}),
    });
  }

  /**
   * The single exit point for every inbox decision POST.
   *
   * Until 2026-07-29 this call ignored `res.ok` outright, so a refused approve —
   * including the new critic-verdict gate — left the row sitting there with no
   * message at all: the Director's read was "the Approve button is broken".
   * Now every refusal is shown, and a frozen critic verdict opens the override
   * dialog with the critic's own words.
   */
  async function submitDecision(item: InboxItem, body: AssetDecisionBody) {
    if (!item.asset_id) return;
    setActError(null);
    try {
      await postAssetDecision(item.asset_id, body);
      setCriticBlock(null);
      setSelected((s) => {
        const c = new Set(s);
        c.delete(item.id);
        return c;
      });
      mutate();
    } catch (e) {
      if (e instanceof CriticVerdictBlockedError) {
        setCriticBlock({ item, body, failures: e.failures });
        return;
      }
      setCriticBlock(null);
      setActError(`${item.title} — ${(e as Error).message}`);
    }
  }

  // Per-item POSTs on purpose: there is no bulk endpoint, and every decision
  // goes through submitDecision, so a refusal (critic gate included) surfaces.
  async function bulkApprove() {
    const ids = Array.from(selected);
    setBulkOpen(false);
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
    await postClear({ filter, include_assets: includeAssets }, (d) => {
      const bits: string[] = [];
      if (d.cleared) bits.push(`${d.cleared} notification${d.cleared === 1 ? '' : 's'}`);
      if (d.assets_hidden) {
        bits.push(`${d.assets_hidden} approval gate${d.assets_hidden === 1 ? '' : 's'} hidden`);
      }
      return bits.length === 0
        ? 'Nothing to clear in this view.'
        : `Cleared ${bits.join(' · ')}.`;
    });
    setClearOpen(false);
  }

  // Recovery for the `hidden` pill — un-stamps the swept assets so they return
  // to triage. Nothing about their status ever changed, so there is no decision
  // to undo, only visibility.
  async function restoreHidden() {
    await postClear({ filter: 'all', restore: true }, (d) =>
      d.assets_restored === 0
        ? 'Nothing hidden to restore.'
        : `Restored ${d.assets_restored} approval gate${d.assets_restored === 1 ? '' : 's'} to triage.`,
    );
  }

  interface ClearResponse {
    cleared: number;
    assets_hidden: number;
    assets_restored: number;
  }

  async function postClear(
    body: Record<string, unknown>,
    describe: (d: ClearResponse) => string,
  ) {
    setClearing(true);
    try {
      const res = await fetch('/api/director/inbox/clear', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as
        | { success: true; data: ClearResponse }
        | { success: false; error: string };
      if (!res.ok || !json.success) {
        setClearResult(
          `Clear failed: ${json.success === false ? json.error : res.statusText}`,
        );
        return;
      }
      setClearResult(describe(json.data));
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
            disabled={(clearableCount === 0 && assetGateCount === 0) || clearing}
            title={
              clearableCount === 0 && assetGateCount === 0
                ? 'Nothing to clear in this view'
                : `${clearableCount} notification${clearableCount === 1 ? '' : 's'} · ${assetGateCount} approval gate${assetGateCount === 1 ? '' : 's'}`
            }
          >
            <Trash2 size={14} /> Clear inbox
            {clearableCount + assetGateCount > 0 && (
              <span className="text-text-muted">· {clearableCount + assetGateCount}</span>
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

      {actError && (
        <div
          className="mb-4 rounded-lg border px-3 py-2 text-xs flex items-start gap-2"
          role="alert"
          style={{
            borderColor: 'color-mix(in oklab, var(--accent-danger) 40%, transparent)',
            background: 'color-mix(in oklab, var(--accent-danger) 10%, transparent)',
            color: 'var(--accent-danger)',
          }}
        >
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span className="leading-snug">{actError}</span>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-5">
        <Filter size={14} className="text-text-muted" />
        {FILTERS.map((f) => (
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

        {selectable.length > 0 && (
          <label className="ml-auto flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                // Indeterminate is not expressible as a prop.
                if (el) el.indeterminate = selected.size > 0 && !allSelected;
              }}
              onChange={(e) => setSelection(selectable, e.target.checked)}
              aria-label="Select all non-visual items in this view"
            />
            Select all · {selectable.length}
          </label>
        )}
      </div>

      {filter === 'hidden' && (
        <Card className="mb-4">
          <CardBody>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-text-primary">
                  Hidden approval gates — {flat.length} shown
                </div>
                <p className="text-xs text-text-secondary mt-1">
                  Swept out of triage by a previous clear. Still <strong>REVIEW</strong> —
                  nothing was approved or rejected, and they remain reachable from their
                  episode.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={restoreHidden}
                disabled={clearing || flat.length === 0}
              >
                <RotateCcw size={14} /> {clearing ? 'Restoring…' : 'Restore all'}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Bulk bar */}
      {selected.size > 0 && (
        <Card className="mb-4">
          <CardBody>
            <div className="flex items-center justify-between">
              <span className="text-sm">
                <strong>{selected.size}</strong> selected (non-visual only)
              </span>
              <div className="flex gap-2">
                <Button onClick={() => setBulkOpen(true)}>Bulk approve</Button>
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
            <div className="flex items-center gap-2 mb-2">
              {(() => {
                const pick = rows.filter((r) => !r.is_visual);
                if (pick.length === 0) return <span className="w-4" />;
                const on = pick.every((r) => selected.has(r.id));
                return (
                  <input
                    type="checkbox"
                    checked={on}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = !on && pick.some((r) => selected.has(r.id));
                      }
                    }}
                    onChange={(e) => setSelection(pick, e.target.checked)}
                    aria-label={`Select all in ${GROUP_LABEL[g]}`}
                  />
                );
              })()}
              <span className="text-xs uppercase tracking-wider text-text-muted">
                {GROUP_LABEL[g]} · {rows.length}
              </span>
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

      <CriticVerdictOverrideModal
        open={criticBlock !== null}
        subjectLabel={criticBlock?.item.title}
        failures={criticBlock?.failures ?? []}
        onCancel={() => setCriticBlock(null)}
        onOverride={async () => {
          if (!criticBlock) return;
          await submitDecision(criticBlock.item, withCriticOverride(criticBlock.body));
        }}
      />

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
        <div className="space-y-4">
          <p className="text-text-secondary">
            Hides {clearableCount} notification{clearableCount === 1 ? '' : 's'} in the{' '}
            <strong className="text-text-primary">{filter.replace('_', '-')}</strong> view.
            Nothing is decided.
          </p>

          <label
            className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer text-text-primary"
            style={{ borderColor: 'var(--panel-glass-border)' }}
          >
            <input
              type="checkbox"
              checked={includeAssets}
              onChange={(e) => setIncludeAssets(e.target.checked)}
              className="h-4 w-4 shrink-0"
              disabled={assetGateCount === 0}
            />
            <span>
              Also hide {assetGateCount} asset{assetGateCount === 1 ? '' : 's'} awaiting
              approval
            </span>
          </label>

          <details>
            <summary className="text-sm text-text-muted cursor-pointer">Подробнее</summary>
            <ul className="space-y-1.5 text-sm text-text-muted mt-2">
              <li>
                Hidden assets stay REVIEW, fire no pipeline event, and come back via the{' '}
                <code>hidden</code> filter.
              </li>
              <li>
                Never cleared: Bible extension proposals and Skill Editor rule proposals —
                the decision lives inside those items.
              </li>
              <li>Anything past the 50-row page is swept too. Both actions are audited.</li>
            </ul>
          </details>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setClearOpen(false)} disabled={clearing}>
              Cancel
            </Button>
            <Button variant="danger" onClick={clearInbox} disabled={clearing}>
              {clearing ? 'Clearing…' : includeAssets ? 'Clear all' : 'Clear notifications'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk approve">
        <div className="space-y-4">
          <p className="text-text-secondary">
            Approves <strong className="text-text-primary">{selected.size}</strong> non-visual
            item{selected.size === 1 ? '' : 's'}. Each one advances its stage of the pipeline.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={bulkApprove}>Approve {selected.size}</Button>
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
