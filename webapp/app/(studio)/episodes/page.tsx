// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/episodes/page.tsx — Episodes list. Link to /episodes/[id]
// (Pipeline View). + New Episode CTA. Filterable by status / series.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Film } from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { fetcher } from '@/lib/swr';
import { NewEpisodeModal } from '@/components/episodes/NewEpisodeModal';

interface EpisodeRow {
  id: string;
  episode_code: string;
  title_working: string | null;
  status: string;
  governance_mode: number;
  budget_ceiling: number | null;
  budget_spent: number | null;
  series_id: string;
  created_at: string;
}

const ACTIVE_FILTER: Record<string, (e: EpisodeRow) => boolean> = {
  all: () => true,
  active: (e) => e.status !== 'COMPLETE',
  complete: (e) => e.status === 'COMPLETE',
};

type Filter = keyof typeof ACTIVE_FILTER;

export default function EpisodesPage() {
  const [filter, setFilter] = useState<Filter>('active');
  const [newOpen, setNewOpen] = useState(false);
  const { data, isLoading, mutate } = useSWR<{ data: EpisodeRow[] }>(
    '/api/episodes?limit=100',
    fetcher,
    { refreshInterval: 30_000 },
  );
  const episodes = (data?.data ?? []).filter(ACTIVE_FILTER[filter] ?? (() => true));

  return (
    <StudioContentFrame>
      <header className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <Film size={18} className="text-text-secondary" />
            <h1 className="text-2xl font-semibold text-text-primary">Episodes</h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Every episode across all series. Click one to open its pipeline view.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus size={14} /> New Episode
        </Button>
      </header>

      <div className="flex gap-2 mb-4">
        {(['active', 'all', 'complete'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 h-8 rounded-md text-xs font-medium uppercase tracking-wider border transition-colors"
            style={{
              borderColor: filter === f ? 'var(--accent-primary)' : 'var(--panel-glass-border)',
              background: filter === f
                ? 'color-mix(in oklab, var(--accent-primary) 14%, transparent)'
                : 'transparent',
              color: filter === f ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-xs text-text-muted">Loading…</p>}
      {!isLoading && episodes.length === 0 && (
        <Card>
          <CardBody>
            <div className="text-center py-12">
              <p className="text-base text-text-primary">No episodes yet.</p>
              <p className="text-sm text-text-secondary mt-2">
                Create the first one — agents will start picking up the brief once it&rsquo;s approved.
              </p>
              <div className="mt-4">
                <Button onClick={() => setNewOpen(true)}>
                  <Plus size={14} /> Create first episode
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-3">
        {episodes.map((ep) => (
          <Link
            key={ep.id}
            href={`/episodes/${ep.id}`}
            className="block rounded-xl border border-glass bg-panel-glass-strong px-4 py-3 hover:border-glass-active transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-mono text-text-primary">{ep.episode_code}</span>
                  {ep.title_working && (
                    <span className="text-xs text-text-secondary truncate">
                      &ldquo;{ep.title_working}&rdquo;
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-text-muted mt-0.5 flex gap-2">
                  <span>{ep.status.replace(/_/g, ' ').toLowerCase()}</span>
                  <span>·</span>
                  <span>Mode {ep.governance_mode}</span>
                  <span>·</span>
                  <span>
                    ${(ep.budget_spent ?? 0).toFixed(2)} / ${(ep.budget_ceiling ?? 0).toFixed(2)}
                  </span>
                </div>
              </div>
              <span className="text-xs text-text-muted">
                {new Date(ep.created_at).toLocaleDateString()}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <NewEpisodeModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={() => {
          setNewOpen(false);
          mutate();
        }}
      />
    </StudioContentFrame>
  );
}
