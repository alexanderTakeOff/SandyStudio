// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/series/page.tsx — Series list + "+ New Series" CTA.
// Authority Matrix per-row editing UI lands in Phase 7.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Folders } from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SeriesForm } from '@/components/series/SeriesForm';
import { fetcher } from '@/lib/swr';

interface SeriesRow {
  id: string;
  code: string;
  title: string;
  audience: string | null;
  genre: string | null;
  logline: string | null;
  episode_budget_ceiling: number | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  channel_id: string | null;
  created_at: string;
}

interface ChannelRow {
  id: string;
  name: string;
  credential_key: string;
}

export default function SeriesPage() {
  const [newOpen, setNewOpen] = useState(false);
  const { data, isLoading, mutate } = useSWR<{ data: SeriesRow[] }>(
    '/api/series',
    fetcher,
    { refreshInterval: 60_000 },
  );
  const { data: channelsData } = useSWR<{ data: ChannelRow[] }>('/api/channels', fetcher);
  const channelById = new Map((channelsData?.data ?? []).map((c) => [c.id, c]));
  const series = data?.data ?? [];

  return (
    <StudioContentFrame>
      <header className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <Folders size={18} className="text-text-secondary" />
            <h1 className="text-2xl font-semibold text-text-primary">Series</h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Each series is a universe. Bibles populate during episode 1 production.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus size={14} /> New Series
        </Button>
      </header>

      {isLoading && <p className="text-xs text-text-muted">Loading…</p>}

      {!isLoading && series.length === 0 && (
        <Card>
          <CardBody>
            <div className="text-center py-12">
              <p className="text-base text-text-primary">No series yet.</p>
              <p className="text-sm text-text-secondary mt-2">
                Run the setup wizard or create one directly.
              </p>
              <div className="mt-4 flex gap-2 justify-center">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center justify-center px-4 h-10 text-sm rounded-lg border border-glass text-text-secondary hover:bg-[var(--panel-hover-bg)] transition-colors"
                >
                  Run setup wizard →
                </Link>
                <Button onClick={() => setNewOpen(true)}>
                  <Plus size={14} /> New Series
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-3">
        {series.map((s) => (
          <Card key={s.id}>
            <CardBody>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-base font-mono text-text-primary">{s.code}</span>
                    <span className="text-sm text-text-secondary truncate">{s.title}</span>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="mt-1 text-[11px] text-text-muted flex flex-wrap gap-2">
                    <span title={s.channel_id ? 'YouTube channel' : 'No channel — publish/analytics will HALT until one is attached'}>
                      📺 {s.channel_id ? (channelById.get(s.channel_id)?.name ?? 'channel') : 'no channel'}
                    </span>
                    <span>·</span>
                    {s.audience && <span>{s.audience}</span>}
                    {s.genre && <><span>·</span><span>{s.genre}</span></>}
                    {s.episode_budget_ceiling != null && (
                      <>
                        <span>·</span>
                        <span>${s.episode_budget_ceiling.toFixed(2)}/episode</span>
                      </>
                    )}
                    <span>·</span>
                    <span>created {new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                  {s.logline && (
                    <p className="mt-2 text-sm text-text-secondary leading-relaxed">{s.logline}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <Link
                    href={`/series/${s.id}?tab=bible`}
                    className="text-xs text-[var(--accent-primary)] hover:brightness-125"
                  >
                    Open Bible →
                  </Link>
                  <Link
                    href={`/episodes?series_id=${s.id}`}
                    className="text-xs text-text-secondary hover:text-text-primary"
                  >
                    Episodes →
                  </Link>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <NewSeriesModal
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

function StatusBadge({ status }: { status: SeriesRow['status'] }) {
  const color =
    status === 'ACTIVE'
      ? 'var(--accent-success)'
      : status === 'DRAFT'
      ? 'var(--accent-info)'
      : 'var(--text-muted)';
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded uppercase tracking-wider text-[10px] font-semibold"
      style={{
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
        color,
      }}
    >
      {status.toLowerCase()}
    </span>
  );
}

function NewSeriesModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="New series" size="md">
      <SeriesForm
        onCreated={() => onCreated()}
        secondaryAction={
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        }
      />
    </Modal>
  );
}
