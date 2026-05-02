// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/budget/page.tsx — Budget summary wired to /api/budget.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import useSWR from 'swr';
import { DollarSign } from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { fetcher } from '@/lib/swr';

interface BudgetSummary {
  totalAllocated: number;
  totalSpent: number;
  remaining: number;
  burnRate: number;
  projectedRunway: number | null;
  byEpisode: Array<{
    episode_id: string;
    episode_code: string;
    total: number;
    ceiling: number | null;
    breakdown: Record<string, number>;
  }>;
}

export default function BudgetPage() {
  const { data, isLoading } = useSWR<{ data: BudgetSummary }>('/api/budget', fetcher, {
    refreshInterval: 60_000,
  });
  const b = data?.data;

  return (
    <StudioContentFrame>
      <header className="mb-5">
        <div className="flex items-center gap-2">
          <DollarSign size={18} className="text-text-secondary" />
          <h1 className="text-2xl font-semibold text-text-primary">Budget</h1>
        </div>
        <p className="text-sm text-text-secondary mt-1">
          Per-episode spend vs. ceiling, burn rate, projected runway.
        </p>
      </header>

      {isLoading && <p className="text-xs text-text-muted">Loading…</p>}

      {b && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
            <Stat label="Total spent" value={`$${b.totalSpent.toFixed(2)}`} />
            <Stat label="Allocated" value={`$${b.totalAllocated.toFixed(2)}`} />
            <Stat
              label="Remaining"
              value={`$${b.remaining.toFixed(2)}`}
              tone={b.remaining < 5 ? 'danger' : 'default'}
            />
            <Stat
              label="Burn / episode"
              value={`$${b.burnRate.toFixed(2)}`}
              hint={
                b.projectedRunway === null
                  ? 'no published episodes yet'
                  : `~${b.projectedRunway} episodes runway`
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Per-episode breakdown</CardTitle>
            </CardHeader>
            <CardBody>
              {b.byEpisode.length === 0 && (
                <p className="text-sm text-text-secondary">
                  No episodes yet. Create one to see spend tracking here.
                </p>
              )}
              <div className="grid gap-2">
                {b.byEpisode.map((e) => {
                  const ratio = e.ceiling && e.ceiling > 0 ? e.total / e.ceiling : 0;
                  const overrun = e.ceiling != null && e.total > e.ceiling;
                  return (
                    <div
                      key={e.episode_id}
                      className="rounded-lg border border-glass bg-panel-glass-strong px-3 py-2.5"
                    >
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-sm font-mono text-text-primary">
                          {e.episode_code}
                        </span>
                        <span
                          className="text-xs font-mono"
                          style={{
                            color: overrun
                              ? 'var(--accent-danger)'
                              : ratio > 0.8
                              ? 'var(--accent-warning)'
                              : 'var(--text-secondary)',
                          }}
                        >
                          ${e.total.toFixed(2)}{' '}
                          {e.ceiling != null && (
                            <span className="text-text-muted">
                              / ${e.ceiling.toFixed(2)}
                            </span>
                          )}
                        </span>
                      </div>
                      {e.ceiling != null && (
                        <div className="h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, ratio * 100)}%`,
                              background: overrun
                                ? 'var(--accent-danger)'
                                : ratio > 0.8
                                ? 'var(--accent-warning)'
                                : 'var(--accent-primary)',
                            }}
                          />
                        </div>
                      )}
                      {Object.keys(e.breakdown).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-text-muted">
                          {Object.entries(e.breakdown).map(([provider, cost]) => (
                            <span key={provider}>
                              {provider}: ${cost.toFixed(2)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </StudioContentFrame>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <Card>
      <CardBody>
        <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
        <div
          className="text-xl font-semibold mt-1 font-mono"
          style={{
            color: tone === 'danger' ? 'var(--accent-danger)' : 'var(--text-primary)',
          }}
        >
          {value}
        </div>
        {hint && <div className="text-[11px] text-text-muted mt-1">{hint}</div>}
      </CardBody>
    </Card>
  );
}
