// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/factory/page.tsx — Factory Overview: the whole-factory ADAPTATION
// picture (slow-loop trends across episodes), sibling of Audience (quality) and
// Budget (price). Source: /api/factory (episode_scorecard + discriminator).
//
// The reflex contour ships the episode; the adaptation contour asks "is the
// factory getting cheaper/more-autonomous episode over episode, and what did the
// churn TEACH us?". This page is that second contour's dashboard.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import useSWR from 'swr';
import { Factory, Gauge, TriangleAlert, Repeat, RefreshCw, Hand } from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { fetcher } from '@/lib/swr';

interface CriticVerdict {
  critic: string;
  verdict: string;
  reviseCount: number;
  repeatedPoints: string[];
}
interface FactoryEpisode {
  episodeId: string;
  episodeCode: string;
  phase: string;
  shotCount: number;
  reachedFinalCut: boolean;
  directorTouches: number;
  creativeTouchesAfterCasting: number;
  autonomyPct: number | null;
  agentFailures: number;
  costPerShot: number | null;
  costTotal: number | null;
  naiveRunsPerShot: number;
  trueCriticChurn: number | null;
  producerFirstPassRejectRate: number | null;
  reworkRegens: number | null;
  criticVerdicts: CriticVerdict[];
}
interface OpenProposal {
  episodeCode: string;
  critic: string;
  zone: string;
  action: string;
  target: string;
}
interface FactoryData {
  generatedAt: string;
  directorTouchTarget: number;
  episodes: FactoryEpisode[];
  openProposals: OpenProposal[];
}

// Verdict → semantic token. Producer gap / critic problems are the actionable
// (warning) states; healthy is quiet success.
const VERDICT_COLOR: Record<string, string> = {
  healthy: 'var(--accent-success)',
  producer_weak_fixable: 'var(--accent-info)',
  producer_gap: 'var(--accent-warning)',
  critic_too_hard: 'var(--accent-orange)',
  critic_inconsistent: 'var(--accent-orange)',
};

