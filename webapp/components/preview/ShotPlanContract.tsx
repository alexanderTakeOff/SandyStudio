// ──────────────────────────────────────────────────────────────────────────────
// components/preview/ShotPlanContract.tsx
//
// TD-84 — the Animator Shot Plan rendered as a pre-video CONTRACT PAGE rather
// than raw markdown. Before this, an SPC-shot_plan opened in the drawer as a
// `TextBody` markdown dump: the Director could not read the fields the runner
// actually executes (prompt / provider / quality / resolution / seed / anchors)
// nor edit them, even though video generation is now plan-driven. This surfaces
// those fields, lets the Director edit them while the plan is editable
// (DRAFT/REVIEW/REVISION → PUT /content), and fires generation FROM the plan
// (canonical /trigger path, provider taken from the plan — not a stray UI
// dropdown). Approval stays on the shared PilotApproveButtons in AssetPreview.
//
// Reads/writes the json contract through the single parser/serializer in
// lib/api/shot-plan-contract.ts (same fields the runner reads), so the UI and
// the runner never drift.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Sparkles, Save, RotateCcw } from 'lucide-react';
import { fetcher } from '@/lib/swr';
import {
  parseShotPlanContract,
  serializeShotPlanContract,
  type ShotPlanPatch,
  type QualityTier,
  type Resolution,
} from '@/lib/api/shot-plan-contract';

interface ShotPlanContractProps {
  assetId: string;
  status: string;
  episodeId: string | null;
  /** Canonical shot_id this plan drives — from metadata or the file_type suffix. */
  shotId: string | null;
  /** Invalidate parent SWR caches after a save / generate. */
  onChanged: () => void;
}

const EDITABLE = new Set(['DRAFT', 'REVIEW', 'REVISION']);

