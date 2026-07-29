// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/factory/page.tsx — Factory Overview: the whole-factory ADAPTATION
// picture (slow-loop trends across episodes). Source: /api/factory.
//
// v2 (Director review 2026-07-16): relevant-episode filter, 3-way touch split
// (Director / Polina / AI-EP), pre/post-cast normalized (post = %/shot, pre =
// /stage, churn = /shot), budget (total + $/shot from budget_spent, folded
// per-agent/endpoint from budget_log), and toggle-able trend charts (hand-rolled
// SVG, theme tokens — no chart lib, per repo precedent).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useMemo, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { Factory, TriangleAlert, RefreshCw, DollarSign, ChevronDown } from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { fetcher } from '@/lib/swr';
import { usePersistentState, usePersistentSet } from '@/lib/use-persistent-state';

interface Buckets { director: number; polina: number; aiEp: number; total: number }
interface CostFold { key: string; costUsd: number; calls: number }
interface CriticVerdict { critic: string; verdict: string; reviseCount: number; repeatedPoints: string[] }
interface FactoryEpisode {
  episodeId: string;
  episodeCode: string;
  createdAt: string;
  status: string;
  archived: boolean;
  reachedFinalCut: boolean;
  shotCount: number;
  productionStarted: boolean;
  touches: {
    all: Buckets; pre: Buckets; post: Buckets;
    leadershipTotal: number;
    leadershipPerShot: number | null;
    postLeadershipPerShot: number | null;
    preStages: number; prePerStage: number;
    postCastRework: number; reworkPerShot: number | null;
  };
  churn: {
    trueChurn: number | null; truePerShot: number | null; naivePerShot: number;
    producerFirstPassRejectRate: number | null; reworkRegens: number | null;
  };
  autonomyPct: number | null;
  agentFailures: number;
  // The PRODUCTION WINDOW: (first ref-design render → last auto-stitch]. Same
  // meters as above but bounded at both ends, so publishing/thumbnail/copy work
  // after the cut no longer lands on production's bill.
  production: {
    startedAt: string | null; endedAt: string | null; open: boolean; spanHours: number | null;
    touches: Buckets;
    leadershipTotal: number; leadershipPerShot: number | null;
    rework: number; reworkPerShot: number | null;
    costUsd: number; costPerShot: number | null; costItemized: boolean;
  };
  budget: {
    total: number; perShot: number | null; reservationOnly: boolean;
    reservedTotal: number; itemizedTotal: number;
    preCast: number | null; postCast: number | null; byAgent: CostFold[]; byOp: CostFold[];
  };
  criticVerdicts: CriticVerdict[];
}
interface OpenProposal { episodeCode: string; critic: string; zone: string; action: string; target: string }
interface FactoryData {
  generatedAt: string;
  directorTouchTarget: number;
  episodes: FactoryEpisode[];
  openProposals: OpenProposal[];
}

const VERDICT_COLOR: Record<string, string> = {
  healthy: 'var(--accent-success)',
  producer_weak_fixable: 'var(--accent-info)',
  producer_gap: 'var(--accent-warning)',
  critic_too_hard: 'var(--accent-orange)',
  critic_inconsistent: 'var(--accent-orange)',
};

