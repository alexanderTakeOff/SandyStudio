// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/activity/page.tsx — Global activity feed page.
// Linked from Dashboard Zone 3 "See full feed →".
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Activity } from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody } from '@/components/ui/Card';
import { fetcher } from '@/lib/swr';

interface ActivityRow {
  id: string;
  event_type: string;
  severity: string;
  title: string;
  description: string | null;
  actor: string | null;
  episode_id: string | null;
  created_at: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  info: 'var(--accent-info)',
  warning: 'var(--accent-warning)',
  error: 'var(--accent-danger)',
};

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function ActivityPage() {
  const [severity, setSeverity] = useState<'all' | 'info' | 'warning' | 'error'>('all');
  const url =
    severity === 'all' ? '/api/activity?limit=100' : `/api/activity?severity=${severity}&limit=100`;
  const { data, isLoading } = useSWR<{ data: ActivityRow[] }>(url, fetcher, {
    refreshInterval: 30_000,
  });
  const events = data?.data ?? [];

  return (
    <StudioContentFrame>
      <header className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-text-secondary" />
            <h1 className="text-2xl font-semibold text-text-primary">Activity</h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Studio-wide event feed. Auto-refreshes every 30 seconds.
          </p>
        </div>
        <div className="flex gap-2">
          {(['all', 'info', 'warning', 'error'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSeverity(s)}
              className="px-3 h-8 rounded-md text-xs font-medium uppercase tracking-wider border transition-colors"
              style={{
                borderColor: severity === s ? 'var(--accent-primary)' : 'var(--panel-glass-border)',
                background: severity === s
                  ? 'color-mix(in oklab, var(--accent-primary) 14%, transparent)'
                  : 'transparent',
                color: severity === s ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </header>

      <Card>
        <CardBody>
          {isLoading && <p className="text-xs text-text-muted">Loading…</p>}
          {!isLoading && events.length === 0 && (
            <p className="text-sm text-text-secondary">No events match this filter.</p>
          )}
          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.id} className="flex gap-3 px-3 py-2 rounded-lg border border-glass bg-panel-glass-strong">
                <div
                  className="w-0.5 rounded-full self-stretch shrink-0"
                  style={{ background: SEVERITY_COLOR[e.severity] ?? 'var(--text-muted)', opacity: 0.7 }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-text-primary font-medium">{e.title}</span>
                    <span className="text-text-muted">·</span>
                    <span className="text-text-muted">{e.event_type}</span>
                    <span className="text-text-muted">·</span>
                    <span className="text-text-muted">{relativeTime(e.created_at)}</span>
                  </div>
                  {e.description && (
                    <div className="text-[12px] text-text-secondary mt-1 leading-snug">
                      {e.description}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </StudioContentFrame>
  );
}
