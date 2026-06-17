// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/episodes/[id]/page.tsx — Pipeline View per pipeline_view.md.
// Two panes: DAG (left 40%) + Agent Report Feed (right 60%).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { use, useState, useEffect, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type CSSProperties } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, RefreshCw, RotateCcw, MoreHorizontal, Play, Eye, Pencil, Archive, ChevronDown, ChevronRight } from 'lucide-react';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StageKebabMenu } from '@/components/pipeline/StageKebabMenu';
import { StageWorkspacePanel, type WorkstationStage } from '@/components/pipeline/StageWorkspacePanel';
import { PreviewDrawer } from '@/components/preview/PreviewDrawer';
import { EditorModal } from '@/components/editor/EditorModal';
import { EpisodeReferencesGallery } from '@/components/episode/EpisodeReferencesGallery';
import { EREFPilotPillbar } from '@/components/pipeline/EREFPilotPillbar';
import { EpisodeSettingsCard } from '@/components/episode/EpisodeSettingsCard';
import { VGENPilotPillbar } from '@/components/pipeline/VGENPilotPillbar';
import { VGENBatchPanel } from '@/components/vgen/VGENBatchPanel';
import { EpisodeTimelineSection } from '@/components/timeline/EpisodeTimelineSection';
import type { PipelineStageId } from '@/lib/api/pipeline-stages';
import { agentDisplayName } from '@/lib/api/agent-names';
import { ActivityEventRow } from '@/components/activity/ActivityEventRow';
import { fetcher } from '@/lib/swr';

interface Stage {
  id: string;
  label: string;
  subtitle?: string;
  emoji?: string;
  phase?: string;
  /** Topic 3 — 'primary' renders full-weight; 'muted' collapses under `serves`. */
  tier?: 'primary' | 'muted';
  role?: 'input' | 'author' | 'designer' | 'critic' | 'artist' | 'editor' | 'publisher' | 'analyst';
  /** Topic 3 — MUTED row → the PRIMARY stage id it serves. */
  serves?: string;
  state: 'idle' | 'running' | 'approved' | 'blocked' | 'failed';
  agents: string[];
  job_count?: { total: number; done: number; running: number; failed: number };
  latest_asset_id?: string;
  latest_asset_type?: string;
  latest_verdict?: 'PASS' | 'REVISE' | 'FAIL';
  unstaffed?: boolean;
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
  metadata?: {
    archival?: EpisodeArchival;
    /** TD-49 Phase 2 P2.3 (2026-05-25): opt episode into the anchor pair
     *  pipeline. EpisodeSettingsCard toggles it via the settings PATCH. */
    anchor_chain_enabled?: boolean;
  } | null;
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

// Topic 3 — Critic verdict chip color (semantic tokens only).
const VERDICT_COLOR: Record<NonNullable<Stage['latest_verdict']>, string> = {
  PASS: 'var(--accent-success)',
  REVISE: 'var(--accent-warning)',
  FAIL: 'var(--accent-danger)',
};

export default function PipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  // Topic 3 — which PRIMARY rows have their MUTED Designer/Critic children
  // expanded. Collapsed by default (q9b).
  const [expandedPrimaries, setExpandedPrimaries] = useState<Set<string>>(new Set());
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string | undefined>();

