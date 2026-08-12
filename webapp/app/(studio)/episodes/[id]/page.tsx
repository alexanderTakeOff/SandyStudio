// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/episodes/[id]/page.tsx — Pipeline View per pipeline_view.md.
// Two panes: DAG (left 40%) + Agent Report Feed (right 60%).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { use, useState, useEffect, useRef, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import useSWR from 'swr';
import ReactMarkdown from 'react-markdown';
import { RefreshCw, RotateCcw, MoreHorizontal, Play, Eye, Pencil, Trash2, CheckCircle2, ChevronDown, ChevronRight, Power, BookOpen } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { splitLedger, type LedgerRow } from '@/lib/budget-split';
import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DropdownMenu, type DropdownEntry } from '@/components/ui/DropdownMenu';
import { StageKebabMenu } from '@/components/pipeline/StageKebabMenu';
import { StageWorkspacePanel, type WorkstationStage } from '@/components/pipeline/StageWorkspacePanel';
import { PreviewDrawer } from '@/components/preview/PreviewDrawer';
import { EditorModal } from '@/components/editor/EditorModal';
import { EREFPilotPillbar } from '@/components/pipeline/EREFPilotPillbar';
import { EpisodeSettingsCard } from '@/components/episode/EpisodeSettingsCard';
import { VGENPilotPillbar } from '@/components/pipeline/VGENPilotPillbar';
import { VGENBatchPanel } from '@/components/vgen/VGENBatchPanel';
import { EpisodeTimelineSection } from '@/components/timeline/EpisodeTimelineSection';
import type { PipelineStageId } from '@/lib/api/pipeline-stages';
import { agentDisplayName } from '@/lib/api/agent-names';
import { useWorkspaceScope } from '@/components/providers/WorkspaceScopeProvider';
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

const nodeGlow = (c: string) => `0 0 6px color-mix(in oklab, ${c} 55%, transparent)`;

// ЦВЕТ РЕЛЬСА = СОСТОЯНИЕ (11.08, канон `specs/system/pipeline_view.md` §3.2).
//
// До этого цвет держал ИДЕНТИЧНОСТЬ стадии, а состояние выражалось только
// свечением и жирностью — и утверждённой стадии зелёного не доставалось вовсе.
// Директор читает колонку по диагонали: ему нужно «где встало» и «что готово»
// одним взглядом, а не какого рода работа живёт в строке.
//
// Кебаб аниматика остаётся на прежней грамматике (`stageIdentity`/`stageRamp` в
// pipeline-stages.ts) — там цвет как раз обязан говорить о РОДЕ работы. Два
// разных алфавита на двух разных поверхностях; ни один не отменяет другой.
const STATE_TOKEN: Record<Stage['state'], string> = {
  idle: 'var(--text-muted)',
  running: 'var(--accent-primary)',
  approved: 'var(--accent-success)',
  blocked: 'var(--accent-info)',
  failed: 'var(--accent-danger)',
};

