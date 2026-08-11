// ──────────────────────────────────────────────────────────────────────────────
// components/pipeline/StageWorkspacePanel.tsx
// Topic 3 (2026-06-02) — the right-side WORKSTATION for a selected pipeline
// stage. Replaces "click a stage → filter the activity feed" as the canonical
// right-pane surface. Shows: the stage's latest artifact preview + the Critic
// verdict (which V-checks passed/failed) + actions [Edit][Retrigger][Approve]
// [Change provider], all wired to EXISTING endpoints.
//
// Design: docs/topic3-pipeline-systematization-design.md §4 + pipeline_view.md
// §3.5. q10a: a Critic is its own MUTED row AND its verdict surfaces here, in
// the Artist's workstation (via the `critic` prop the page passes for the
// PRIMARY this stage serves / is served by).
//
// Theme: semantic tokens only (no raw hex). Respects prefers-reduced-motion via
// the global motion rules — this panel uses no JS-driven animation.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import ReactMarkdown from 'react-markdown';
import { CheckCheck, Pencil, RotateCcw, Eye, Shuffle, X, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { MusicUploadButton } from '@/components/preview/MusicUploadButton';
import { EditorModal } from '@/components/editor/EditorModal';
import { RetriggerStageModal } from '@/components/pipeline/RetriggerStageModal';
import { CriticVerdictOverrideModal } from '@/components/assets/CriticVerdictOverrideModal';
import {
  postAssetDecision,
  withCriticOverride,
  CriticVerdictBlockedError,
  type AssetDecisionBody,
  type CriticFailure,
} from '@/lib/api/asset-decision';
import { agentDisplayName } from '@/lib/api/agent-names';
import type {
  PipelineNodeState,
  PipelineRole,
  PipelineTier,
  PipelineVerdict,
} from '@/lib/api/pipeline-stages';
import { fetcher } from '@/lib/swr';

export interface WorkstationStage {
  id: string;
  label: string;
  subtitle?: string;
  emoji?: string;
  role?: PipelineRole;
  tier?: PipelineTier;
  state: PipelineNodeState;
  agents: string[];
  latest_asset_id?: string;
  latest_asset_type?: string;
  latest_verdict?: PipelineVerdict;
  unstaffed?: boolean;
  assets_in_review?: number;
  serves?: string;
}

export interface StageWorkspacePanelProps {
  episodeId: string;
  stage: WorkstationStage;
  /**
   * The Critic stage whose verdict gates this PRIMARY stage (q10a). When the
   * selected stage is itself a Critic this is undefined; the panel reads the
   * stage's own `latest_verdict` instead.
   */
  critic?: WorkstationStage | null;
  onClose: () => void;
  onChanged: () => void;
  /** Open the binary preview drawer at page level. */
  onOpenPreview: (assetId: string, title?: string) => void;
}

const ROLE_LABEL: Record<PipelineRole, string> = {
  input: 'Input',
  author: 'Author',
  designer: 'Designer',
  critic: 'Critic',
  artist: 'Artist',
  editor: 'Editor',
  publisher: 'Publisher',
  analyst: 'Analyst',
};

const VERDICT_TOKEN: Record<PipelineVerdict, string> = {
  PASS: 'var(--accent-success)',
  REVISE: 'var(--accent-warning)',
  FAIL: 'var(--accent-danger)',
};

const TEXT_PREFIXES = new Set(['SCR', 'STB', 'BIB', 'PRO', 'REV', 'SPC', 'STA', 'SBL']);

function isTextFileType(file_type: string | undefined): boolean {
  if (!file_type) return false;
  const code = file_type.split('-')[0]?.toUpperCase() ?? '';
  return TEXT_PREFIXES.has(code);
}

function VerdictChip({ verdict }: { verdict: PipelineVerdict }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
      style={{
        color: VERDICT_TOKEN[verdict],
        background: `color-mix(in oklab, ${VERDICT_TOKEN[verdict]} 14%, transparent)`,
      }}
    >
      {verdict}
    </span>
  );
}

/** Pull the structured check lists out of a critic asset body, if present. */
interface CriticChecks {
  passed: string[];
  failed: string[];
}

