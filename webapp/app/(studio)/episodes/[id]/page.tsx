// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/episodes/[id]/page.tsx — Pipeline View per pipeline_view.md.
// Two panes: DAG (left 40%) + Agent Report Feed (right 60%).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { use, useState, type KeyboardEvent } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, RefreshCw, RotateCcw, MoreHorizontal, Play, Eye, Pencil, Archive } from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StageKebabMenu } from '@/components/pipeline/StageKebabMenu';
import { PreviewDrawer } from '@/components/preview/PreviewDrawer';
import { EditorModal } from '@/components/editor/EditorModal';
import { EpisodeReferencesGallery } from '@/components/episode/EpisodeReferencesGallery';
import { EREFPilotPillbar } from '@/components/pipeline/EREFPilotPillbar';
import { VGENPilotPillbar } from '@/components/pipeline/VGENPilotPillbar';
import { VGENBatchPanel } from '@/components/vgen/VGENBatchPanel';
import { EpisodeTimelineSection } from '@/components/timeline/EpisodeTimelineSection';
import type { PipelineStageId } from '@/lib/api/pipeline-stages';
import { agentDisplayName } from '@/lib/api/agent-names';
import { fetcher } from '@/lib/swr';

interface Stage {
  id: string;
  label: string;
  state: 'idle' | 'running' | 'approved' | 'blocked' | 'failed';
  agents: string[];
  job_count?: { total: number; done: number; running: number; failed: number };
  latest_asset_id?: string;
  latest_asset_type?: string;
  assets_in_review?: number;
}

interface EpisodeArchival {
  state: 'PARTIAL' | 'COMPLETE';
  completed_shots: number;
  total_shots: number | null;
  reason: string;
  final_cut_asset_id: string | null;
  final_cut_path: string | null;
  archived_at: string;
  archived_by: string;
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
  metadata?: { archival?: EpisodeArchival } | null;
}

