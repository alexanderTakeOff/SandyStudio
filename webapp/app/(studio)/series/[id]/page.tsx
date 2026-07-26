// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/series/[id]/page.tsx
// Series detail page with tabs:
//   • Overview — series metadata + episode list
//   • Bible    — Series Bible (General idea text + Library of canonical refs)
//
// Spec: specs/company/series_bible.md
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import useSWR from 'swr';
import { ChevronLeft, BookOpen, Layers, Lightbulb } from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody } from '@/components/ui/Card';
import { fetcher } from '@/lib/swr';
import { SeriesBibleView } from '@/components/series-bible/SeriesBibleView';
import { SeriesThemesView } from '@/components/series-themes/SeriesThemesView';
import { SeriesDistributionCard } from '@/components/series/SeriesDistributionCard';

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
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ChannelRow {
  id: string;
  name: string;
  credential_key: string;
  status: string;
}

type Tab = 'overview' | 'bible' | 'themes';

export default function SeriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab: Tab = (search?.get('tab') as Tab) ?? 'overview';

  const { data, isLoading, error, mutate } = useSWR<{
    data: { series: SeriesRow; episode_count: number };
  }>(`/api/series/${id}`, fetcher);
  const series = data?.data?.series;

  const setTab = (t: Tab) => {
    const sp = new URLSearchParams(search?.toString() ?? '');
    if (t === 'overview') sp.delete('tab');
    else sp.set('tab', t);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <StudioContentFrame>
      <div className="mb-3">
        <Link
          href="/series"
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <ChevronLeft size={12} /> Series
        </Link>
      </div>

      {isLoading && <p className="text-xs text-text-muted">Loading…</p>}
      {error && (
        <p className="text-sm" style={{ color: 'var(--accent-danger)' }}>
          Failed to load series.
        </p>
      )}

      {series && (
        <>
          <header className="mb-4">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-text-primary font-mono">
                {series.code}
              </h1>
              <span className="text-base text-text-secondary">{series.title}</span>
            </div>
            {series.logline && (
              <p className="mt-1 text-sm text-text-secondary">{series.logline}</p>
            )}
          </header>

          <nav className="flex items-center gap-1 mb-5 border-b border-glass">
            <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={<Layers size={14} />}>
              Overview
            </TabButton>
            <TabButton active={tab === 'bible'} onClick={() => setTab('bible')} icon={<BookOpen size={14} />}>
              Bible
            </TabButton>
            <TabButton active={tab === 'themes'} onClick={() => setTab('themes')} icon={<Lightbulb size={14} />}>
              Themes
            </TabButton>
          </nav>

          {tab === 'overview' && <OverviewTab series={series} onChanged={() => void mutate()} />}
          {tab === 'bible' && <SeriesBibleView seriesId={series.id} seriesCode={series.code} seriesTitle={series.title} />}
          {tab === 'themes' && <SeriesThemesView seriesId={series.id} />}
        </>
      )}
    </StudioContentFrame>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 h-9 text-sm transition-colors rounded-t-md"
      style={{
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        borderBottom: active ? '2px solid var(--accent-primary)' : '2px solid transparent',
        marginBottom: '-1px',
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function OverviewTab({ series, onChanged }: { series: SeriesRow; onChanged: () => void }) {
  return (
    <div className="grid gap-3">
      <Card>
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {series.audience && (
              <>
                <dt className="text-text-muted text-xs uppercase tracking-wider">Audience</dt>
                <dd className="text-text-primary">{series.audience}</dd>
              </>
            )}
            {series.genre && (
              <>
                <dt className="text-text-muted text-xs uppercase tracking-wider">Genre</dt>
                <dd className="text-text-primary">{series.genre}</dd>
              </>
            )}
            {series.episode_budget_ceiling != null && (
              <>
                <dt className="text-text-muted text-xs uppercase tracking-wider">Budget / episode</dt>
                <dd className="text-text-primary font-mono">${series.episode_budget_ceiling.toFixed(2)}</dd>
              </>
            )}
            <dt className="text-text-muted text-xs uppercase tracking-wider">Status</dt>
            <dd className="text-text-primary">{series.status}</dd>
            <dt className="text-text-muted text-xs uppercase tracking-wider">Channel</dt>
            <dd>
              <ChannelAttach seriesId={series.id} channelId={series.channel_id} onChanged={onChanged} />
            </dd>
            <dt className="text-text-muted text-xs uppercase tracking-wider">Created</dt>
            <dd className="text-text-primary">{new Date(series.created_at).toLocaleDateString()}</dd>
          </dl>
        </CardBody>
      </Card>

      {/* Phase 4c — series-level distribution/branding overrides (agents read these). */}
      <SeriesDistributionCard seriesId={series.id} metadata={series.metadata} onChanged={onChanged} />

      <Link
        href={`/episodes?series_id=${series.id}`}
        className="text-xs text-[var(--accent-primary)] hover:brightness-125 inline-block"
      >
        View episodes →
      </Link>
    </div>
  );
}

/**
 * Channel attach/detach selector (multi-channel Phase 2). A series without a
 * channel HALTs at publish/analytics gates — this is the UI that satisfies
 * that gate. PATCH /api/series/[id] is channel_id-only by design.
 */
function ChannelAttach({
  seriesId,
  channelId,
  onChanged,
}: {
  seriesId: string;
  channelId: string | null;
  onChanged: () => void;
}) {
  const { data } = useSWR<{ data: ChannelRow[] }>('/api/channels', fetcher);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channels = data?.data ?? [];

  async function attach(next: string) {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/series/${seriesId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel_id: next || null }),
    });
    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Attach failed');
      return;
    }
    onChanged();
  }

  return (
    <div className="space-y-1">
      <select
        value={channelId ?? ''}
        disabled={pending}
        onChange={(e) => void attach(e.target.value)}
        className="h-8 px-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-xs text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
      >
        <option value="">— no channel (publish blocked)</option>
        {channels.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {c.credential_key}
            {c.status !== 'ACTIVE' ? ` (${c.status})` : ''}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-[11px]" style={{ color: 'var(--accent-danger)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
