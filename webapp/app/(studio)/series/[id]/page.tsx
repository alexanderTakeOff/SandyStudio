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
import { ChevronLeft, BookOpen, Layers } from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody } from '@/components/ui/Card';
import { fetcher } from '@/lib/swr';
import { SeriesBibleView } from '@/components/series-bible/SeriesBibleView';

interface SeriesRow {
  id: string;
  code: string;
  title: string;
  audience: string | null;
  genre: string | null;
  logline: string | null;
  episode_budget_ceiling: number | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  created_at: string;
}

type Tab = 'overview' | 'bible';

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

  const { data, isLoading, error } = useSWR<{
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
          </nav>

          {tab === 'overview' && <OverviewTab series={series} />}
          {tab === 'bible' && <SeriesBibleView seriesId={series.id} seriesCode={series.code} seriesTitle={series.title} />}
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

function OverviewTab({ series }: { series: SeriesRow }) {
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
            <dt className="text-text-muted text-xs uppercase tracking-wider">Created</dt>
            <dd className="text-text-primary">{new Date(series.created_at).toLocaleDateString()}</dd>
          </dl>
        </CardBody>
      </Card>

      <Link
        href={`/episodes?series_id=${series.id}`}
        className="text-xs text-[var(--accent-primary)] hover:brightness-125 inline-block"
      >
        View episodes →
      </Link>
    </div>
  );
}
