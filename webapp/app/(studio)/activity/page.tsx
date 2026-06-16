// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/activity/page.tsx — Global activity feed page.
// Linked from Dashboard Zone 3 "See full feed →".
// Rows render via the shared ActivityEventRow; this page owns the severity
// filter + page chrome only.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Activity } from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody } from '@/components/ui/Card';
import { fetcher } from '@/lib/swr';
import { ActivityEventRow, type ActivityEventLike } from '@/components/activity/ActivityEventRow';

export default function ActivityPage() {
  const [severity, setSeverity] = useState<'all' | 'info' | 'warning' | 'error'>('all');
  const url =
    severity === 'all' ? '/api/activity?limit=100' : `/api/activity?severity=${severity}&limit=100`;
  const { data, isLoading } = useSWR<{ data: ActivityEventLike[] }>(url, fetcher, {
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
              <ActivityEventRow key={e.id} event={e} showType />
            ))}
          </div>
        </CardBody>
      </Card>
    </StudioContentFrame>
  );
}