interface ActivityRow {
  id: string;
  event_type: string;
  severity: string;
  title: string;
  description: string | null;
  actor: string | null;
  created_at: string;
  asset_id?: string | null;
  metadata?: Record<string, unknown> | null;
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
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string | undefined>();

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
  const briefStage = stages.find((s) => s.id === 'brief');
  const briefAssetId = briefStage?.latest_asset_id ?? null;
  // Stage filter looks at event.metadata.file_type (set by asset_updated /
  // approval_granted) and matches via the same prefix rule the DAG uses,
  // OR matches event.metadata.agent against stage.agents (for system events
  // like job_started). Director events have actor=user.uuid which we don't
  // try to bucket by stage — they show in "All".
  const STAGE_PREFIX_MAP: Record<string, string[]> = {
    brief: ['SPC-brief'],
    script: ['SCR', 'REV-script_qa'],
    storyboard: ['STB'],
    world_check: ['REV-world_check'],
    animatic: ['VID-animatic'],
    generation: ['VID-shot', 'AUD-music'],
    distribution: ['SPC-metadata', 'IMG-thumbnail', 'SPC-copy'],
    publish: ['REV-publish'],
    analytics: ['REV-analytics'],
  };
  const filtered = selectedStage
    ? feed.filter((e) => {
        const stage = stages.find((s) => s.id === selectedStage);
        if (!stage) return false;
        const meta = (e as { metadata?: Record<string, unknown> }).metadata ?? {};
        const ft = (meta.file_type as string | undefined) ?? '';
        const prefixes = STAGE_PREFIX_MAP[selectedStage] ?? [];
        if (prefixes.some((p) => ft.startsWith(p))) return true;
        const metaAgent = meta.agent as string | undefined;
        if (metaAgent && stage.agents.includes(metaAgent)) return true;
        if (e.actor && stage.agents.includes(e.actor)) return true;
        return false;
      })
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
                style={
                  episode.status === 'ARCHIVED'
                    ? {
                        background: 'color-mix(in oklab, var(--accent-warning) 16%, transparent)',
                        color: 'var(--accent-warning)',
                      }
                    : {
                        background: 'color-mix(in oklab, var(--accent-info) 14%, transparent)',
                        color: 'var(--accent-info)',
                      }
                }
              >
                {episode.status === 'ARCHIVED' && <Archive size={11} />}
                {episode.status.replace(/_/g, ' ').toLowerCase()}
                {episode.status === 'ARCHIVED' && episode.metadata?.archival && (
                  <>
                    {' · '}
                    {episode.metadata.archival.state.toLowerCase()}
                    {episode.metadata.archival.total_shots != null && (
                      <>
                        {' '}
                        {episode.metadata.archival.completed_shots}/
                        {episode.metadata.archival.total_shots}
                      </>
                    )}
                  </>
                )}
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
            {episode.status !== 'ARCHIVED' && (
              <Button variant="ghost" size="sm" onClick={() => setArchiveOpen(true)} title="Archive episode…">
                <Archive size={14} /> Archive…
              </Button>
            )}
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
          briefAssetId={briefAssetId}
          onApproved={() => mutate()}
          onBriefEdited={() => mutate()}
        />
      )}

      {/* Episode timeline — unified progressive review surface (Phase A).
          Auto-hides when no animatic v1 yet. Click any cell → drawer opens
          for that shot's per-asset review. */}
      <div className="mb-4">
        <EpisodeTimelineSection episodeId={id} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* DAG (left) */}
        <Card className="lg:col-span-2">
          <CardBody>
            <div className="text-xs uppercase tracking-wider text-text-muted mb-3">Pipeline</div>
            <ol className="space-y-0.5">
              {stages.map((s, i) => {
                const active = selectedStage === s.id;
                const onActivate = () => setSelectedStage(active ? null : s.id);
                const onRowKey = (e: KeyboardEvent<HTMLDivElement>) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onActivate();
                  }
                };
                // Phase header — render a tiny label whenever the phase
                // changes between consecutive rows. Backbone v2.5 groups
                // 13 agent rows into 5 phases.
                const prevPhase = i > 0 ? (stages[i - 1] as { phase?: string }).phase : null;
                // Cast — `phase` is added in pipeline-stages.ts; older
                // PipelineStageSnapshot typing may not expose it yet.
                const phase = (s as unknown as { phase?: string }).phase;
                const showPhase = phase && phase !== prevPhase;
                const phaseLabel =
                  phase === 'pre-production'
                    ? 'Pre-production'
                    : phase === 'production'
                      ? 'Production'
                      : phase === 'generation'
                        ? 'Generation'
                        : phase === 'distribution'
                          ? 'Distribution'
                          : phase === 'analytics'
                            ? 'Analytics'
                            : '';
                return (
                  <li key={s.id}>
                    {showPhase && (
                      <div
                        className="text-[10px] uppercase tracking-[0.15em] mt-3 mb-1 px-2"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {phaseLabel}
                      </div>
                    )}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={onActivate}
                      onKeyDown={onRowKey}
                      className="group flex items-center gap-3 w-full px-2 py-1.5 rounded-lg transition-colors text-left cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-info)]"
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
                      <span className="flex-1 text-sm text-text-primary">
                        {(s as unknown as { emoji?: string }).emoji && (
                          <span className="mr-1.5 text-xs">
                            {(s as unknown as { emoji?: string }).emoji}
                          </span>
                        )}
                        {s.label}
                      </span>
                      {s.job_count && s.job_count.total > 0 && (
                        <span className="text-[10px] uppercase tracking-wider text-text-muted">
                          {s.job_count.done}/{s.job_count.total}
                        </span>
                      )}
                      <StageKebabMenu
                        episodeId={id}
                        stageId={s.id as PipelineStageId}
                        stageLabel={s.label}
                        stageAgents={s.agents}
                        stageState={s.state}
                        assetsInReview={s.assets_in_review}
                        latestAssetId={s.latest_asset_id}
                        latestAssetType={s.latest_asset_type}
                        onOpenPreview={(assetId, title) => {
                          setPreviewAssetId(assetId);
                          setPreviewTitle(title);
                        }}
                        onChanged={() => mutate()}
                      />
                    </div>
                    {i < stages.length - 1 && (
                      <div
                        className="ml-5 h-2 w-px"
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
              <div>Hover any stage for actions ⋯</div>
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

            {/* When the selected stage is Episode references — render the gallery
                in place of (or above) the activity feed. Director's request:
                small thumbnails, click → Drawer with ← back. */}
            {selectedStage === 'episode_references' && (
              <div className="mb-3 space-y-3">
                <EREFPilotPillbar
                  episodeId={id}
                  stageRunning={
                    stages.find((s) => s.id === 'episode_references')?.state === 'running'
                  }
                />
                <EpisodeReferencesGallery episodeId={id} seriesId={episode.series_id} />
              </div>
            )}

            {/* When the selected stage is Visual Generator — render the VGEN
                pilot pillbar + collapsed-by-default batch defaults panel. */}
            {selectedStage === 'visual_generator' && (
              <div className="mb-3 space-y-3">
                <VGENPilotPillbar
                  episodeId={id}
                  stageRunning={
                    stages.find((s) => s.id === 'visual_generator')?.state === 'running'
                  }
                />
                <VGENBatchPanel
                  episodeId={id}
                  seriesId={episode.series_id}
                />
              </div>
            )}

            {filtered.length === 0 && (
              <p className="text-sm text-text-secondary">
                {selectedStage ? 'No activity for this stage yet.' : 'Pipeline is idle.'}
              </p>
            )}

            <div className="space-y-2">
              {filtered.map((e) => {
                const hasAsset = Boolean(e.asset_id);
                return (
                  <div
                    key={e.id}
                    className="group rounded-lg border border-glass bg-panel-glass-strong px-3 py-2"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-text-primary font-medium flex-1 min-w-0 truncate">
                        {e.title}
                      </span>
                      <span className="text-text-muted">{relativeTime(e.created_at)}</span>
                      {hasAsset && (
                        <button
                          onClick={() => {
                            setPreviewAssetId(e.asset_id ?? null);
                            setPreviewTitle(e.title);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center w-6 h-6 rounded-md text-text-secondary hover:bg-[var(--panel-hover-bg)] hover:text-text-primary"
                          title="Open preview"
                          aria-label="Open preview"
                        >
                          <Eye size={12} strokeWidth={1.7} />
                        </button>
                      )}
                    </div>
                    {e.description && (
                      <div className="text-[12px] text-text-secondary mt-1 leading-snug">
                        {e.description}
                      </div>
                    )}
                  </div>
                );
              })}
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

      <PreviewDrawer
        open={previewAssetId !== null}
        onClose={() => setPreviewAssetId(null)}
        assetId={previewAssetId}
        title={previewTitle}
      />
    </StudioContentFrame>
  );
}

function ApproveBriefBanner({
  episodeId,
  governanceMode,
  briefAssetId,
  onApproved,
  onBriefEdited,
}: {
  episodeId: string;
  governanceMode: number;
  briefAssetId: string | null;
  onApproved: () => void;
  onBriefEdited: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // Pull the brief markdown so the Director can read what's about to be approved.
  const { data: briefData, mutate: mutateBrief } = useSWR<{
    data: { content: string; asset: { filename: string; status: string } };
  }>(briefAssetId ? `/api/assets/${briefAssetId}/content` : null, fetcher);
  const briefContent = briefData?.data.content ?? '';

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
      className="rounded-2xl border px-5 py-4 mb-4 space-y-3"
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
            Approving the brief locks it as APPROVED and dispatches the{' '}
            <span className="text-text-primary">Writer</span>.
            {governanceMode === 4
              ? ' Mode 4 AUTOTEST — entire pipeline will auto-run through Publish.'
              : ` Mode ${governanceMode} — each downstream gate (Script, Storyboard, Animatic, Generation, Publish) will land in your Inbox for review.`}
          </p>
          {error && (
            <p className="text-xs mt-2" style={{ color: 'var(--accent-danger)' }}>
              {error}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {briefAssetId && (
            <Button
              variant="ghost"
              onClick={() => setEditorOpen(true)}
              disabled={pending}
            >
              <Pencil size={14} /> Edit brief
            </Button>
          )}
          <Button onClick={approve} disabled={pending} variant="warning">
            <Play size={14} /> {pending ? 'Starting…' : 'Approve Brief & Start Pipeline'}
          </Button>
        </div>
      </div>

      {briefContent && (
        <details
          open
          className="rounded-lg border border-glass px-4 py-3 leading-relaxed text-sm text-text-primary"
          style={{ background: 'var(--bg-elevated)' }}
        >
          <summary className="text-[11px] uppercase tracking-wider text-text-muted cursor-pointer mb-2">
            Brief preview · {briefData?.data.asset.filename}
          </summary>
          <div className="markdown-body mt-2">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="text-base font-semibold mt-1 mb-2 text-text-primary">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-sm font-semibold mt-3 mb-1 text-text-primary uppercase tracking-wider">
                    {children}
                  </h2>
                ),
                p: ({ children }) => (
                  <p className="mb-2 text-text-secondary text-[13px]">{children}</p>
                ),
                ul: ({ children }) => <ul className="list-disc ml-5 mb-2 space-y-0.5">{children}</ul>,
                li: ({ children }) => <li className="text-text-secondary text-[13px]">{children}</li>,
                hr: () => <hr className="my-3 border-glass" />,
                em: ({ children }) => (
                  <em className="text-text-muted not-italic">{children}</em>
                ),
              }}
            >
              {briefContent}
            </ReactMarkdown>
          </div>
        </details>
      )}

      {!briefContent && briefAssetId && (
        <p className="text-[11px] text-text-muted italic">
          Loading brief… (the brief is generated automatically when the episode is created — should appear within seconds)
        </p>
      )}

      <EditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        assetId={briefAssetId}
        assetFilename={briefData?.data.asset.filename}
        onSaved={() => {
          mutateBrief();
          onBriefEdited();
        }}
      />
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
              <option key={a} value={a}>{agentDisplayName(a)} ({a})</option>
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