// ── Trend series definitions (toggle-able) ────────────────────────────────────
interface Series { key: string; label: string; color: string; value: (e: FactoryEpisode) => number | null; fmt: (n: number) => string }
const usd = (n: number) => `$${n.toFixed(2)}`;
const num = (n: number) => `${n}`;
const pct = (n: number) => `${n}%`;
const SERIES: Series[] = [
  // The headline cost: LEADERSHIP intervention per shot (Director + Polina) → 0.
  { key: 'postLeadPerShot', label: '⚑ leadership / shot (production)', color: 'var(--accent-danger)', value: (e) => e.touches.postLeadershipPerShot, fmt: num },
  { key: 'director', label: 'L2 · Director / shot', color: 'var(--accent-primary)', value: (e) => e.shotCount ? +((e.touches.post.director) / e.shotCount).toFixed(2) : null, fmt: num },
  { key: 'polina', label: 'L1 · Polina / shot', color: 'var(--accent-purple)', value: (e) => e.shotCount ? +((e.touches.post.polina) / e.shotCount).toFixed(2) : null, fmt: num },
  { key: 'costPerShot', label: '$ / shot', color: 'var(--accent-success)', value: (e) => e.budget.perShot, fmt: usd },
  { key: 'costTotal', label: 'total $', color: 'var(--accent-tertiary)', value: (e) => e.budget.total || null, fmt: (n) => `$${n.toFixed(0)}` },
  { key: 'aiEp', label: 'AI-EP (autonomy)', color: 'var(--accent-info)', value: (e) => e.touches.all.aiEp, fmt: num },
  { key: 'preCastPerStage', label: 'design lead / stage', color: 'var(--accent-orange)', value: (e) => e.touches.prePerStage, fmt: num },
  { key: 'reworkPerShot', label: 'production rework / shot', color: 'var(--accent-warning)', value: (e) => e.touches.reworkPerShot, fmt: num },
  { key: 'churnPerShot', label: 'critic churn / shot', color: 'var(--accent-warning)', value: (e) => e.churn.truePerShot, fmt: num },
  { key: 'autonomy', label: 'autonomy %', color: 'var(--accent-secondary)', value: (e) => e.autonomyPct, fmt: pct },
];
const DEFAULT_SERIES = new Set(['postLeadPerShot', 'director', 'polina', 'costPerShot']);