function nodeVisual(s: Stage): { color: string; glow?: string; pulse: boolean; bold: boolean } {
  if (s.state === 'idle' || s.unstaffed) {
    return { color: STATE_TOKEN.idle, pulse: false, bold: false };
  }
  const color = STATE_TOKEN[s.state];
  return {
    color,
    glow: nodeGlow(color),
    pulse: s.state === 'running',
    bold: s.state === 'approved',
  };
}

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
  // expanded. EXPANDED by default (Director 2026-07-23): collapsed-by-default hid
  // the Reference Designer + Reference Critic under "Reference Artist", which read
  // as "the stage never started" during the E31 smoke. The one-time init effect
  // below opens every primary that has children on first load; the user can still
  // collapse any of them afterward.
  const [expandedPrimaries, setExpandedPrimaries] = useState<Set<string>>(new Set());
  const didInitExpandRef = useRef(false);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [markCompleteOpen, setMarkCompleteOpen] = useState(false);
  // Emergency server controls (moved into the header kebab, 2026-07-24).
  const [serverAction, setServerAction] = useState<'stop' | 'restart' | null>(null);
  // Whole-episode Visual Critic (moved from the timeline header into the kebab).
  const [visualCheckMsg, setVisualCheckMsg] = useState<string | null>(null);
  const [visualChecking, setVisualChecking] = useState(false);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string | undefined>();

  // Chunk 2c (2026-07-24): the episode header (code · title · budget · ⋯) is
  // portaled UP into the sticky StudioTopbar's `#studio-topbar-slot`, turning the
  // top bar into this page's contextual header. Grab the slot node after mount;
  // it lives in the shell rendered above this page, so it exists by first effect.
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  // Деньги в шапке (2026-08-10). Показывали `episodes.budget_spent` — поле
  // РЕЗЕРВАЦИЙ, которое почти никто не обновляет: на E06 оно застряло на $0.24,
  // когда прямых трат было уже $21. Истина — `budget_log`, и считаем оттуда ровно
  // так же, как гейт: ПРЯМЫЕ счета провайдеров, без подписочных оценок ходов ума
  // (их тир помечен `subscription-estimate` и деньгами не является).
  const [directSpent, setDirectSpent] = useState<number | null>(null);
  useEffect(() => {
    setTopbarSlot(document.getElementById('studio-topbar-slot'));
  }, []);

  // Прямые траты для шапки — из budget_log, тем же правилом, что и гейт Полины.
  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      try {
        const sb = createSupabaseBrowserClient();
        const { data } = await sb.from('budget_log').select('cost_usd,model_or_tier').eq('episode_id', id);
        if (cancelled) return;
        setDirectSpent(splitLedger((data ?? []) as LedgerRow[]).direct);
      } catch { /* best-effort: молча падаем на старое поле budget_spent */ }
    };
    void read();
    const t = setInterval(() => { void read(); }, 15_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [id]);

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
    // 2026-06-26 (Director): 30s → 8s. This SWR drives BOTH the pipeline nodes
    // AND the episode activity feed (which is poll-based here, not realtime), so
    // a 30s cadence left a long gap between an agent's "started" and the UI
    // reflecting it — unnerving when Polina reports a trigger and nothing moves.
    { refreshInterval: 8_000 },
  );

  // КОНТЕКСТ ОПЕРАТОРА: страница сообщает провайдеру серию открытого эпизода —
  // она уже пришла с этим запросом, и провайдеру не нужно грузить её вторично.
  // Без этого дропдаун и вкладки продолжали показывать прошлый выбор (12.08).
  const { adoptEntitySeries } = useWorkspaceScope();
  const loadedSeriesId = data?.data?.episode?.series_id ?? null;
  useEffect(() => {
    adoptEntitySeries(loadedSeriesId);
  }, [loadedSeriesId, adoptEntitySeries]);

  // One-time default-expand: once stages load, open EVERY primary that has muted
  // Designer/Critic children so hidden sub-stages are visible immediately (the
  // ref-designer/critic-hidden-under-Reference-Artist confusion). Runs once; the
  // user's later collapse/expand choices are preserved (guarded by the ref).
  useEffect(() => {
    if (didInitExpandRef.current) return;
    const loadedStages = data?.data?.stages;
    if (!loadedStages || loadedStages.length === 0) return;
    const primariesWithChildren = new Set<string>();
    for (const s of loadedStages) {
      if (s.serves) primariesWithChildren.add(s.serves);
    }
    setExpandedPrimaries(primariesWithChildren);
    didInitExpandRef.current = true;
  }, [data]);

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

  async function handleServerAction(action: 'stop' | 'restart'): Promise<void> {
    const label =
      action === 'stop'
        ? 'STOP servers: убить Inngest + app и запарковать очередь (шторм не возобновится). Продолжить?'
        : 'Restart servers: перезапустить app + Inngest (start-stack). Продолжить?';
    if (!window.confirm(label)) return;
    setServerAction(action);
    try {
      await fetch('/api/system/servers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
    } catch {
      // start-stack kills the app mid-request — a network error IS the success path.
    }
    if (action === 'restart') {
      window.setTimeout(() => window.location.reload(), 30_000);
    } else {
      setServerAction(null);
    }
  }

  async function handleVisualCheckEpisode(): Promise<void> {
    setVisualChecking(true);
    setVisualCheckMsg('👁 Проверяю эпизод…');
    try {
      const res = await fetch(`/api/episodes/${id}/visual-critic`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const j = (await res.json().catch(() => ({}))) as {
        data?: { checked?: number; flagged?: number };
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? 'Visual check failed');
      setVisualCheckMsg(
        `👁 Проверено ${j.data?.checked ?? 0}, помечено ${j.data?.flagged ?? 0}. Детали — в Activity.`,
      );
    } catch (e) {
      setVisualCheckMsg(`👁 Ошибка: ${(e as Error).message}`);
    } finally {
      setVisualChecking(false);
    }
  }

  const actionItems: DropdownEntry[] = [
    { label: 'Refresh', icon: <RefreshCw size={14} />, onSelect: () => mutate() },
    { label: 'Re-trigger…', icon: <RotateCcw size={14} />, onSelect: () => setTriggerOpen(true) },
    {
      label: visualChecking ? 'Visual check…' : 'Visual check',
      icon: <Eye size={14} />,
      onSelect: () => void handleVisualCheckEpisode(),
    },
  ];
  if (episode.status !== 'COMPLETE' && episode.status !== 'ARCHIVED') {
    actionItems.push({
      label: 'Mark Complete',
      icon: <CheckCircle2 size={14} />,
      onSelect: () => setMarkCompleteOpen(true),
    });
  }
  if (episode.status !== 'ARCHIVED') {
    actionItems.push(
      { separator: true },
      {
        label: 'Move to Trash…',
        icon: <Trash2 size={14} />,
        destructive: true,
        onSelect: () => setArchiveOpen(true),
      },
    );
  }
  actionItems.push(
    { separator: true },
    {
      label: 'STOP servers',
      icon: <Power size={14} />,
      destructive: true,
      onSelect: () => void handleServerAction('stop'),
    },
    {
      label: serverAction === 'restart' ? 'Restarting…' : 'Restart servers',
      icon: <RotateCcw size={14} />,
      onSelect: () => void handleServerAction('restart'),
    },
  );

  return (
    <StudioContentFrame>
      {/* Header — portaled UP into the sticky StudioTopbar (Chunk 2c): the top bar
          IS this episode's contextual header. Compact single row: code · title
          (no quotes) · budget on the left, the actions kebab pinned right. */}
      {topbarSlot &&
        createPortal(
          <>
            <div className="flex items-baseline gap-3 min-w-0 flex-1">
              {/* Только номер эпизода (Директор, 10.08): префикс SS-S20- дублирует
                  переключатель сериала слева, а место в шапке дорогое. Кегль поднят —
                  это заголовок страницы, а не подпись. */}
              <span
                className="text-base font-semibold shrink-0"
                style={{
                  color:
                    episode.status === 'ARCHIVED'
                      ? 'var(--accent-warning)'
                      : 'var(--text-primary)',
                }}
                title={
                  episode.status === 'ARCHIVED'
                    ? `Archived (in Trash) · ${episode.episode_code}`
                    : episode.episode_code
                }
              >
                {episode.episode_code.replace(/^SS-S\d+-/, '')}
              </span>
              {episode.title_working && (
                <span
                  className="text-base font-normal truncate"
                  style={{
                    color:
                      episode.status === 'ARCHIVED'
                        ? 'color-mix(in oklab, var(--accent-warning) 70%, var(--text-muted))'
                        : 'var(--text-secondary)',
                  }}
                >
                  {episode.title_working}
                </span>
              )}
              <span
                className="text-xs text-text-muted whitespace-nowrap shrink-0"
                title="Прямые счета провайдеров (fal · openai · anthropic по API). Ходы ума на подписке сюда не входят — они деньгами не являются."
              >
                ${(directSpent ?? episode.budget_spent ?? 0).toFixed(2)} / $
                {(episode.budget_ceiling ?? 0).toFixed(2)}
              </span>
              {/* Прямая дверь в библиотеку ЭТОГО сериала (Директор, 10.08): раньше
                  туда шли через список сериалов — длинный обходной путь к тому, что
                  открывают по десять раз за эпизод. */}
              <a
                href={`/series/${episode.series_id}?tab=bible`}
                className="text-xs whitespace-nowrap shrink-0 inline-flex items-center gap-1 px-2 h-6 rounded-md border border-glass text-text-secondary hover:text-text-primary hover:border-[var(--accent-primary)] transition-colors"
                title="Библиотека канона этого сериала"
              >
                <BookOpen size={12} />
                Библиотека
              </a>
            </div>
            <DropdownMenu
              ariaLabel="Episode actions"
              width={220}
              trigger={
                <span className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-glass text-text-secondary hover:bg-[var(--panel-hover-bg)] transition-colors">
                  <MoreHorizontal size={16} />
                </span>
              }
              items={actionItems}
            />
          </>,
          topbarSlot,
        )}

      {visualCheckMsg && (
        <div
          className="mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
          style={{
            background: 'color-mix(in oklab, var(--accent-info) 10%, transparent)',
            color: 'var(--text-primary)',
          }}
        >
          <span className="flex-1 whitespace-pre-wrap">{visualCheckMsg}</span>
          <button
            onClick={() => setVisualCheckMsg(null)}
            className="text-text-muted hover:text-text-primary"
          >
            ✕
          </button>
        </div>
      )}

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

      {/* F13 (2026-07-01): budget-approval hint. After the brief is approved,
          gate.ts blocks all AGENT_RUN generation until the Director approves the
          episode budget — surface WHY the pipeline is paused, pointing to the
          Episode Settings card below. */}
      {episode.status === 'BRIEF_APPROVED' &&
        (episode.metadata as { budget_approved?: unknown } | null)?.budget_approved !== true && (
          <div
            className="rounded-lg border px-4 py-3 text-sm text-text-primary"
            style={{ borderColor: 'var(--accent-warning)', background: 'var(--bg-elevated)' }}
          >
            ⚠ Brief approved — generation is paused until you approve the episode
            budget in <strong>Episode Settings</strong> below.
          </div>
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
              {/* Цвет = состояние (канон pipeline_view.md §3.2) — легенда обязана
                  говорить тем же алфавитом, что и рельс, иначе она врёт. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {(
                  [
                    ['approved', 'готово'],
                    ['running', 'идёт'],
                    ['blocked', 'ждёт'],
                    ['failed', 'сбой'],
                    ['idle', 'не начато'],
                  ] as ReadonlyArray<[Stage['state'], string]>
                ).map(([state, label]) => (
                  <span key={state} className="inline-flex items-center gap-1">
                    <span style={{ color: STATE_TOKEN[state] }}>{NODE_GLYPH[state]}</span>
                    {label}
                  </span>
                ))}
              </div>
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
            initialGovernanceMode={episode.governance_mode}
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
                    {/* Reference review moved to the always-on Episode Timeline
                        above (unified home surface): per-shot cells open the rich
                        drawer with Reject / regen-with-provider / AI verdict /
                        side-by-side variant compare. The separate
                        EpisodeReferencesGallery was retired (2026-07-02, Phase 4)
                        — it only duplicated the timeline's listing while opening
                        the same drawer. The pilot pillbar stays for pilot control. */}
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

      <MarkCompleteModal
        open={markCompleteOpen}
        onClose={() => setMarkCompleteOpen(false)}
        episodeId={id}
        episodeCode={episode.episode_code}
        onDone={() => mutate()}
      />

      <PreviewDrawer
        open={previewAssetId !== null}
        onClose={() => setPreviewAssetId(null)}
        assetId={previewAssetId}
        title={previewTitle}
        // Key Art concepts (and any candidate strip) switch the drawer to a
        // sibling by id — without this the "Key Art concepts" toggle was a no-op
        // on the episode page (the timeline wired it; this surface didn't).
        onPickAsset={(id) => setPreviewAssetId(id)}
        onAssetChanged={() => void mutate()}
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
  // Per-shot artists (Director 2026-07-23): the Reference Designer + Reference
  // Critic (serve `episode_references`) and the Video Designer + Video Critic
  // (serve `visual_generator`) FAN OUT per shot — there is no single episode-level
  // Designer/Critic for them, so a single pipeline line is meaningless. They live
  // in each shot's kebab, not the rail. Hide these muted children entirely; the
  // parent Artist row stays. (Episode-level critics — Script / Readability /
  // Continuity — remain, one per episode, and stay expanded by default.)
  const PER_SHOT_ARTIST_PRIMARIES = new Set(['episode_references', 'visual_generator']);

  // Group MUTED rows under the PRIMARY id they serve (skipping the per-shot ones).
  const childrenByPrimary = new Map<string, Stage[]>();
  for (const s of stages) {
    if (s.tier === 'muted' && s.serves && !PER_SHOT_ARTIST_PRIMARIES.has(s.serves)) {
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
                style={{ background: nodeVisual(s).color, opacity: 0.4 }}
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
  const nv = nodeVisual(s);
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
        className={`leading-none text-center ${muted ? 'text-base w-4' : 'text-2xl w-6'}${nv.pulse ? ' cell-stage-pulse' : ''}`}
        style={{
          color: nv.color,
          fontWeight: nv.bold ? 700 : undefined,
          textShadow: nv.glow,
          ...(nv.pulse ? { ['--stage-glow' as string]: nv.color } : {}),
        } as CSSProperties}
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
            {` Mode ${governanceMode} — each downstream gate (Script, Storyboard, Animatic, Generation, Publish) will land in your Inbox for review.`}
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
            className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-base font-mono"
          >
            {['EXEC-SW', 'EXEC-SREV', 'EXEC-SB', 'EXEC-WCHK', 'EXEC-EDIT', 'EXEC-VGEN', 'EXEC-MGEN', 'EXEC-COPY', 'EXEC-THUMB', 'EXEC-PUB', 'EXEC-ANAL'].map((a) => (
              <option key={a} value={a}>{agentDisplayName(a)} ({a})</option>
            ))}
          </select>
        </div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why? e.g. previous run produced wrong tone"
          className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-base"
        />
        <p className="text-text-secondary">Runs it again — makes a new version.</p>
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
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function fire() {
    if (reason.trim().length < 3) return;
    setPending(true);
    setErr(null);
    // No manual PARTIAL/COMPLETE — the server derives it from shot counts.
    const res = await fetch(`/api/episodes/${episodeId}/archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    setPending(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? `Move to Trash failed (${res.status})`);
      return;
    }
    onArchived();
    onClose();
    setReason('');
  }

  return (
    <Modal open={open} onClose={onClose} title={`Move ${episodeCode} to Trash`}>
      <div className="space-y-4">
        <p className="text-text-secondary">
          Leaves the ACTIVE list, running jobs are cancelled. Recoverable from the
          TRASH tab.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why? e.g. Veo quota exhausted, closed at 17/19"
          rows={3}
          className="w-full p-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-base resize-none"
        />
        {err && <p className="text-[var(--accent-danger)]">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={fire} disabled={pending || reason.trim().length < 3} variant="warning">
            {pending ? 'Moving…' : 'Move to Trash'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// MarkCompleteModal — Director override that flips the episode to COMPLETE (done
// / in catalog) from any stage. Reuses PATCH /api/episodes/[id]; the transition
// guard allows this manual terminal move (see status-transitions.ts).
// ──────────────────────────────────────────────────────────────────────────────
function MarkCompleteModal({
  open,
  onClose,
  episodeId,
  episodeCode,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  episodeId: string;
  episodeCode: string;
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function fire() {
    setPending(true);
    setErr(null);
    const res = await fetch(`/api/episodes/${episodeId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETE' }),
    });
    setPending(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? `Mark Complete failed (${res.status})`);
      return;
    }
    onDone();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Mark ${episodeCode} complete`}>
      <div className="space-y-4">
        <p className="text-text-secondary">
          Moves it to the COMPLETE tab. Final — the only way back is Trash.
        </p>
        {err && <p className="text-[var(--accent-danger)]">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={fire} disabled={pending}>
            <CheckCircle2 size={14} /> {pending ? 'Marking…' : 'Mark Complete'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