  // Resizable left-rail width (px), persisted. Mirrors ConciergePanel's resize
  // handle (no new dependency). Hydrated from localStorage in an effect so SSR
  // renders the default; clamped to a sane band.
  const [leftWidth, setLeftWidth] = useState(360);
  useEffect(() => {
    try {
      const w = parseInt(localStorage.getItem('sandystudio.episode.pipelineWidth') ?? '', 10);
      if (Number.isFinite(w) && w >= 280 && w <= 760) setLeftWidth(w);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('sandystudio.episode.pipelineWidth', String(leftWidth));
    } catch { /* ignore */ }
  }, [leftWidth]);
  function onPipelineResizeStart(e: ReactMouseEvent): void {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftWidth;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
    const onMove = (mv: MouseEvent): void => {
      setLeftWidth(Math.max(280, Math.min(760, startW + (mv.clientX - startX))));
    };
    const onUp = (): void => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

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
  // Topic 3 — the selected stage object + the Critic that gates it (so the
  // Artist's workstation can also surface the Critic verdict, q10a).
  const selectedStageObj = selectedStage
    ? stages.find((s) => s.id === selectedStage) ?? null
    : null;
  const servingCritic =
    selectedStageObj && selectedStageObj.role !== 'critic'
      ? stages.find((s) => s.role === 'critic' && s.serves === selectedStageObj.id) ?? null
      : null;

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

      {/* Resizable split (Director 2026-06-17): the pipeline becomes a full-height
          left RAIL pinned from the top; timeline + settings + workstation/feed live
          in the right column which scrolls. The divider between them drags to
          redistribute width (rail shrinks → right grows and vice-versa). The resize
          mechanic mirrors ConciergePanel's handle — no new dependency. Below lg the
          split stacks vertically and the rail spans full width (no resize). */}
      <div className="flex flex-col lg:flex-row lg:gap-3 items-start">
        {/* LEFT RAIL — pipeline DAG. Width from --rail-w (lg only); sticky so it
            stays put while the right column scrolls; self-scrolls if tall. */}
        <aside
          style={{ '--rail-w': `${leftWidth}px` } as CSSProperties}
          className="w-full lg:w-[var(--rail-w)] lg:shrink-0 lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-1.5rem)] lg:overflow-y-auto"
        >
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wider text-text-muted mb-3">Pipeline</div>
            <PipelineDag
              stages={stages}
              episodeId={id}
              selectedStage={selectedStage}
              onSelect={(sid) => setSelectedStage(selectedStage === sid ? null : sid)}
              expandedPrimaries={expandedPrimaries}
              onToggleExpand={(pid) =>
                setExpandedPrimaries((prev) => {
                  const next = new Set(prev);
                  if (next.has(pid)) next.delete(pid);
                  else next.add(pid);
                  return next;
                })
              }
              onOpenPreview={(assetId, title) => {
                setPreviewAssetId(assetId);
                setPreviewTitle(title);
              }}
              onChanged={() => mutate()}
            />
            <div className="mt-4 pt-3 border-t border-glass space-y-1 text-[10px] text-text-muted">
              <div>● approved · ◐ running · ◇ blocked · ✗ failed · ○ idle</div>
              <div>Click a stage → workstation. Designers/Critics tuck under their stage.</div>
              <div>Hover any stage for actions ⋯</div>
            </div>
          </CardBody>
        </Card>
        </aside>

        {/* DIVIDER — drag to resize the rail / right column. Mirrors
            ConciergePanel's separator; hidden below lg (stacked layout). */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize pipeline panel"
          title="Drag to resize"
          onMouseDown={onPipelineResizeStart}
          className="hidden lg:block lg:sticky lg:top-0 lg:h-[calc(100vh-1.5rem)] w-1.5 shrink-0 cursor-ew-resize rounded-full bg-glass hover:bg-[var(--accent-primary)]/40 transition-colors"
        />

        {/* RIGHT COLUMN — scrolls with <main>; flex-1 auto-fills the remaining
            width so shrinking the rail grows this side and vice-versa. */}
        <div className="w-full lg:flex-1 min-w-0 space-y-4">
          {/* Episode timeline — unified progressive review surface (Phase A).
              Auto-hides when no animatic v1 yet. Click any cell → drawer opens. */}
          <EpisodeTimelineSection episodeId={id} />

          {/* Per-episode settings (collapsible). Director-only PATCH surface. */}
          <EpisodeSettingsCard
            episodeId={id}
            initialMetadata={episode.metadata ?? null}
            initialBudgetCeiling={episode.budget_ceiling ?? null}
          />

          {/* Workstation (selected stage) OR activity feed (default surface). */}
          <Card>
          <CardBody>
            {selectedStageObj ? (
              <div className="space-y-3">
                <div className="text-xs uppercase tracking-wider text-text-muted mb-1">
                  Workstation
                </div>
                <StageWorkspacePanel
                  episodeId={id}
                  stage={selectedStageObj as WorkstationStage}
                  critic={servingCritic as WorkstationStage | null}
                  onClose={() => setSelectedStage(null)}
                  onChanged={() => mutate()}
                  onOpenPreview={(assetId, title) => {
                    setPreviewAssetId(assetId);
                    setPreviewTitle(title);
                  }}
                />

                {/* Artist-specific batch surfaces remain available inside the
                    workstation context for the two high-volume Artist stages. */}
                {selectedStage === 'episode_references' && (
                  <div className="space-y-3 pt-2 border-t border-glass">
                    <EREFPilotPillbar
                      episodeId={id}
                      stageRunning={selectedStageObj.state === 'running'}
                    />
                    <EpisodeReferencesGallery episodeId={id} seriesId={episode.series_id} />
                  </div>
                )}
                {selectedStage === 'visual_generator' && (
                  <div className="space-y-3 pt-2 border-t border-glass">
                    <VGENPilotPillbar
                      episodeId={id}
                      stageRunning={selectedStageObj.state === 'running'}
                    />
                    <VGENBatchPanel episodeId={id} seriesId={episode.series_id} />
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-wider text-text-muted">
                    Activity feed
                  </div>
                </div>

                {filtered.length === 0 && (
                  <p className="text-sm text-text-secondary">Pipeline is idle.</p>
                )}

                <div className="space-y-2">
                  {filtered.map((e) => (
                    <ActivityEventRow
                      key={e.id}
                      event={e}
                      trailing={
                        e.asset_id ? (
                          <button
                            onClick={() => {
                              setPreviewAssetId(e.asset_id ?? null);
                              setPreviewTitle(e.title);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center w-6 h-6 rounded-md text-text-secondary hover:bg-[var(--panel-hover-bg)] hover:text-text-primary shrink-0"
                            title="Open preview"
                            aria-label="Open preview"
                          >
                            <Eye size={12} strokeWidth={1.7} />
                          </button>
                        ) : undefined
                      }
                    />
                  ))}
                </div>
              </>
            )}
          </CardBody>
          </Card>
        </div>
      </div>

      <TriggerModal
        open={triggerOpen}
        onClose={() => setTriggerOpen(false)}
        episodeId={id}
        onTriggered={() => mutate()}
      />

      <ArchiveModal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        episodeId={id}
        episodeCode={episode.episode_code}
        onArchived={() => mutate()}
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

// ──────────────────────────────────────────────────────────────────────────────
// PipelineDag — Topic 3 tier-aware vertical DAG. PRIMARY rows render full-weight
// in order; their MUTED Designer/Critic children (rows whose `serves` points at
// the primary) nest indented below, collapsed by default, expanded on click.
// ──────────────────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  'pre-production': 'Pre-production',
  production: 'Production',
  generation: 'Generation',
  distribution: 'Distribution',
  analytics: 'Analytics',
};

interface PipelineDagProps {
  stages: Stage[];
  episodeId: string;
  selectedStage: string | null;
  onSelect: (stageId: string) => void;
  expandedPrimaries: Set<string>;
  onToggleExpand: (primaryId: string) => void;
  onOpenPreview: (assetId: string, title?: string) => void;
  onChanged: () => void;
}

function PipelineDag({
  stages,
  episodeId,
  selectedStage,
  onSelect,
  expandedPrimaries,
  onToggleExpand,
  onOpenPreview,
  onChanged,
}: PipelineDagProps) {
  // Group MUTED rows under the PRIMARY id they serve.
  const childrenByPrimary = new Map<string, Stage[]>();
  for (const s of stages) {
    if (s.tier === 'muted' && s.serves) {
      if (!childrenByPrimary.has(s.serves)) childrenByPrimary.set(s.serves, []);
      childrenByPrimary.get(s.serves)!.push(s);
    }
  }

  // Top-level rows = PRIMARY rows, plus any MUTED row whose parent isn't
  // present among the stages (defensive — keeps every row reachable even if
  // `serves` is stale).
  const presentIds = new Set(stages.map((s) => s.id));
  const orderedTop = stages.filter(
    (s) => s.tier !== 'muted' || !s.serves || !presentIds.has(s.serves),
  );

  let prevPhase: string | null = null;

  return (
    <ol className="space-y-0.5">
      {orderedTop.map((s, i) => {
        const phase = s.phase ?? null;
        const showPhase = phase != null && phase !== prevPhase;
        prevPhase = phase;
        const kids = childrenByPrimary.get(s.id) ?? [];
        const expanded = expandedPrimaries.has(s.id);
        return (
          <li key={s.id}>
            {showPhase && (
              <div
                className="text-[10px] uppercase tracking-[0.15em] mt-3 mb-1 px-2"
                style={{ color: 'var(--text-muted)' }}
              >
                {PHASE_LABELS[phase!] ?? ''}
              </div>
            )}
            <PipelineRow
              stage={s}
              episodeId={episodeId}
              active={selectedStage === s.id}
              onSelect={onSelect}
              onOpenPreview={onOpenPreview}
              onChanged={onChanged}
              childCount={kids.length}
              expanded={expanded}
              onToggleExpand={kids.length > 0 ? () => onToggleExpand(s.id) : undefined}
            />
            {/* MUTED Designer/Critic children — collapsed by default (q9b). */}
            {kids.length > 0 && expanded && (
              <div className="ml-6 mt-0.5 space-y-0.5 border-l border-glass pl-2">
                {kids.map((k) => (
                  <PipelineRow
                    key={k.id}
                    stage={k}
                    episodeId={episodeId}
                    active={selectedStage === k.id}
                    onSelect={onSelect}
                    onOpenPreview={onOpenPreview}
                    onChanged={onChanged}
                    muted
                  />
                ))}
              </div>
            )}
            {i < orderedTop.length - 1 && (
              <div
                className="ml-5 h-2 w-px"
                style={{ background: NODE_COLOR[s.state], opacity: 0.4 }}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

interface PipelineRowProps {
  stage: Stage;
  episodeId: string;
  active: boolean;
  onSelect: (stageId: string) => void;
  onOpenPreview: (assetId: string, title?: string) => void;
  onChanged: () => void;
  muted?: boolean;
  childCount?: number;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

function PipelineRow({
  stage: s,
  episodeId,
  active,
  onSelect,
  onOpenPreview,
  onChanged,
  muted = false,
  childCount = 0,
  expanded = false,
  onToggleExpand,
}: PipelineRowProps) {
  const onRowKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(s.id);
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(s.id)}
      onKeyDown={onRowKey}
      className="group flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg transition-colors text-left cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-info)]"
      style={{ background: active ? 'var(--panel-hover-bg)' : 'transparent' }}
    >
      <span
        className={`leading-none text-center ${muted ? 'text-base w-4' : 'text-2xl w-6'}`}
        style={{ color: s.unstaffed ? 'var(--text-muted)' : NODE_COLOR[s.state] }}
      >
        {NODE_GLYPH[s.state]}
      </span>
      <span
        className={`flex-1 ${muted ? 'text-[12px] text-text-secondary' : 'text-sm text-text-primary'}`}
      >
        {s.emoji && <span className="mr-1.5 text-xs">{s.emoji}</span>}
        {s.label}
        {muted && s.role && (
          <span className="ml-1.5 text-[10px] uppercase tracking-wider text-text-muted">
            {s.role}
          </span>
        )}
        {s.unstaffed && (
          <span className="ml-1.5 text-[10px] italic text-text-muted">not staffed</span>
        )}
      </span>
      {/* Critic verdict chip — visible on the muted Critic row at a glance. */}
      {s.latest_verdict && (
        <span
          className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{
            color: VERDICT_COLOR[s.latest_verdict],
            background: `color-mix(in oklab, ${VERDICT_COLOR[s.latest_verdict]} 14%, transparent)`,
          }}
        >
          {s.latest_verdict}
        </span>
      )}
      {!muted && s.job_count && s.job_count.total > 0 && (
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          {s.job_count.done}/{s.job_count.total}
        </span>
      )}
      {/* Expand/collapse toggle for a PRIMARY that has muted children. */}
      {onToggleExpand && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="inline-flex items-center justify-center w-6 h-6 rounded-md text-text-muted hover:bg-[var(--panel-hover-bg)] hover:text-text-primary"
          title={expanded ? 'Collapse designers/critics' : `Show ${childCount} designer/critic step${childCount > 1 ? 's' : ''}`}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
      )}
      {!s.unstaffed && (
        <StageKebabMenu
          episodeId={episodeId}
          stageId={s.id as PipelineStageId}
          stageLabel={s.label}
          stageAgents={s.agents}
          stageState={s.state}
          assetsInReview={s.assets_in_review}
          latestAssetId={s.latest_asset_id}
          latestAssetType={s.latest_asset_type}
          onOpenPreview={onOpenPreview}
          onChanged={onChanged}
        />
      )}
    </div>
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

function ArchiveModal({
  open,
  onClose,
  episodeId,
  episodeCode,
  onArchived,
}: {
  open: boolean;
  onClose: () => void;
  episodeId: string;
  episodeCode: string;
  onArchived: () => void;
}) {
  const [state, setState] = useState<'PARTIAL' | 'COMPLETE'>('PARTIAL');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function fire() {
    if (reason.trim().length < 3) return;
    setPending(true);
    setErr(null);
    const res = await fetch(`/api/episodes/${episodeId}/archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state, reason: reason.trim() }),
    });
    setPending(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? `Archive failed (${res.status})`);
      return;
    }
    onArchived();
    onClose();
    setReason('');
    setState('PARTIAL');
  }

  return (
    <Modal open={open} onClose={onClose} title={`Archive ${episodeCode}`}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
            Archive state
          </label>
          <div className="flex gap-2">
            {(['PARTIAL', 'COMPLETE'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setState(s)}
                className={`flex-1 h-10 px-3 rounded-lg border text-sm font-medium transition ${
                  state === s
                    ? 'border-[var(--accent-warning)] text-[var(--accent-warning)] bg-[color-mix(in_oklab,var(--accent-warning)_12%,transparent)]'
                    : 'border-glass text-text-secondary hover:text-text-primary'
                }`}
              >
                {s === 'PARTIAL' ? 'Partial — closed early' : 'Complete — explicitly retired'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
            Reason (required, audit log)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              state === 'PARTIAL'
                ? 'e.g. Veo quota exhausted on SC11, pipeline closed at 17/19'
                : 'e.g. shipped, analytics window closed, no further work'
            }
            rows={3}
            className="w-full p-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm resize-none"
          />
        </div>
        <p className="text-[11px] text-text-muted">
          Flips status to <code className="font-mono">ARCHIVED</code>, cancels any
          QUEUED/RUNNING/RETRYING jobs on this episode, and logs an
          <code className="font-mono"> episode_archived</code> audit event.
          Idempotent — re-archiving an ARCHIVED episode is rejected.
        </p>
        {err && (
          <p className="text-xs text-[var(--accent-danger)]">{err}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={fire} disabled={pending || reason.trim().length < 3} variant="warning">
            {pending ? 'Archiving…' : 'Archive episode'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
