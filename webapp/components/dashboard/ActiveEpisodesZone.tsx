// ──────────────────────────────────────────────────────────────────────────────
// components/dashboard/ActiveEpisodesZone.tsx
// Dashboard Zone 2 — Active Episodes timelines per dashboard_cockpit.md §4.
// Each row is a clickable episode → /episodes/[id] (Pipeline View).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Plus, Film } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { fetcher } from '@/lib/swr';
import { useWorkspaceScope } from '@/components/providers/WorkspaceScopeProvider';

interface EpisodeRow {
  id: string;
  episode_code: string;
  title_working: string | null;
  status: string;
  governance_mode: number;
  budget_ceiling: number | null;
  budget_spent: number | null;
}

const STAGES = [
  'Brief', 'Story', 'Script', 'Story-', 'World', 'Anim.', 'Gen.', 'Distr.', 'Pub', 'Anal.',
];

const STAGE_FROM_STATUS = (status: string): number => {
  // Map episode_status enum into a 0..9 progress index across the 10 stages.
  const m: Record<string, number> = {
    BRIEF_PENDING: 0,
    BRIEF_APPROVED: 1,
    SCRIPT_IN_PROGRESS: 2, SCRIPT_REVIEW: 2, SCRIPT_REVISION: 2, SCRIPT_APPROVED: 3,
    STORYBOARD_IN_PROGRESS: 3, STORYBOARD_REVIEW: 3, STORYBOARD_REVISION: 3, STORYBOARD_APPROVED: 4,
    ANIMATIC_IN_PROGRESS: 5, ANIMATIC_REVIEW: 5, ANIMATIC_REVISION: 5, ANIMATIC_APPROVED: 6,
    GENERATION_IN_PROGRESS: 6, GENERATION_REVIEW: 6, GENERATION_REVISION: 6, GENERATION_APPROVED: 7,
    PUBLISH_PENDING: 8, PUBLISHED: 9, ANALYTICS_COLLECTING: 9, COMPLETE: 9,
  };
  return m[status] ?? 0;
};

const NODE_GLYPH = ['●', '●', '●', '●', '●', '●', '●', '●', '●', '●'];

export function ActiveEpisodesZone() {
  const { seriesId } = useWorkspaceScope();
  const { data, error, isLoading } = useSWR<{
    success: boolean;
    data: EpisodeRow[];
  }>(`/api/episodes?active=true${seriesId ? `&series_id=${seriesId}` : ''}`, fetcher, { refreshInterval: 60_000 });

  const episodes = data?.data ?? [];

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Film size={14} className="text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">
              Active Episodes · {episodes.length}
            </span>
          </div>
          <Link
            href="/episodes"
            className="inline-flex items-center gap-1 text-xs text-[var(--accent-primary)] hover:brightness-125"
          >
            <Plus size={12} />
            New Episode
          </Link>
        </div>

        {error && <p className="text-xs text-[var(--accent-danger)]">Failed to load episodes</p>}
        {isLoading && <p className="text-xs text-text-muted">Loading…</p>}
        {!isLoading && episodes.length === 0 && (
          <div className="text-center py-6">
            <p className="text-sm text-text-secondary">No active episodes.</p>
            <p className="text-xs text-text-muted mt-1">
              Open Series and create one, or run the setup wizard.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {episodes.map((ep) => {
            const idx = STAGE_FROM_STATUS(ep.status);
            return (
              <Link
                key={ep.id}
                href={`/episodes/${ep.id}`}
                className="block px-3 py-2.5 rounded-lg border border-glass bg-panel-glass-strong hover:border-glass-active transition-colors"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-sm font-mono text-text-primary">{ep.episode_code}</span>
                    {ep.title_working && (
                      <span className="text-xs text-text-secondary truncate">
                        &ldquo;{ep.title_working}&rdquo;
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-text-muted">
                    {ep.status.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </div>

                <div className="flex items-center gap-1 font-mono text-base leading-none">
                  {STAGES.map((stage, i) => {
                    const reached = i <= idx;
                    const current = i === idx;
                    return (
                      <span key={stage} className="flex flex-col items-center" style={{ flex: 1 }}>
                        <span
                          style={{
                            color: reached
                              ? current
                                ? 'var(--accent-warning)'
                                : 'var(--accent-success)'
                              : 'var(--text-muted)',
                          }}
                        >
                          {current ? '◐' : NODE_GLYPH[i]}
                        </span>
                        <span className="text-[8px] uppercase tracking-wider text-text-muted mt-1">
                          {stage}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </Link>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
