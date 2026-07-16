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

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Factory, TriangleAlert, RefreshCw, DollarSign, ChevronDown } from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { fetcher } from '@/lib/swr';

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
  castLocked: boolean;
  touches: {
    all: Buckets; pre: Buckets; post: Buckets;
    postPerShotPct: number | null;
    preStages: number; prePerStage: number;
    postCastRework: number; reworkPerShot: number | null;
  };
  churn: {
    trueChurn: number | null; truePerShot: number | null; naivePerShot: number;
    producerFirstPassRejectRate: number | null; reworkRegens: number | null;
  };
  autonomyPct: number | null;
  agentFailures: number;
  budget: {
    total: number; perShot: number | null; reservationOnly: boolean; itemizedTotal: number;
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
  { key: 'costPerShot', label: '$ / shot', color: 'var(--accent-success)', value: (e) => e.budget.perShot, fmt: usd },
  { key: 'costTotal', label: 'total $', color: 'var(--accent-tertiary)', value: (e) => e.budget.total || null, fmt: (n) => `$${n.toFixed(0)}` },
  { key: 'director', label: 'Director touches', color: 'var(--accent-primary)', value: (e) => e.touches.all.director, fmt: num },
  { key: 'polina', label: 'Polina touches', color: 'var(--accent-purple)', value: (e) => e.touches.all.polina, fmt: num },
  { key: 'aiEp', label: 'AI-EP touches', color: 'var(--accent-info)', value: (e) => e.touches.all.aiEp, fmt: num },
  { key: 'preCastPerStage', label: 'pre-cast / stage', color: 'var(--accent-orange)', value: (e) => e.touches.prePerStage, fmt: num },
  { key: 'reworkPerShot', label: 'post-cast rework / shot', color: 'var(--accent-danger)', value: (e) => e.touches.reworkPerShot, fmt: num },
  { key: 'churnPerShot', label: 'critic churn / shot', color: 'var(--accent-warning)', value: (e) => e.churn.truePerShot, fmt: num },
  { key: 'autonomy', label: 'autonomy %', color: 'var(--accent-secondary)', value: (e) => e.autonomyPct, fmt: pct },
];
const DEFAULT_SERIES = new Set(['costPerShot', 'director', 'polina', 'reworkPerShot']);

// ── Small-multiples bar strip: one series across the visible episodes ─────────
function SeriesStrip({ s, episodes }: { s: Series; episodes: FactoryEpisode[] }) {
  const vals = episodes.map((e) => s.value(e));
  const max = Math.max(1, ...vals.map((v) => (v ?? 0)));
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
        <span className="text-[11px] font-medium text-text-secondary">{s.label}</span>
        <span className="text-[10px] text-text-muted">· max {s.fmt(max)}</span>
      </div>
      <div className="flex items-end gap-1 h-14">
        {episodes.map((e, i) => {
          const v = vals[i];
          const h = v === null ? 0 : Math.max(2, (v / max) * 100);
          return (
            <div key={e.episodeId} className="flex-1 flex flex-col items-center justify-end group relative" title={`${e.episodeCode}: ${v === null ? '—' : s.fmt(v)}`}>
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

export default function FactoryPage() {
  const { data, isLoading, error } = useSWR<{ data: FactoryData }>('/api/factory', fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });
  const d = data?.data;

  // ── Filters (#1): exclude archived (default), show all, exact episodes ──
  const [excludeArchived, setExcludeArchived] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [enabledSeries, setEnabledSeries] = useState<Set<string>>(new Set(DEFAULT_SERIES));
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
      {error && <p className="text-sm" style={{ color: 'var(--accent-danger)' }}>Failed to load factory data.</p>}

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
              {activeSeries.length === 0 ? (
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
                        <span className="text-[11px] text-text-muted">pre {e.budget.preCast === null ? '—' : usd(e.budget.preCast)} · post {e.budget.postCast === null ? '—' : usd(e.budget.postCast)}</span>
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

          {/* Per-episode table */}
          <Card>
            <CardHeader><CardTitle>Per-episode detail</CardTitle></CardHeader>
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-text-muted text-left border-b border-glass">
                      <th className="py-1.5 pr-3 font-medium">Episode</th>
                      <th className="py-1.5 px-2 font-medium text-right">Shots</th>
                      <th className="py-1.5 px-2 font-medium">Touches (Dir·Pol·AI)</th>
                      <th className="py-1.5 px-2 font-medium text-right" title="pre-cast touches per stage">Pre/stage</th>
                      <th className="py-1.5 px-2 font-medium text-right" title="post-cast rework (revise/reject) per shot — target 0">Rework/shot</th>
                      <th className="py-1.5 px-2 font-medium text-right" title="true REVISE churn / shot">Churn/sh</th>
                      <th className="py-1.5 px-2 font-medium text-right">$/shot</th>
                      <th className="py-1.5 px-2 font-medium text-right">Auto%</th>
                      <th className="py-1.5 pl-2 font-medium">Critic verdicts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((e) => (
                      <tr key={e.episodeId} className="border-b border-glass/50">
                        <td className="py-1.5 pr-3 font-mono text-text-primary whitespace-nowrap">
                          {e.episodeCode.replace('SS-', '')}
                          {!e.castLocked && <span className="ml-1 text-text-muted" title="casting not locked">◦</span>}
                        </td>
                        <td className="py-1.5 px-2 text-right text-text-secondary">{e.shotCount}</td>
                        <td className="py-1.5 px-2">
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums text-text-secondary w-20 shrink-0">{e.touches.all.director}·{e.touches.all.polina}·{e.touches.all.aiEp}</span>
                            <div className="w-24"><TouchStack b={e.touches.all} /></div>
                          </div>
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-text-secondary">{e.touches.prePerStage}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: (e.touches.reworkPerShot ?? 0) === 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                          {e.touches.reworkPerShot ?? '—'} <span className="text-text-muted">({e.touches.postCastRework})</span>
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-text-secondary">
                          {e.churn.truePerShot ?? '—'}<span className="text-text-muted">/{e.churn.naivePerShot}</span>
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-text-secondary">{e.budget.perShot === null ? '—' : usd(e.budget.perShot)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-text-secondary">{e.autonomyPct === null ? '—' : `${e.autonomyPct}%`}</td>
                        <td className="py-1.5 pl-2">
                          <div className="flex flex-wrap gap-1">
                            {e.criticVerdicts.length === 0 ? <span className="text-text-muted">—</span> : e.criticVerdicts.map((v, i) => (
                              <span key={i} className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[10px] font-medium border"
                                style={{ color: VERDICT_COLOR[v.verdict] ?? 'var(--text-muted)', borderColor: VERDICT_COLOR[v.verdict] ?? 'var(--text-muted)' }}
                                title={`${v.reviseCount} REVISE${v.repeatedPoints.length ? ` · repeats ${v.repeatedPoints.join(',')}` : ''}`}>
                                {v.critic.replace('EXEC-', '')} {v.repeatedPoints.length > 0 && <span className="opacity-70">[{v.repeatedPoints.join(',')}]</span>}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          <p className="text-[11px] text-text-muted">
            Generated {new Date(d.generatedAt).toLocaleString()} · Touches split Director / Polina (Prod Assistant) / AI-EP ·
            pre-cast normalized /stage, post-cast rework /shot (target 0) · churn = REVISE/shot (naive = agent runs/shot) ·
            $ total from budget_spent, itemized where budget_log is populated.
          </p>
        </div>
      )}
    </StudioContentFrame>
  );
}