function extractCriticChecks(body: string | null | undefined): CriticChecks | null {
  if (!body) return null;
  // Critic bodies append a trailing ```json``` block. Grab the LAST one.
  const matches = [...body.matchAll(/```json\s*([\s\S]*?)```/gi)];
  const last = matches[matches.length - 1]?.[1];
  if (!last) return null;
  try {
    const parsed = JSON.parse(last) as {
      passed_checks?: unknown;
      failed_checks?: unknown;
    };
    const toStrings = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))) : [];
    const passed = toStrings(parsed.passed_checks);
    const failed = toStrings(parsed.failed_checks);
    if (passed.length === 0 && failed.length === 0) return null;
    return { passed, failed };
  } catch {
    return null;
  }
}

function VerdictBlock({
  stageId,
  verdict,
  criticLabel,
}: {
  stageId: string | undefined;
  verdict: PipelineVerdict | undefined;
  criticLabel: string;
}) {
  const { data } = useSWR<{
    data: { content: string };
  }>(stageId ? `/api/assets/${stageId}/content` : null, fetcher);
  const checks = extractCriticChecks(data?.data.content);

  if (!verdict && !checks) return null;

  return (
    <div
      className="rounded-lg border border-glass px-3 py-2.5"
      style={{ background: 'var(--bg-elevated)' }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] uppercase tracking-wider text-text-muted">
          {criticLabel} verdict
        </span>
        {verdict && <VerdictChip verdict={verdict} />}
      </div>
      {checks && (
        <div className="space-y-1 mt-2">
          {checks.failed.length > 0 && (
            <ul className="space-y-0.5">
              {checks.failed.map((c, i) => (
                <li
                  key={`f-${i}`}
                  className="text-[12px] flex items-start gap-1.5"
                  style={{ color: 'var(--accent-danger)' }}
                >
                  <span aria-hidden>✗</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}
          {checks.passed.length > 0 && (
            <ul className="space-y-0.5">
              {checks.passed.map((c, i) => (
                <li
                  key={`p-${i}`}
                  className="text-[12px] flex items-start gap-1.5 text-text-secondary"
                >
                  <span aria-hidden style={{ color: 'var(--accent-success)' }}>
                    ✓
                  </span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TextArtifactPreview({ assetId }: { assetId: string }) {
  const { data, error } = useSWR<{
    data: { content: string; asset: { filename: string } };
  }>(`/api/assets/${assetId}/content`, fetcher);

  if (error) {
    return (
      <p className="text-[12px] text-text-muted italic">
        Preview unavailable (binary asset — use Preview button).
      </p>
    );
  }
  if (!data) {
    return <p className="text-[12px] text-text-muted italic">Loading artifact…</p>;
  }
  return (
    <details
      open
      className="rounded-lg border border-glass px-3 py-2.5"
      style={{ background: 'var(--bg-elevated)' }}
    >
      <summary className="text-[11px] uppercase tracking-wider text-text-muted cursor-pointer mb-1">
        {data.data.asset.filename}
      </summary>
      <div className="markdown-body mt-2 max-h-[40vh] overflow-auto">
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h1 className="text-sm font-semibold mt-1 mb-1.5 text-text-primary">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-[13px] font-semibold mt-2 mb-1 text-text-primary uppercase tracking-wider">
                {children}
              </h2>
            ),
            p: ({ children }) => <p className="mb-1.5 text-text-secondary text-[12px]">{children}</p>,
            ul: ({ children }) => <ul className="list-disc ml-4 mb-1.5 space-y-0.5">{children}</ul>,
            li: ({ children }) => <li className="text-text-secondary text-[12px]">{children}</li>,
            code: ({ children }) => (
              <code className="text-[11px] font-mono text-text-muted">{children}</code>
            ),
          }}
        >
          {data.data.content}
        </ReactMarkdown>
      </div>
    </details>
  );
}

/**
 * Пустая станция музыки: две кнопки Директора вместо «нет изделия».
 *
 * Загрузка идёт роутом уровня ЭПИЗОДА (строки `AUD-music` ещё нет), «Без
 * музыки» — существующим идемпотентным `skip-music`. Ни одна из них не заводит
 * новой механики: первая зовёт `ingestUploadedMusic`, вторая — тот же роут, что
 * и раньше висел только в плеере.
 */
function MusicStationEmpty({
  episodeId,
  onChanged,
}: {
  episodeId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSkip(): Promise<void> {
    if (typeof window !== 'undefined') {
      const ok = window.confirm('Собрать эпизод БЕЗ музыки? Конвейер поедет дальше молча.');
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/skip-music`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directorConfirm: true }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Не вышло отметить «без музыки»');
      }
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-text-muted italic">
        Трека пока нет. Музыку кладёт Директор — композитор её не сочиняет.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <MusicUploadButton
          url={`/api/episodes/${episodeId}/upload-music`}
          onDone={onChanged}
          label="Загрузить трек"
          disabled={busy}
        />
        <Button variant="ghost" size="sm" onClick={() => void handleSkip()} disabled={busy}>
          <VolumeX size={14} /> Без музыки
        </Button>
      </div>
      <p className="text-[11px] text-text-muted">
        Загруженный трек сразу утверждается, попадает в таймлайн аниматика и в финальный кат.
        Фейды выставляются ползунками в плеере аниматика.
      </p>
      {error && (
        <span className="text-[11px]" style={{ color: 'var(--accent-danger)' }}>
          {error}
        </span>
      )}
    </div>
  );
}

export function StageWorkspacePanel({
  episodeId,
  stage,
  critic,
  onClose,
  onChanged,
  onOpenPreview,
}: StageWorkspacePanelProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [retriggerOpen, setRetriggerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [providerHint, setProviderHint] = useState(false);
  const [criticBlock, setCriticBlock] = useState<{
    body: AssetDecisionBody;
    failures: readonly CriticFailure[];
  } | null>(null);

  const producerAgent = stage.agents.find((a) => a !== 'Director') ?? null;
  const isBinary = !isTextFileType(stage.latest_asset_type);
  const hasAsset = Boolean(stage.latest_asset_id);
  const canApprove = (stage.assets_in_review ?? 0) > 0 && hasAsset;
  const canRetrigger =
    producerAgent !== null && (stage.state !== 'running' || hasAsset) && !stage.unstaffed;
  const canEdit = hasAsset && !isBinary;
  const isArtist = stage.role === 'artist';

  // Verdict source: a Critic stage uses its own verdict; a PRIMARY Artist/Author
  // surfaces the verdict of the Critic that gates it (q10a).
  const verdictStageId =
    stage.role === 'critic' ? stage.latest_asset_id : critic?.latest_asset_id;
  const verdict = stage.role === 'critic' ? stage.latest_verdict : critic?.latest_verdict;
  const criticLabel =
    stage.role === 'critic' ? stage.label : (critic?.label ?? 'Critic');

  async function approveAll(
    body: AssetDecisionBody = {
      decision: 'APPROVE',
      note: `Approved from ${stage.label} workstation`,
      preview_acknowledged: true,
    },
  ) {
    if (busy || !stage.latest_asset_id) return;
    setBusy(true);
    try {
      await postAssetDecision(stage.latest_asset_id, body);
      setCriticBlock(null);
      onChanged();
    } catch (err) {
      // A frozen critic verdict gets the dialog with the critic's own words —
      // an `alert()` with a wall of text is not a decision surface.
      if (err instanceof CriticVerdictBlockedError) {
        setCriticBlock({ body, failures: err.failures });
        return;
      }
      alert(`Approve failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {stage.emoji && <span className="text-sm">{stage.emoji}</span>}
            <span className="text-sm font-semibold text-text-primary">{stage.label}</span>
            {stage.role && (
              <span className="text-[10px] uppercase tracking-wider text-text-muted px-1.5 py-0.5 rounded border border-glass">
                {ROLE_LABEL[stage.role]}
              </span>
            )}
            {stage.role === 'critic' && stage.latest_verdict && (
              <VerdictChip verdict={stage.latest_verdict} />
            )}
          </div>
          {stage.subtitle && (
            <div className="text-[11px] text-text-muted mt-0.5">{stage.subtitle}</div>
          )}
          {producerAgent && (
            <div className="text-[11px] text-text-secondary mt-0.5">
              {agentDisplayName(producerAgent)}{' '}
              <span className="text-text-muted">({producerAgent})</span>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-text-secondary hover:bg-[var(--panel-hover-bg)] hover:text-text-primary"
          aria-label="Close workstation"
          title="Close workstation"
        >
          <X size={14} />
        </button>
      </div>

      {/* Unstaffed honest empty slot */}
      {stage.unstaffed && (
        <div
          className="rounded-lg border border-glass px-3 py-3 text-[12px] text-text-muted italic"
          style={{ background: 'var(--bg-elevated)' }}
        >
          This Critic role is acknowledged in the pipeline but{' '}
          <span className="text-text-secondary not-italic font-medium">not staffed yet</span> — no
          agent runs here. The Output-Critic for this artifact lands in a later sprint.
        </div>
      )}

      {/* Artifact preview */}
      {!stage.unstaffed && hasAsset && !isBinary && (
        <TextArtifactPreview assetId={stage.latest_asset_id!} />
      )}
      {!stage.unstaffed && hasAsset && isBinary && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onOpenPreview(stage.latest_asset_id!, `${stage.label} preview`)}
        >
          <Eye size={14} /> Open artifact preview
        </Button>
      )}
      {!stage.unstaffed && !hasAsset && stage.id !== 'music_generator' && (
        <p className="text-[12px] text-text-muted italic">
          No artifact produced yet for this stage.
        </p>
      )}
      {/* Станция музыки — вход Директора, а не агента: композитор возвращает
          mock, реальный трек всегда приходит загрузкой. Пока строки `AUD-music`
          нет, обе кнопки жили в превью ассета, которого не существует — станция
          показывала «нет изделия» и не предлагала ничего (прогон E06, 10.08). */}
      {!stage.unstaffed && !hasAsset && stage.id === 'music_generator' && (
        <MusicStationEmpty episodeId={episodeId} onChanged={onChanged} />
      )}

      {/* Critic verdict block (q10a — also shown inside the Artist's workstation) */}
      {!stage.unstaffed && (verdict || verdictStageId) && (
        <VerdictBlock stageId={verdictStageId} verdict={verdict} criticLabel={criticLabel} />
      )}

      {/* Actions */}
      {!stage.unstaffed && (
        <div className="flex flex-wrap gap-2 pt-1">
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={() => setEditorOpen(true)} disabled={busy}>
              <Pencil size={14} /> {stage.state === 'approved' ? 'View source' : 'Edit'}
            </Button>
          )}
          {canRetrigger && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRetriggerOpen(true)}
              disabled={busy}
            >
              <RotateCcw size={14} /> Retrigger
            </Button>
          )}
          {canApprove && (
            <Button variant="primary" size="sm" onClick={() => void approveAll()} disabled={busy}>
              <CheckCheck size={14} /> Approve
            </Button>
          )}
          {isArtist && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setProviderHint((v) => !v)}
              disabled={busy}
              title="Provider re-routing flow lands in Phase 8"
            >
              <Shuffle size={14} /> Change provider
            </Button>
          )}
        </div>
      )}
      {providerHint && (
        <p className="text-[11px] text-text-muted italic">
          Per-stage provider override is a Phase 8 surface — see provider_strategy.md §4.2.
        </p>
      )}

      <EditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        assetId={stage.latest_asset_id ?? null}
        assetFilename={undefined}
        onSaved={onChanged}
      />

      {producerAgent && (
        <RetriggerStageModal
          open={retriggerOpen}
          onClose={() => setRetriggerOpen(false)}
          episodeId={episodeId}
          stageLabel={stage.label}
          producerAgent={producerAgent}
          onTriggered={onChanged}
        />
      )}

      <CriticVerdictOverrideModal
        open={criticBlock !== null}
        subjectLabel={stage.label}
        failures={criticBlock?.failures ?? []}
        onCancel={() => setCriticBlock(null)}
        onOverride={async () => {
          if (!criticBlock) return;
          await approveAll(withCriticOverride(criticBlock.body));
        }}
      />
    </div>
  );
}
