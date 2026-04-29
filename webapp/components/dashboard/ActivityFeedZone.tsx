// ──────────────────────────────────────────────────────────────────────────────
// components/dashboard/ActivityFeedZone.tsx
// Dashboard Zone 3 — Live activity feed per dashboard_cockpit.md §5.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Activity, ArrowRight } from 'lucide-react';
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

export function ActivityFeedZone() {
  const { data, error, isLoading } = useSWR<{
    success: boolean;
    data: ActivityRow[];
  }>('/api/activity?limit=10', fetcher, { refreshInterval: 30_000 });

  const events = data?.data ?? [];

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">Live activity</span>
          </div>
          <Link
            href="/activity"
            className="text-xs text-text-secondary hover:text-text-primary inline-flex items-center gap-1"
          >
            See full feed <ArrowRight size={12} />
          </Link>
        </div>

        {error && <p className="text-xs text-[var(--accent-danger)]">Failed to load activity</p>}
        {isLoading && <p className="text-xs text-text-muted">Loading…</p>}
        {!isLoading && events.length === 0 && (
          <p className="text-sm text-text-secondary">No recent activity.</p>
        )}

        <div className="space-y-2">
          {events.map((e) => (
            <div
              key={e.id}
              className="flex gap-3 px-3 py-2 rounded-lg border border-glass bg-panel-glass-strong"
            >
              <div
                className="w-0.5 rounded-full self-stretch shrink-0"
                style={{
                  background: SEVERITY_COLOR[e.severity] ?? 'var(--text-muted)',
                  opacity: 0.7,
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-text-primary font-medium">{e.title}</span>
                  <span className="text-text-muted">·</span>
                  <span className="text-text-muted">{relativeTime(e.created_at)}</span>
                </div>
                {e.description && (
                  <div className="text-[11px] text-text-secondary mt-0.5 truncate">
                    {e.description}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
