// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/episodes/[id]/page.tsx — Pipeline View per pipeline_view.md.
// Two panes: DAG (left 40%) + Agent Report Feed (right 60%).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { use, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, RotateCcw, MoreHorizontal, Play } from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { fetcher } from '@/lib/swr';

interface Stage {
  id: string;
  label: string;
  state: 'idle' | 'running' | 'approved' | 'blocked' | 'failed';
  agents: string[];
  job_count?: { total: number; done: number; running: number; failed: number };
  latest_asset_id?: string;
}

interface Episode {
  id: string;
  episode_code: string;
  title_working: string | null;
  status: string;
  governance_mode: number;
  budget_ceiling: number | null;
  budget_spent: number | null;
  series_id: string;
}

interface ActivityRow {
  id: string;
  event_type: string;
  severity: string;
  title: string;
  description: string | null;
  actor: string | null;
  created_at: string;
}

interface PipelineResponse {
  data: {
    episode: Episode;
    stages: Stage[];
    feed: ActivityRow[];
  };
}

const NODE_GLYPH: Record<Stage['state'], string> = {
  idle: '○',
  running: '◐',
  approved: '●',
  blocked: '◇',
  failed: '✗',
};

const NODE_COLOR: Record<Stage['state'], string> = {
  idle: 'var(--text-muted)',
  running: 'var(--accent-warning)',
  approved: 'var(--accent-success)',
  blocked: 'var(--accent-info)',
  failed: 'var(--accent-danger)',
};

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function PipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [triggerOpen, setTriggerOpen] = useState(false);

  const { data, mutate } = useSWR<PipelineResponse>(
    `/api/episodes/${id}/pipeline`,
    fetcher,
    { refreshInterval: 30_000 },
  );

  if (!data?.data) {
    return (
      <StudioContentFrame>
        <p className="text-sm text-text-secondary">Loading pipeline…</p>
      </StudioContentFrame>
    );
  }

  const { episode, stages, feed } = data.data;
  const filtered = selectedStage
    ? feed.filter((e) => e.actor && stages.find((s) => s.id === selectedStage)?.agents.includes(e.actor))
    : feed;

  return (
    <StudioContentFrame>
      {/* Header */}
      <div className="mb-5">
        <Link href="/episodes" className="text-xs text-text-muted hover:text-text-primary inline-flex items-center gap-1">
          <ArrowLeft size={12} /> Episodes
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">
              {episode.episode_code}
              {episode.title_working && (
                <span className="text-text-secondary font-normal text-lg ml-3">
                  &ldquo;{episode.title_working}&rdquo;
                </span>
              )}
            </h1>
            <div className="flex items-center gap-3 mt-1.5 text-xs">
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded uppercase tracking-wider font-semibold"
                style={{
                  background: 'color-mix(in oklab, var(--accent-info) 14%, transparent)',
                  color: 'var(--accent-info)',
                }}
              >
                {episode.status.replace(/_/g, ' ').toLowerCase()}
              </span>
              <span className="text-text-muted">Mode {episode.governance_mode}</span>
              <span className="text-text-muted">·</span>
              <span className="text-text-muted">
                ${(episode.budget_spent ?? 0).toFixed(2)} / ${(episode.budget_ceiling ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => mutate()}>
              <RefreshCw size={14} /> Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setTriggerOpen(true)}>
              <RotateCcw size={14} /> Re-trigger…
            </Button>
            <Button variant="ghost" size="sm">
              <MoreHorizontal size={14} />
            </Button>
          </div>
        </div>
      </div>

      {/* BRIEF_PENDING action banner */}
      {episode.status === 'BRIEF_PENDING' && (
        <ApproveBriefBanner
          episodeId={episode.id}
          governanceMode={episode.governance_mode}
          onApproved={() => mutate()}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* DAG (left) */}
        <Card className="lg:col-span-2">
          <CardBody>
            <div className="text-xs uppercase tracking-wider text-text-muted mb-3">Pipeline</div>
            <ol className="space-y-1">
              {stages.map((s, i) => {
                const active = selectedStage === s.id;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setSelectedStage(active ? null : s.id)}
                      className="flex items-center gap-3 w-full px-2 py-1.5 rounded-lg transition-colors text-left"
                      style={{
                        background: active ? 'var(--panel-hover-bg)' : 'transparent',
                      }}
                    >
                      <span
                        className="text-2xl leading-none w-6 text-center"
                        style={{ color: NODE_COLOR[s.state] }}
                      >
                        {NODE_GLYPH[s.state]}
                      </span>
                      <span className="flex-1 text-sm text-text-primary">{s.label}</span>
                      {s.job_count && s.job_count.total > 0 && (
                        <span className="text-[10px] uppercase tracking-wider text-text-muted">
                          {s.job_count.done}/{s.job_count.total}
                        </span>
                      )}
                    </button>
                    {i < stages.length - 1 && (
                      <div
                        className="ml-5 h-3 w-px"
                        style={{ background: NODE_COLOR[s.state], opacity: 0.4 }}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
            <div className="mt-4 pt-3 border-t border-glass space-y-1 text-[10px] text-text-muted">
              <div>● approved · ◐ running · ◇ blocked · ✗ failed · ○ idle</div>
              <div>Click a stage to filter the feed →</div>
            </div>
          </CardBody>
        </Card>

        {/* Feed (right) */}
        <Card className="lg:col-span-3">
          <CardBody>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs uppercase tracking-wider text-text-muted">
                {selectedStage
                  ? `Activity — ${stages.find((s) => s.id === selectedStage)?.label}`
                  : 'Activity feed'}
              </div>
              {selectedStage && (
                <button
                  onClick={() => setSelectedStage(null)}
                  className="text-[11px] text-text-secondary hover:text-text-primary"
                >
                  Clear filter
                </button>
              )}
            </div>

            {filtered.length === 0 && (
              <p className="text-sm text-text-secondary">
                {selectedStage ? 'No activity for this stage yet.' : 'Pipeline is idle.'}
              </p>
            )}

            <div className="space-y-2">
              {filtered.map((e) => (
                <div
                  key={e.id}
                  className="rounded-lg border border-glass bg-panel-glass-strong px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-text-primary font-medium">{e.title}</span>
                    <span className="text-text-muted">·</span>
                    <span className="text-text-muted">{relativeTime(e.created_at)}</span>
                  </div>
                  {e.description && (
                    <div className="text-[12px] text-text-secondary mt-1 leading-snug">
                      {e.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <TriggerModal
        open={triggerOpen}
        onClose={() => setTriggerOpen(false)}
        episodeId={id}
        onTriggered={() => mutate()}
      />
    </StudioContentFrame>
  );
}

function ApproveBriefBanner({
  episodeId,
  governanceMode,
  onApproved,
}: {
  episodeId: string;
  governanceMode: number;
  onApproved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/episodes/${episodeId}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        approvalType: 'BRIEF',
        notes: 'Brief approved — pipeline starts',
      }),
    });
    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Approve failed');
      return;
    }
    onApproved();
  }

  return (
    <div
      className="rounded-2xl border px-5 py-4 mb-4"
      style={{
        background: 'color-mix(in oklab, var(--accent-warning) 10%, transparent)',
        borderColor: 'color-mix(in oklab, var(--accent-warning) 40%, transparent)',
      }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-primary">
            Brief is waiting for your approval
          </div>
          <p className="text-xs text-text-secondary mt-1 leading-relaxed">
            Approving the brief locks it as APPROVED and dispatches{' '}
            <span className="font-mono text-text-primary">EXEC-SW</span> (Screenwriter).
            {governanceMode === 4
              ? ' Mode 4 AUTOTEST — entire pipeline will auto-run through Publish.'
              : ` Mode ${governanceMode} — each downstream gate (Script, Storyboard, Animatic, Generation, Publish) will land in your Inbox for review.`}
          </p>
          {error && (
            <p
              className="text-xs mt-2"
              style={{ color: 'var(--accent-danger)' }}
            >
              {error}
            </p>
          )}
        </div>
        <Button
          onClick={approve}
          disabled={pending}
          variant="warning"
        >
          <Play size={14} /> {pending ? 'Starting…' : 'Approve Brief & Start Pipeline'}
        </Button>
      </div>
    </div>
  );
}

function TriggerModal({
  open,
  onClose,
  episodeId,
  onTriggered,
}: {
  open: boolean;
  onClose: () => void;
  episodeId: string;
  onTriggered: () => void;
}) {
  const [agentCode, setAgentCode] = useState('EXEC-SW');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);

  async function fire() {
    if (reason.length < 3) return;
    setPending(true);
    const res = await fetch(`/api/episodes/${episodeId}/trigger`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentCode, reason }),
    });
    setPending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert((j as { error?: string }).error ?? 'Trigger failed');
      return;
    }
    onTriggered();
    onClose();
    setReason('');
  }

  return (
    <Modal open={open} onClose={onClose} title="Re-trigger an agent">
      <div className="space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
            Agent
          </label>
          <select
            value={agentCode}
            onChange={(e) => setAgentCode(e.target.value)}
            className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono"
          >
            {['EXEC-SW', 'EXEC-SREV', 'EXEC-SB', 'EXEC-WCHK', 'EXEC-EDIT', 'EXEC-VGEN', 'EXEC-MGEN', 'EXEC-COPY', 'EXEC-THUMB', 'EXEC-PUB', 'EXEC-ANAL'].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
            Reason (required, audit log)
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. previous run produced wrong tone"
            className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm"
          />
        </div>
        <p className="text-[11px] text-text-muted">
          This creates a new job and may produce duplicate assets.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={fire} disabled={pending || reason.length < 3}>
            {pending ? 'Firing…' : 'Trigger'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
