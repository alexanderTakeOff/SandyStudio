// ──────────────────────────────────────────────────────────────────────────────
// components/pipeline/StageKebabMenu.tsx
// Hover-revealed kebab control for each pipeline stage row in
// `(studio)/episodes/[id]/page.tsx`. Wires four actions:
//
//   - Approve all in stage          → POST /api/assets/[id]/approve  (per asset)
//   - Reject + revise (latest)      → RejectModal → REQUEST_REVISION decision
//   - Edit (latest text asset)      → EditorModal (CodeMirror 6)
//   - Re-trigger this stage         → POST /api/episodes/[id]/trigger (per agent)
//
// Phase 8 will add a fifth section "Provider › […]" to the same kebab when
// per-stage `stage_provider_overrides` lands (see provider_strategy.md §4.2).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import {
  MoreHorizontal,
  CheckCheck,
  RotateCcw,
  Pencil,
  XCircle,
} from 'lucide-react';
import { DropdownMenu, type DropdownEntry } from '@/components/ui/DropdownMenu';
import { EditorModal } from '@/components/editor/EditorModal';
import { RejectModal } from '@/components/editor/RejectModal';
import type { PipelineNodeState, PipelineStageId } from '@/lib/api/pipeline-stages';

// File-type prefix → stage matching, kept in sync with the same map in
// `(studio)/episodes/[id]/page.tsx`. Phase 5d follow-up will deduplicate
// these into `lib/api/pipeline-stages.ts`.
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

interface AssetLite {
  id: string;
  filename: string;
  file_type: string;
  status: string;
}

export interface StageKebabMenuProps {
  episodeId: string;
  stageId: PipelineStageId;
  stageLabel: string;
  stageAgents: string[];
  /** Current stage state — drives which kebab items are shown. */
  stageState: PipelineNodeState;
  latestAssetId?: string;
  onChanged: () => void;
}

export function StageKebabMenu({
  episodeId,
  stageId,
  stageLabel,
  stageAgents,
  stageState,
  latestAssetId,
  onChanged,
}: StageKebabMenuProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editorAssetId, setEditorAssetId] = useState<string | null>(null);
  const [editorAssetFilename, setEditorAssetFilename] = useState<string | undefined>();

  async function fetchStageAssets(): Promise<AssetLite[]> {
    const res = await fetch(`/api/assets?episode_id=${episodeId}&limit=200`);
    if (!res.ok) return [];
    const j = (await res.json()) as { data: AssetLite[] };
    const prefixes = STAGE_PREFIX_MAP[stageId] ?? [];
    return j.data.filter((a) =>
      prefixes.some((p) => a.file_type?.startsWith(p)),
    );
  }

  async function approveAll() {
    if (busy) return;
    setBusy(true);
    try {
      const assets = await fetchStageAssets();
      const candidates = assets.filter((a) => a.status === 'REVIEW');
      if (candidates.length === 0) {
        alert(`Nothing to approve in ${stageLabel} — no REVIEW assets.`);
        return;
      }
      const results = await Promise.allSettled(
        candidates.map((a) =>
          fetch(`/api/assets/${a.id}/approve`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              decision: 'APPROVE',
              note: `Bulk approve from ${stageLabel} kebab`,
              // Visual assets (IMG/VID) require preview_acknowledged — bulk
              // approve sets it true since the Director's intent is explicit.
              preview_acknowledged: true,
            }),
          }).then(async (r) => {
            if (!r.ok) {
              const j = await r.json().catch(() => ({}));
              throw new Error((j as { error?: string }).error ?? `${r.status}`);
            }
            return a.id;
          }),
        ),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      onChanged();
      if (fail > 0) {
        const firstErr = (results.find((r) => r.status === 'rejected') as
          | PromiseRejectedResult
          | undefined)?.reason as Error | undefined;
        alert(
          `Approved ${ok} of ${results.length} in ${stageLabel}. ${fail} failed${
            firstErr ? `: ${firstErr.message}` : '.'
          }`,
        );
      }
    } catch (err) {
      alert(`Approve all failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function retriggerStage() {
    if (busy) return;
    if (stageAgents.length === 0 || stageAgents.includes('Director')) {
      alert(`${stageLabel} has no agents to re-trigger.`);
      return;
    }
    const reason = prompt(
      `Re-trigger ${stageAgents.join(', ')} for ${stageLabel}?\n\nReason (required, audit log):`,
      '',
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      alert('Reason must be at least 3 characters.');
      return;
    }
    if (
      !confirm(
        `This will fire ${stageAgents.length} agent(s) and may produce duplicate assets. Continue?`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const results = await Promise.allSettled(
        stageAgents.map((agent) =>
          fetch(`/api/episodes/${episodeId}/trigger`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ agentCode: agent, reason: reason.trim() }),
          }).then(async (r) => {
            if (!r.ok) {
              const j = await r.json().catch(() => ({}));
              throw new Error((j as { error?: string }).error ?? `${r.status}`);
            }
          }),
        ),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      onChanged();
      if (fail > 0) {
        alert(`Triggered ${ok} of ${stageAgents.length}. ${fail} failed.`);
      }
    } finally {
      setBusy(false);
    }
  }

  function openEditor() {
    if (!latestAssetId) {
      alert(`No asset in ${stageLabel} to edit.`);
      return;
    }
    // Don't pre-fetch metadata — EditorModal fetches /content which already
    // returns filename + status + content in one round-trip. Binary assets
    // get a clean error from that endpoint and EditorModal renders it.
    setEditorAssetId(latestAssetId);
    setEditorAssetFilename(undefined);
    setEditorOpen(true);
  }

  function openReject() {
    if (!latestAssetId) {
      alert(`No asset in ${stageLabel} to reject.`);
      return;
    }
    setRejectOpen(true);
  }

  const items: DropdownEntry[] = [
    {
      label: 'Approve all in stage',
      icon: <CheckCheck size={14} />,
      onSelect: approveAll,
      disabled: busy,
    },
    {
      label: 'Reject + revise',
      icon: <XCircle size={14} />,
      onSelect: openReject,
      destructive: true,
      disabled: busy || !latestAssetId,
    },
    {
      label: 'Edit',
      icon: <Pencil size={14} />,
      onSelect: openEditor,
      disabled: busy || !latestAssetId,
    },
    { separator: true },
    {
      label: 'Re-trigger this stage',
      icon: <RotateCcw size={14} />,
      onSelect: retriggerStage,
      disabled: busy || stageAgents.length === 0 || stageAgents.includes('Director'),
    },
  ];

  return (
    <>
      <span
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu
          trigger={
            <span
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-text-secondary hover:bg-[var(--panel-hover-bg)] hover:text-text-primary transition-colors"
              aria-hidden
            >
              <MoreHorizontal size={14} strokeWidth={1.7} />
            </span>
          }
          items={items}
          ariaLabel={`Actions for ${stageLabel}`}
        />
      </span>

      <EditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        assetId={editorAssetId}
        assetFilename={editorAssetFilename}
        onSaved={onChanged}
      />

      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        assetId={latestAssetId ?? null}
        assetFilename={undefined}
        onRejected={onChanged}
      />
    </>
  );
}