// ── Small-multiples bar strip: one series across the visible episodes ─────────
function SeriesStrip({ s, episodes }: { s: Series; episodes: FactoryEpisode[] }) {
  const vals = episodes.map((e) => s.value(e));
  // A strip with nothing to plot used to read as a REAL measurement of zero: the
  // `Math.max(1, …)` floor printed "max 1" in the legend while every bar fell to
  // its 2% stub, so "no episodes passed the filter" and "the factory scored zero"
  // looked identical (the 2026-07-19 "trends are flat" report). Say which it is.
  const measured = vals.filter((v): v is number => v !== null);
  const hasData = measured.length > 0;
  const max = hasData ? Math.max(...measured) : 0;
  const scale = max > 0 ? max : 1; // divisor only — never shown as a reading
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
        <span className="text-[11px] font-medium text-text-secondary">{s.label}</span>
        <span className="text-[10px] text-text-muted">
          {hasData ? `· max ${s.fmt(max)}` : '· no data for the selected episodes'}
        </span>
      </div>
      <div className="flex items-end gap-1 h-14">
        {episodes.map((e, i) => {
          const v = vals[i];
          const h = v === null ? 0 : Math.max(2, (v / scale) * 100);
          return (
            <div key={e.episodeId} className="flex-1 h-full flex flex-col items-center justify-end group relative" title={`${e.episodeCode}: ${v === null ? '—' : s.fmt(v)}`}>
              <div
                className="w-full rounded-t"
                style={{
                  height: `${h}%`,
                  background: v === null ? 'var(--bg-elevated)' : `color-mix(in oklab, ${s.color} 80%, transparent)`,
                  minHeight: v === null ? 0 : 2,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 3-way touch stacked bar (Director / Polina / AI-EP) ───────────────────────
function TouchStack({ b }: { b: Buckets }) {
  const total = Math.max(1, b.total);
  const seg = (v: number, color: string, label: string) =>
    v > 0 ? <div style={{ width: `${(v / total) * 100}%`, background: color }} className="h-full" title={`${label}: ${v}`} /> : null;
  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden bg-[var(--bg-elevated)]">
      {seg(b.director, 'var(--accent-primary)', 'Director')}
      {seg(b.polina, 'var(--accent-purple)', 'Polina')}
      {seg(b.aiEp, 'var(--accent-info)', 'AI-EP')}
    </div>
  );
}

function CostFoldList({ rows, label }: { rows: CostFold[]; label: string }) {
  if (rows.length === 0) return null;
  const max = Math.max(1, ...rows.map((r) => r.costUsd));
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">{label}</div>
      <ul className="space-y-1">
        {rows.slice(0, 8).map((r) => (
          <li key={r.key} className="text-[11px]">
            <div className="flex justify-between gap-2 text-text-secondary">
              <span className="truncate">{r.key.replace('EXEC-', '')}</span>
              <span className="tabular-nums text-text-muted shrink-0">{usd(r.costUsd)} · {r.calls}×</span>
            </div>
            <div className="h-1 rounded-full bg-[var(--bg-elevated)] mt-0.5">
              <div className="h-full rounded-full" style={{ width: `${(r.costUsd / max) * 100}%`, background: 'color-mix(in oklab, var(--accent-tertiary) 70%, transparent)' }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── One table skeleton, two column sets (whole-episode / production window) ────
interface Column {
  key: string;
  label: string;
  title?: string;
  align?: 'right';
  cellClass?: string;
  cell: (e: FactoryEpisode) => ReactNode;
}

const pad = (i: number, n: number) => (i === 0 ? 'pr-3' : i === n - 1 ? 'pl-2' : 'px-2');

function EpisodeTable({ columns, rows }: { columns: Column[]; rows: FactoryEpisode[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted text-left border-b border-glass">
            {columns.map((c, i) => (
              <th key={c.key} title={c.title} className={`py-1.5 ${pad(i, columns.length)} font-medium ${c.align === 'right' ? 'text-right' : ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.episodeId} className="border-b border-glass/50">
              {columns.map((c, i) => (
                <td key={c.key} className={`py-1.5 ${pad(i, columns.length)} ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.cellClass ?? ''}`}>
                  {c.cell(e)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// leadership/shot colour scale — shared so both tables read on the same ruler
const leadColor = (v: number | null) =>
  (v ?? 0) <= 0.2 ? 'var(--accent-success)' : (v ?? 0) <= 1 ? 'var(--accent-warning)' : 'var(--accent-danger)';

const epCode = (e: FactoryEpisode) => e.episodeCode.replace('SS-', '');

const COL_EPISODE: Column = {
  key: 'ep', label: 'Episode', cellClass: 'font-mono text-text-primary whitespace-nowrap',
  cell: (e) => (
    <>
      {epCode(e)}
      {!e.productionStarted && <span className="ml-1 text-text-muted" title="production (ref artist) not started">◦</span>}
    </>
  ),
};
const COL_SHOTS: Column = { key: 'shots', label: 'Shots', align: 'right', cellClass: 'text-text-secondary', cell: (e) => e.shotCount };

const tiersCell = (b: Buckets) => (
  <div className="flex items-center gap-2">
    <span className="tabular-nums text-text-secondary w-20 shrink-0">{b.director}·{b.polina}·{b.aiEp}</span>
    <div className="w-24"><TouchStack b={b} /></div>
  </div>
);

// Whole episode — design + production + distribution, every meter the scorecard has.
const COLUMNS_ALL: Column[] = [
  COL_EPISODE,
  COL_SHOTS,
  {
    key: 'lead', label: '⚑ Lead/shot', align: 'right',
    title: 'PRODUCTION-phase LEADERSHIP touches (Director L2 + Polina L1) per shot — the factory-autonomy leak, target 0',
    cell: (e) => <span className="font-medium" style={{ color: leadColor(e.touches.postLeadershipPerShot) }}>{e.touches.postLeadershipPerShot ?? '—'}</span>,
  },
  {
    key: 'tiers', label: 'Tiers (Dir·Pol·AI-EP)',
    title: 'leadership touches, tiered: Director (L2, human) · Polina (L1, AI assistant) · AI-EP (autonomy). Agents = free base, not shown.',
    cell: (e) => tiersCell(e.touches.all),
  },
  { key: 'design', label: 'Design/stage', align: 'right', title: 'design-phase leadership touches per stage', cellClass: 'text-text-secondary', cell: (e) => e.touches.prePerStage },
  {
    key: 'rework', label: 'Rework/shot', align: 'right', title: 'production rework (revise/reject) per shot — secondary quality signal',
    cell: (e) => (
      <span style={{ color: (e.touches.reworkPerShot ?? 0) === 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
        {e.touches.reworkPerShot ?? '—'} <span className="text-text-muted">({e.touches.postCastRework})</span>
      </span>
    ),
  },
  {
    key: 'churn', label: 'Churn/sh', align: 'right', title: 'true REVISE churn / shot', cellClass: 'text-text-secondary',
    cell: (e) => <>{e.churn.truePerShot ?? '—'}<span className="text-text-muted">/{e.churn.naivePerShot}</span></>,
  },
  { key: 'cost', label: '$/shot', align: 'right', cellClass: 'text-text-secondary', cell: (e) => (e.budget.perShot === null ? '—' : usd(e.budget.perShot)) },
  { key: 'auto', label: 'Auto%', align: 'right', cellClass: 'text-text-secondary', cell: (e) => (e.autonomyPct === null ? '—' : `${e.autonomyPct}%`) },
  {
    key: 'verdicts', label: 'Critic verdicts',
    cell: (e) => (
      <div className="flex flex-wrap gap-1">
        {e.criticVerdicts.length === 0 ? <span className="text-text-muted">—</span> : e.criticVerdicts.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[10px] font-medium border"
            style={{ color: VERDICT_COLOR[v.verdict] ?? 'var(--text-muted)', borderColor: VERDICT_COLOR[v.verdict] ?? 'var(--text-muted)' }}
            title={`${v.reviseCount} REVISE${v.repeatedPoints.length ? ` · repeats ${v.repeatedPoints.join(',')}` : ''}`}>
            {v.critic.replace('EXEC-', '')} {v.repeatedPoints.length > 0 && <span className="opacity-70">[{v.repeatedPoints.join(',')}]</span>}
          </span>
        ))}
      </div>
    ),
  },
];

// Production window ONLY — (first ref-design render → FIRST auto-stitch]. The
// SPEED table: what it costs the factory to reach a whole picture. Meters the
// scorecard cannot cut by time (churn, autonomy%, critic verdicts) are absent on
// purpose rather than shown whole and read as production's.
const COLUMNS_PRODUCTION: Column[] = [
  {
    ...COL_EPISODE,
    cell: (e) => (
      <>
        {epCode(e)}
        {e.production.startedAt === null
          ? <span className="ml-1 text-text-muted" title="production never started — nothing in this window">◦</span>
          : e.production.open
            ? <span className="ml-1" style={{ color: 'var(--accent-orange)' }} title="never reached a cut — window still open, numbers still growing">▸</span>
            : null}
      </>
    ),
  },
  COL_SHOTS,
  {
    // THE speed meter of this table. WALL-clock, deliberately labelled as such:
    // docs/topics/factory-autonomy-metrics.md retired "first job → last job" as a
    // reading of production TIME (it swallows debugging days and Director waiting).
    // Kept because the calendar span is itself what waiting drives — but never
    // call it effort.
    key: 'span', label: 'To 1st cut, h', align: 'right',
    title: 'calendar hours from the first ref-design render to the FIRST auto-stitch — how fast the factory reaches a whole picture. Includes waiting and idle time; NOT the sum of task durations, so do not read it as effort',
    cellClass: 'text-text-secondary',
    cell: (e) => (
      <span title={e.production.startedAt ? `${new Date(e.production.startedAt).toLocaleString()} → ${e.production.endedAt ? new Date(e.production.endedAt).toLocaleString() : 'still open'}` : 'production never started'}>
        {e.production.spanHours === null ? '—' : e.production.spanHours}
      </span>
    ),
  },
  {
    key: 'lead', label: '⚑ Lead/shot', align: 'right',
    title: 'leadership touches (Director + Polina) per shot INSIDE the production window — the autonomy leak with distribution work excluded',
    cell: (e) => (
      <span className="font-medium" style={{ color: leadColor(e.production.leadershipPerShot) }}>
        {e.production.leadershipPerShot ?? '—'} <span className="text-text-muted">({e.production.leadershipTotal})</span>
      </span>
    ),
  },
  { key: 'tiers', label: 'Tiers (Dir·Pol·AI-EP)', title: 'touches inside the production window only', cell: (e) => tiersCell(e.production.touches) },
  {
    key: 'rework', label: 'Rework/shot', align: 'right', title: 'revise/reject inside the production window, per shot',
    cell: (e) => (
      <span style={{ color: (e.production.reworkPerShot ?? 0) === 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
        {e.production.reworkPerShot ?? '—'} <span className="text-text-muted">({e.production.rework})</span>
      </span>
    ),
  },
  {
    key: 'cost', label: '$/shot', align: 'right', title: 'itemized spend inside the production window, per shot', cellClass: 'text-text-secondary',
    cell: (e) => (!e.production.costItemized ? <span title="no itemized budget_log — reservation-only episode">—</span> : e.production.costPerShot === null ? '—' : usd(e.production.costPerShot)),
  },
  {
    key: 'costTotal', label: '$ window', align: 'right', title: 'itemized spend inside the production window', cellClass: 'text-text-secondary',
    cell: (e) => (!e.production.costItemized ? '—' : usd(e.production.costUsd)),
  },
];

export default function FactoryPage() {
  const { data, isLoading, error } = useSWR<{ data: FactoryData }>('/api/factory', fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });
  const d = data?.data;

  // ── Filters (#1): exclude archived (default), show all, exact episodes ──
  // Persisted (Director 2026-07-21: "иначе устану тыкать кнопочки каждый раз").
  // `expandBudget` deliberately stays ephemeral — it is a per-visit disclosure,
  // not a preference, and restoring an open drawer on load is noise.
  const [excludeArchived, setExcludeArchived] = usePersistentState('factory.excludeArchived', true);
  const [showAll, setShowAll] = usePersistentState('factory.showAll', false);
  const [picked, setPicked] = usePersistentSet('factory.picked', []);
  const [enabledSeries, setEnabledSeries] = usePersistentSet('factory.series', DEFAULT_SERIES);
  const [expandBudget, setExpandBudget] = useState<string | null>(null);

  const visible = useMemo(() => {
    const all = d?.episodes ?? [];
    let base = excludeArchived ? all.filter((e) => !e.archived) : all;
    if (picked.size > 0) return base.filter((e) => picked.has(e.episodeId));
    if (!showAll) {
      // latest 5 RELEVANT (reached final cut), by createdAt
      base = base.filter((e) => e.reachedFinalCut).slice(-5);
    }
    return base;
  }, [d, excludeArchived, showAll, picked]);

  const target = d?.directorTouchTarget ?? 6;
  const activeSeries = SERIES.filter((s) => enabledSeries.has(s.key));

  return (
    <StudioContentFrame>
      <header className="mb-5">
        <div className="flex items-center gap-2">
          <Factory size={18} className="text-text-secondary" />
          <h1 className="text-2xl font-semibold text-text-primary">Factory — Adaptation Overview</h1>
        </div>
        <p className="text-sm text-text-secondary mt-1">
          The slow loop: is the factory getting cheaper and more autonomous episode over episode — and
          what did the churn teach us? Honest churn = REVISE per artifact version, never runs/shot.
        </p>
      </header>

      {isLoading && <p className="text-sm text-text-muted">Reading the scorecard ledger…</p>}
      {/* The bare "Failed to load factory data." was a dead end: it cost a session
          to even learn WHICH request failed. Carry the reason, and say plainly when
          what is on screen is the previous (stale) reading rather than a fresh one. */}
      {error && (
        <p className="text-sm" style={{ color: 'var(--accent-danger)' }}>
          Failed to load factory data — {(error as Error).message || 'unknown error'}.
          {d ? ' Showing the last successful reading.' : ''}
        </p>
      )}

      {d && d.episodes.length === 0 && (
        <p className="text-sm text-text-muted">No scorecards yet. The discriminator fills in as episodes ship.</p>
      )}

      {d && d.episodes.length > 0 && (
        <div className="space-y-5">
          {/* Filter bar (#1) */}
          <Card>
            <CardBody>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={excludeArchived} onChange={(e) => setExcludeArchived(e.target.checked)} />
                  <span className="text-text-secondary">Exclude archived</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={showAll} onChange={(e) => { setShowAll(e.target.checked); setPicked(new Set()); }} />
                  <span className="text-text-secondary">Show all (else latest 5 with final cut)</span>
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-text-muted">Pick:</span>
                  {(d.episodes).map((e) => {
                    const on = picked.has(e.episodeId);
                    return (
                      <button
                        key={e.episodeId}
                        onClick={() => setPicked((p) => { const n = new Set(p); n.has(e.episodeId) ? n.delete(e.episodeId) : n.add(e.episodeId); return n; })}
                        className="px-1.5 h-5 rounded text-[10px] font-mono border transition-colors"
                        style={{
                          color: on ? 'var(--text-inverse)' : 'var(--text-muted)',
                          background: on ? 'var(--accent-primary)' : 'transparent',
                          borderColor: on ? 'var(--accent-primary)' : 'var(--panel-glass-border)',
                        }}
                      >
                        {e.episodeCode.replace('SS-', '')}
                      </button>
                    );
                  })}
                  {picked.size > 0 && <button onClick={() => setPicked(new Set())} className="text-[10px] text-text-muted underline">clear</button>}
                </div>
                <span className="text-text-muted ml-auto">{visible.length} shown</span>
              </div>
            </CardBody>
          </Card>

          {/* Trend charts (#7) with series toggles */}
          <Card>
            <CardHeader><CardTitle>Trends · {visible.length} episodes (oldest → newest)</CardTitle></CardHeader>
            <CardBody>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
                {SERIES.map((s) => {
                  const on = enabledSeries.has(s.key);
                  return (
                    <label key={s.key} className="flex items-center gap-1 cursor-pointer text-[11px]">
                      <input type="checkbox" checked={on} onChange={() => setEnabledSeries((p) => { const n = new Set(p); n.has(s.key) ? n.delete(s.key) : n.add(s.key); return n; })} />
                      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
                      <span className="text-text-secondary">{s.label}</span>
                    </label>
                  );
                })}
              </div>
              {visible.length === 0 ? (
                // The default filter keeps only episodes that reached a final cut,
                // so a factory mid-run can legitimately have nothing to plot. Name
                // that, instead of drawing empty strips that read as "scored zero".
                <p className="text-xs text-text-muted">
                  No episodes match the current filter — the default keeps only episodes that
                  reached a final cut. Tick “show all” above to include in-flight ones.
                </p>
              ) : activeSeries.length === 0 ? (
                <p className="text-xs text-text-muted">Pick one or more series above.</p>
              ) : (
                <div className="divide-y divide-[var(--panel-glass-border)]">
                  {activeSeries.map((s) => <SeriesStrip key={s.key} s={s} episodes={visible} />)}
                </div>
              )}
              <div className="flex gap-1 mt-1 pl-0">
                {visible.map((e) => (
                  <div key={e.episodeId} className="flex-1 text-center text-[9px] text-text-muted font-mono truncate">{e.episodeCode.replace('SS-S15-', '').replace('SS-', '')}</div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Budget (#3) */}
          <Card>
            <CardHeader><CardTitle><span className="inline-flex items-center gap-1.5"><DollarSign size={13} /> Budget · total from budget_spent, itemized where logged</span></CardTitle></CardHeader>
            <CardBody>
              <div className="space-y-2">
                {visible.map((e) => (
                  <div key={e.episodeId} className="rounded-lg border border-glass p-2.5">
                    <button className="w-full flex items-center gap-3 text-left" onClick={() => setExpandBudget((x) => x === e.episodeId ? null : e.episodeId)}>
                      <span className="font-mono text-xs text-text-primary w-24 shrink-0">{e.episodeCode.replace('SS-', '')}</span>
                      <span className="text-sm text-text-primary tabular-nums">{usd(e.budget.total)}</span>
                      <span className="text-xs text-text-muted tabular-nums">{e.budget.perShot === null ? '—' : `${usd(e.budget.perShot)}/shot`}</span>
                      {e.budget.reservationOnly ? (
                        <span className="text-[10px] px-1.5 h-5 rounded-full border inline-flex items-center" style={{ color: 'var(--accent-orange)', borderColor: 'var(--accent-orange)' }}>reservation-only · no itemized</span>
                      ) : (
                        <span className="text-[11px] text-text-muted">
                          design {e.budget.preCast === null ? '—' : usd(e.budget.preCast)} + production {e.budget.postCast === null ? '—' : usd(e.budget.postCast)}
                          {Math.abs(e.budget.reservedTotal - e.budget.total) >= 0.01 && (
                            <span className="ml-1" title="episodes.budget_spent — tracks reservations, misses concierge/Polina spend">· reserved {usd(e.budget.reservedTotal)}</span>
                          )}
                        </span>
                      )}
                      {!e.budget.reservationOnly && <ChevronDown size={13} className={`ml-auto text-text-muted transition-transform ${expandBudget === e.episodeId ? 'rotate-180' : ''}`} />}
                    </button>
                    {expandBudget === e.episodeId && !e.budget.reservationOnly && (
                      <div className="grid gap-4 sm:grid-cols-2 mt-2 pt-2 border-t border-glass">
                        <CostFoldList rows={e.budget.byAgent} label="by agent" />
                        <CostFoldList rows={e.budget.byOp} label="by endpoint / operation" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Slow-loop proposals */}
          <Card>
            <CardHeader><CardTitle>Slow-loop proposals · open calibrations</CardTitle></CardHeader>
            <CardBody>
              {d.openProposals.length === 0 ? (
                <p className="text-sm text-text-muted">No open proposals.</p>
              ) : (
                <ul className="space-y-2">
                  {d.openProposals.map((p, i) => (
                    <li key={i} className="rounded-lg border border-glass p-2.5 flex items-start gap-2.5">
                      <span className="mt-0.5 inline-flex items-center px-1.5 h-5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0"
                        style={{ color: p.zone === 'escalate' ? 'var(--accent-warning)' : 'var(--accent-info)', border: `1px solid ${p.zone === 'escalate' ? 'var(--accent-warning)' : 'var(--accent-info)'}` }}>
                        {p.zone === 'escalate' ? 'escalate' : 'auto-safe'}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm text-text-primary">{p.action}</div>
                        <div className="text-[11px] text-text-muted"><span className="font-mono">{p.episodeCode}</span> · {p.critic} · {p.target}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* Per-episode table — the WHOLE episode (design + production + distribution) */}
          <Card>
            <CardHeader><CardTitle>Per-episode detail</CardTitle></CardHeader>
            <CardBody>
              <EpisodeTable columns={COLUMNS_ALL} rows={visible} />
            </CardBody>
          </Card>

          {/* Same meters, cut to the PRODUCTION WINDOW only */}
          <Card>
            <CardHeader>
              <CardTitle>Production speed · first ref-design render → first auto-stitch</CardTitle>
            </CardHeader>
            <CardBody>
              <EpisodeTable columns={COLUMNS_PRODUCTION} rows={visible} />
              <p className="text-[11px] text-text-muted mt-3">
                Same meters as above, but bounded at BOTH ends: the window opens when the ref designer
                (EXEC-EREF) fires its first render and closes on the <b>first</b> auto-stitch (EXEC-STITCH)
                — the moment a whole picture exists. Everything after it is polish and distribution
                (re-stitches, thumbnail, copy, publish, the Director&apos;s final review) and is excluded
                here; the table above still counts all of it. <b>Churn, autonomy % and critic verdicts are
                absent on purpose:</b> the scorecard computes them per artifact version, not per timestamp,
                so they cannot be cut to this window without lying. <b>Time is WALL-clock</b> — it counts
                waiting and idle time, so read it as calendar duration, never as effort (the sum of task
                durations is the effort meter, and this is not it).{' '}
                <span style={{ color: 'var(--accent-orange)' }}>▸</span> = never reached a cut, window
                still open · ◦ = production never started.
              </p>
            </CardBody>
          </Card>

          <p className="text-[11px] text-text-muted">
            Generated {new Date(d.generatedAt).toLocaleString()} · <b>Escalation model:</b> agents + code = the free
            base (~10 touches/shot, not counted); every <span style={{ color: 'var(--accent-purple)' }}>Polina (L1)</span> and{' '}
            <span style={{ color: 'var(--accent-primary)' }}>Director (L2)</span> touch is a LEADERSHIP intervention the
            factory should make unnecessary → <b>leadership/shot → 0</b>, especially in <b>production</b> (from the ref
            artist on — refs/video should render + self-approve autonomously). Split boundary = production-start (ref
            artist); <b>design</b> = brief/script/storyboard/critics/casting before it. AI-EP = autonomous delegation
            (not a human cost). Churn = REVISE/shot; $ total = itemized budget_log (reserved shown apart).
          </p>
        </div>
      )}
    </StudioContentFrame>
  );
}