function pct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n * 100)}%`;
}

/** A KPI tile with target-aware coloring: at/under target = success, over = danger. */
function Tile({
  icon: Icon,
  label,
  value,
  sub,
  status,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  sub?: string;
  status?: 'good' | 'bad' | 'neutral';
}) {
  const color =
    status === 'good'
      ? 'var(--accent-success)'
      : status === 'bad'
        ? 'var(--accent-danger)'
        : 'var(--text-primary)';
  return (
    <div className="rounded-lg border border-glass p-3">
      <div className="flex items-center gap-1.5 text-text-muted mb-1.5">
        <Icon size={13} />
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function VerdictChip({ v }: { v: CriticVerdict }) {
  const color = VERDICT_COLOR[v.verdict] ?? 'var(--text-muted)';
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[10px] font-medium border"
      style={{ color, borderColor: color }}
      title={`${v.reviseCount} REVISE${v.repeatedPoints.length ? ` · repeats ${v.repeatedPoints.join(',')}` : ''}`}
    >
      {v.critic.replace('EXEC-', '')} · {v.verdict.replace(/_/g, ' ')}
      {v.repeatedPoints.length > 0 && <span className="opacity-70">[{v.repeatedPoints.join(',')}]</span>}
    </span>
  );
}

export default function FactoryPage() {
  const { data, isLoading, error } = useSWR<{ data: FactoryData }>('/api/factory', fetcher, {
    revalidateOnFocus: false,
  });
  const d = data?.data;
  const latest = d?.episodes.filter((e) => e.reachedFinalCut).slice(-1)[0] ?? d?.episodes.slice(-1)[0];
  const target = d?.directorTouchTarget ?? 6;

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
        <p className="text-sm text-text-muted">
          No scorecards yet. The discriminator fills in as episodes ship (post-distribution).
        </p>
      )}

      {d && latest && (
        <div className="space-y-5">
          {/* Headline tiles — latest shipped episode vs North-Star targets. */}
          <Card>
            <CardHeader>
              <CardTitle>
                Latest: <span className="font-mono">{latest.episodeCode}</span>{' '}
                <span className="text-text-muted text-xs font-normal">({latest.shotCount} shots)</span>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                <Tile
                  icon={Hand}
                  label="Director touches"
                  value={`${latest.directorTouches}`}
                  sub={`target ${target}`}
                  status={latest.directorTouches <= target ? 'good' : 'bad'}
                />
                <Tile
                  icon={TriangleAlert}
                  label="Creative post-cast"
                  value={`${latest.creativeTouchesAfterCasting}`}
                  sub="target 0 (leak)"
                  status={latest.creativeTouchesAfterCasting === 0 ? 'good' : 'bad'}
                />
                <Tile
                  icon={Repeat}
                  label="True critic churn"
                  value={latest.trueCriticChurn === null ? '—' : `${latest.trueCriticChurn}`}
                  sub={`naive ${latest.naiveRunsPerShot}/shot`}
                  status="neutral"
                />
                <Tile
                  icon={RefreshCw}
                  label="First-pass reject"
                  value={pct(latest.producerFirstPassRejectRate)}
                  sub={`${latest.reworkRegens ?? '—'} paid regens`}
                  status={
                    latest.producerFirstPassRejectRate === null
                      ? 'neutral'
                      : latest.producerFirstPassRejectRate <= 0.1
                        ? 'good'
                        : 'bad'
                  }
                />
                <Tile
                  icon={Gauge}
                  label="$/shot"
                  value={latest.costPerShot === null ? '—' : `$${latest.costPerShot}`}
                  sub={latest.costTotal === null ? undefined : `$${latest.costTotal.toFixed(0)} total`}
                  status="neutral"
                />
                <Tile
                  icon={TriangleAlert}
                  label="Emergencies"
                  value={`${latest.agentFailures}`}
                  sub="target 0"
                  status={latest.agentFailures === 0 ? 'good' : 'bad'}
                />
              </div>
            </CardBody>
          </Card>

          {/* Slow-loop output — open calibration proposals (the adaptation contour). */}
          <Card>
            <CardHeader><CardTitle>Slow-loop proposals · open calibrations</CardTitle></CardHeader>
            <CardBody>
              {d.openProposals.length === 0 ? (
                <p className="text-sm text-text-muted">
                  No open proposals — every critic is healthy or its loop is self-correcting.
                </p>
              ) : (
                <ul className="space-y-2">
                  {d.openProposals.map((p, i) => (
                    <li key={i} className="rounded-lg border border-glass p-2.5 flex items-start gap-2.5">
                      <span
                        className="mt-0.5 inline-flex items-center px-1.5 h-5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0"
                        style={{
                          color: p.zone === 'escalate' ? 'var(--accent-warning)' : 'var(--accent-info)',
                          border: `1px solid ${p.zone === 'escalate' ? 'var(--accent-warning)' : 'var(--accent-info)'}`,
                        }}
                      >
                        {p.zone === 'escalate' ? 'escalate' : 'auto-safe'}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm text-text-primary">{p.action}</div>
                        <div className="text-[11px] text-text-muted">
                          <span className="font-mono">{p.episodeCode}</span> · {p.critic} · {p.target}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* Per-episode trend table — oldest → newest. */}
          <Card>
            <CardHeader><CardTitle>Per-episode trend</CardTitle></CardHeader>
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-text-muted text-left border-b border-glass">
                      <th className="py-1.5 pr-3 font-medium">Episode</th>
                      <th className="py-1.5 px-2 font-medium text-right">Shots</th>
                      <th className="py-1.5 px-2 font-medium text-right" title={`target ${target}`}>Dir touches</th>
                      <th className="py-1.5 px-2 font-medium text-right" title="target 0">Post-cast</th>
                      <th className="py-1.5 px-2 font-medium text-right">Churn (true/naive)</th>
                      <th className="py-1.5 px-2 font-medium text-right">Reject</th>
                      <th className="py-1.5 px-2 font-medium text-right">Regens</th>
                      <th className="py-1.5 px-2 font-medium text-right">$/shot</th>
                      <th className="py-1.5 px-2 font-medium text-right">Auto%</th>
                      <th className="py-1.5 pl-2 font-medium">Critic verdicts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.episodes.map((e) => (
                      <tr key={e.episodeId} className="border-b border-glass/50">
                        <td className="py-1.5 pr-3 font-mono text-text-primary whitespace-nowrap">
                          {e.episodeCode}
                          {!e.reachedFinalCut && <span className="ml-1 text-text-muted" title="did not reach final cut">·</span>}
                        </td>
                        <td className="py-1.5 px-2 text-right text-text-secondary">{e.shotCount}</td>
                        <td
                          className="py-1.5 px-2 text-right tabular-nums"
                          style={{ color: e.directorTouches <= target ? 'var(--accent-success)' : 'var(--accent-danger)' }}
                        >
                          {e.directorTouches}
                        </td>
                        <td
                          className="py-1.5 px-2 text-right tabular-nums"
                          style={{ color: e.creativeTouchesAfterCasting === 0 ? 'var(--accent-success)' : 'var(--accent-warning)' }}
                        >
                          {e.creativeTouchesAfterCasting}
                        </td>
                        <td className="py-1.5 px-2 text-right text-text-secondary tabular-nums">
                          {e.trueCriticChurn ?? '—'}<span className="text-text-muted">/{e.naiveRunsPerShot}</span>
                        </td>
                        <td className="py-1.5 px-2 text-right text-text-secondary tabular-nums">{pct(e.producerFirstPassRejectRate)}</td>
                        <td className="py-1.5 px-2 text-right text-text-secondary tabular-nums">{e.reworkRegens ?? '—'}</td>
                        <td className="py-1.5 px-2 text-right text-text-secondary tabular-nums">{e.costPerShot === null ? '—' : `$${e.costPerShot}`}</td>
                        <td className="py-1.5 px-2 text-right text-text-secondary tabular-nums">{e.autonomyPct === null ? '—' : `${e.autonomyPct}%`}</td>
                        <td className="py-1.5 pl-2">
                          <div className="flex flex-wrap gap-1">
                            {e.criticVerdicts.length === 0 ? (
                              <span className="text-text-muted">—</span>
                            ) : (
                              e.criticVerdicts.map((v, i) => <VerdictChip key={i} v={v} />)
                            )}
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
            Generated {new Date(d.generatedAt).toLocaleString()} · churn = REVISE bounces per artifact
            version (naive = agent runs/shot, inflated by re-trigger waves) · reject = Director-rejected
            first-pass creative / shot · regens = superseded paid plan versions.
          </p>
        </div>
      )}
    </StudioContentFrame>
  );
}