export function ShotPlanContract({
  assetId,
  status,
  episodeId,
  shotId,
  onChanged,
}: ShotPlanContractProps) {
  const { data, mutate } = useSWR<{
    data: { content: string; editable: boolean };
  }>(`/api/assets/${assetId}/content`, fetcher);

  const content = data?.data.content ?? '';
  const editable = (data?.data.editable ?? false) && EDITABLE.has(status);
  const contract = useMemo(() => parseShotPlanContract(content), [content]);

  // Local edit buffer — seeded from the parsed contract, re-seeded when the
  // underlying content changes (parent refetch after save / version switch).
  const [draft, setDraft] = useState<ShotPlanPatch>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'generate'>(null);
  const [error, setError] = useState<string | null>(null);
  const [genOk, setGenOk] = useState(false);

  useEffect(() => {
    setDraft({});
    setDirty(false);
  }, [content]);

  function field<K extends keyof ShotPlanPatch>(key: K): ShotPlanPatch[K] | undefined {
    return draft[key];
  }
  function setField<K extends keyof ShotPlanPatch>(key: K, value: ShotPlanPatch[K]): void {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  }

  // Effective display value = pending edit if present, else parsed contract.
  const promptVal = field('prompt') ?? contract.prompt ?? '';
  const providerVal = field('providerId') ?? contract.providerId ?? '';
  const qualityVal = (field('qualityTier') ?? contract.qualityTier ?? '') as string;
  const resolutionVal = (field('resolution') ?? contract.resolution ?? '') as string;
  const durationVal = field('durationSeconds') ?? contract.durationSeconds ?? '';
  const seedVal = field('seed') ?? contract.seed ?? '';

  async function save(): Promise<void> {
    setBusy('save');
    setError(null);
    try {
      const next = serializeShotPlanContract(content, draft);
      const res = await fetch(`/api/assets/${assetId}/content`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: next }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? 'Save failed');
      }
      await mutate();
      onChanged();
      setDirty(false);
      setDraft({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function generateFromPlan(): Promise<void> {
    if (!episodeId || !shotId) return;
    setBusy('generate');
    setError(null);
    setGenOk(false);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/trigger`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentCode: 'EXEC-VGEN',
          // /trigger requires a non-empty reason (z.string().min(3)).
          reason: 'Director: generate video from approved shot plan',
          payload: { shotId, planAssetId: assetId },
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? 'Generation trigger failed');
      }
      setGenOk(true);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return <p className="text-sm text-text-secondary">Loading plan…</p>;
  }
  if (contract.error) {
    return (
      <div
        className="text-[12px] px-3 py-2 rounded-lg"
        style={{ color: 'var(--accent-warning)', background: 'color-mix(in oklab, var(--accent-warning) 8%, transparent)' }}
      >
        Plan is not a structured contract: {contract.error} Showing nothing to edit —
        open the raw asset if you need the markdown.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* PROMPT — the main field. */}
      <Section label="Prompt">
        {editable ? (
          <textarea
            value={promptVal}
            onChange={(e) => setField('prompt', e.target.value)}
            rows={6}
            className="w-full rounded-md px-2.5 py-2 text-[13px] leading-relaxed bg-[var(--bg-elevated)] border border-glass text-text-primary focus:outline-none focus:border-[var(--accent-primary)] resize-y"
          />
        ) : (
          <p className="text-[13px] leading-relaxed text-text-primary whitespace-pre-wrap">
            {contract.prompt ?? <span className="text-text-muted">— no prompt —</span>}
          </p>
        )}
      </Section>

      {/* SETTINGS — provider/quality/resolution/duration/seed + read-only anchors. */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Provider">
          {editable ? (
            <input
              value={providerVal}
              onChange={(e) => setField('providerId', e.target.value)}
              placeholder="seedance-with-end-image"
              className="settings-input"
            />
          ) : (
            <Val>{contract.providerId}</Val>
          )}
        </Field>
        <Field label="Quality">
          {editable ? (
            <select
              value={qualityVal}
              onChange={(e) => setField('qualityTier', (e.target.value || undefined) as QualityTier | undefined)}
              className="settings-input"
            >
              <option value="">—</option>
              <option value="fast">fast</option>
              <option value="standard">standard</option>
            </select>
          ) : (
            <Val>{contract.qualityTier}</Val>
          )}
        </Field>
        <Field label="Resolution">
          {editable ? (
            <select
              value={resolutionVal}
              onChange={(e) => setField('resolution', (e.target.value || undefined) as Resolution | undefined)}
              className="settings-input"
            >
              <option value="">—</option>
              <option value="480p">480p</option>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          ) : (
            <Val>{contract.resolution}</Val>
          )}
        </Field>
        <Field label="Duration (s)">
          {editable ? (
            <input
              type="number"
              min={1}
              max={10}
              step={0.5}
              value={durationVal}
              onChange={(e) =>
                setField('durationSeconds', e.target.value === '' ? undefined : Number(e.target.value))
              }
              className="settings-input"
            />
          ) : (
            <Val>{contract.durationSeconds}</Val>
          )}
        </Field>
        <Field label="Seed">
          {editable ? (
            <input
              type="number"
              value={seedVal}
              onChange={(e) =>
                setField('seed', e.target.value === '' ? null : Number(e.target.value))
              }
              placeholder="—"
              className="settings-input"
            />
          ) : (
            <Val>{contract.seed}</Val>
          )}
        </Field>
        <Field label="Anchors">
          <Val>
            {contract.startAnchorAssetId || contract.endAnchorAssetId
              ? `${contract.startAnchorAssetId ? 'start' : ''}${contract.startAnchorAssetId && contract.endAnchorAssetId ? ' + ' : ''}${contract.endAnchorAssetId ? 'end' : ''}`
              : null}
          </Val>
        </Field>
      </div>

      {/* Save row — only while editable. */}
      {editable && (
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={!dirty || busy !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors disabled:opacity-50"
            style={{
              background: 'color-mix(in oklab, var(--accent-primary) 14%, transparent)',
              color: 'var(--accent-primary)',
              borderColor: 'color-mix(in oklab, var(--accent-primary) 35%, transparent)',
            }}
          >
            {busy === 'save' ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {busy === 'save' ? 'Saving…' : 'Save plan'}
          </button>
          {dirty && (
            <button
              onClick={() => {
                setDraft({});
                setDirty(false);
              }}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[12px] text-text-secondary hover:text-text-primary disabled:opacity-50"
            >
              <RotateCcw size={12} /> Reset
            </button>
          )}
        </div>
      )}

      {/* Video placeholder — reserves height (TD-84). The actual VID-shot lives
          in the timeline; this is the contract's "what this produces" slot. */}
      <div
        className="rounded-md border border-dashed flex items-center justify-center text-[11px] text-text-muted"
        style={{ height: 120, borderColor: 'var(--border-glass)', background: 'var(--bg-elevated)' }}
      >
        {genOk
          ? 'Generation queued — the video appears in the timeline once rendered.'
          : 'Video for this shot renders from this plan and appears in the timeline.'}
      </div>

      {/* Generate from plan — canonical path, provider from the plan, NOT a UI
          dropdown. Only meaningful once the plan is APPROVED (the runner refuses
          a non-APPROVED plan). */}
      {status === 'APPROVED' && shotId && episodeId && (
        <button
          onClick={generateFromPlan}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors disabled:opacity-50"
          style={{
            background: 'color-mix(in oklab, var(--accent-success) 14%, transparent)',
            color: 'var(--accent-success)',
            borderColor: 'color-mix(in oklab, var(--accent-success) 35%, transparent)',
          }}
          title="Generate the video from this approved plan (provider taken from the plan)"
        >
          {busy === 'generate' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {busy === 'generate' ? 'Triggering…' : 'Generate from plan'}
        </button>
      )}
      {status !== 'APPROVED' && (
        <p className="text-[11px] text-text-muted">
          Approve this plan to generate the shot (or it auto-generates on approval).
        </p>
      )}

      {error && (
        <div
          className="text-[12px] px-2.5 py-1.5 rounded-md"
          style={{ background: 'color-mix(in oklab, var(--accent-danger) 10%, transparent)', color: 'var(--accent-danger)' }}
        >
          {error}
        </div>
      )}

      <style jsx>{`
        :global(.settings-input) {
          width: 100%;
          border-radius: 0.375rem;
          padding: 0.3rem 0.5rem;
          font-size: 12px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-glass);
          color: var(--text-primary);
        }
        :global(.settings-input:focus) {
          outline: none;
          border-color: var(--accent-primary);
        }
      `}</style>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      {children}
    </div>
  );
}

function Val({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12px] font-mono text-text-primary">
      {children || <span className="text-text-muted">—</span>}
    </div>
  );
}
