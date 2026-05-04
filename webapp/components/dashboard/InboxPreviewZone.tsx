// ──────────────────────────────────────────────────────────────────────────────
// components/dashboard/InboxPreviewZone.tsx
// Dashboard Zone 1 — Director Inbox preview per dashboard_cockpit.md §3.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { ArrowRight, AlertTriangle, Inbox } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { fetcher } from '@/lib/swr';
import {
  InboxNotePromptModal,
  type InboxNoteDecision,
} from '@/components/inbox/InboxNotePromptModal';

interface InboxItem {
  id: string;
  group: 'needs_approval' | 'needs_decision' | 'awaiting_input' | 'blocked';
  title: string;
  subtitle: string;
  is_visual: boolean;
  cta: Array<{ label: string; intent: 'primary' | 'secondary' | 'destructive'; action: string }>;
  asset_id?: string;
  episode_id?: string;
}

const INTENT_CLASS: Record<string, string> = {
  primary: 'bg-[var(--accent-primary)] text-[var(--text-inverse)]',
  secondary: 'bg-transparent border border-glass text-text-secondary hover:bg-[var(--panel-hover-bg)]',
  destructive: 'bg-[var(--accent-danger)] text-white',
};

export function InboxPreviewZone() {
  const { data, error, isLoading, mutate } = useSWR<{
    success: boolean;
    data: InboxItem[];
    meta: { total: number };
  }>('/api/director/inbox?limit=5', fetcher, { refreshInterval: 30_000 });

  const items = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const [notePrompt, setNotePrompt] = useState<{
    item: InboxItem;
    decision: InboxNoteDecision;
  } | null>(null);

  async function postDecision(item: InboxItem, decision: string, note?: string) {
    if (!item.asset_id) return;
    if (decision === 'APPROVE' && item.is_visual) {
      const ack = window.confirm('Visual asset — confirm preview reviewed?');
      if (!ack) return;
    }
    await fetch(`/api/assets/${item.asset_id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decision,
        note,
        preview_acknowledged: decision === 'APPROVE' && item.is_visual ? true : undefined,
      }),
    });
    mutate();
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Inbox size={14} className="text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">
              {total === 0 ? 'Inbox is clear' : `Inbox · ${total} items`}
            </span>
          </div>
          <Link
            href="/inbox"
            className="text-xs text-text-secondary hover:text-text-primary inline-flex items-center gap-1"
          >
            Open Inbox <ArrowRight size={12} />
          </Link>
        </div>

        {error && (
          <p className="text-xs text-[var(--accent-danger)]">Failed to load inbox</p>
        )}

        {isLoading && (
          <p className="text-xs text-text-muted">Loading…</p>
        )}

        {!isLoading && items.length === 0 && (
          <p className="text-sm text-text-secondary leading-relaxed">
            Nothing is waiting on you right now. Active episodes are continuing autonomously.
          </p>
        )}

        <div className="space-y-2">
          {items.map((it, i) => (
            <div
              key={it.id}
              className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-glass bg-panel-glass-strong"
            >
              <span className="text-xs text-text-muted font-mono mt-0.5 w-4">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary truncate">
                    {it.title}
                  </span>
                  {it.is_visual && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{
                        background: 'color-mix(in oklab, var(--accent-warning) 14%, transparent)',
                        color: 'var(--accent-warning)',
                      }}
                    >
                      <AlertTriangle size={9} />
                      visual
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-text-muted mt-0.5">{it.subtitle}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {it.cta.slice(0, 3).map((b) => (
                    <button
                      key={b.action}
                      onClick={() => {
                        const map: Record<string, string> = {
                          approve: 'APPROVE',
                          revise: 'REQUEST_REVISION',
                          reject: 'REJECT',
                          needs_human_tweak: 'NEEDS_HUMAN_TWEAK',
                        };
                        const decision = map[b.action];
                        if (!decision) return;
                        if (decision === 'REQUEST_REVISION' || decision === 'REJECT') {
                          setNotePrompt({ item: it, decision: decision as InboxNoteDecision });
                        } else {
                          void postDecision(it, decision);
                        }
                      }}
                      className={`px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors ${INTENT_CLASS[b.intent]}`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
