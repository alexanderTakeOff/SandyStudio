// ──────────────────────────────────────────────────────────────────────────────
// components/dashboard/ActivityFeedZone.tsx
// Dashboard Zone 3 — Live activity feed per dashboard_cockpit.md §5.
// Row rendering (severity bar, Director highlight, …) is the shared
// ActivityEventRow; this component owns only the data fetch + card chrome.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Activity, ArrowRight } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { fetcher } from '@/lib/swr';
import { ActivityEventRow, type ActivityEventLike } from '@/components/activity/ActivityEventRow';

export function ActivityFeedZone() {
  const { data, error, isLoading } = useSWR<{
    success: boolean;
    data: ActivityEventLike[];
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
            <ActivityEventRow key={e.id} event={e} />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
