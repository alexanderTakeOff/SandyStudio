// ──────────────────────────────────────────────────────────────────────────────
// components/canon/CanonExtensionsPanel.tsx
// Director's review surface for Bible Extension Proposals.
//
// Shows the parsed `proposed_canon_extensions[]` (or Continuity violations
// derived as proposals) with a per-row decision: Approve to Bible / Reject.
// On Approve: POST /api/series/[id]/bible/extensions creates SBL-* DRAFT
// rows in the series Bible Library.
//
// Renders inline in AssetPreview when the asset's content carries proposals.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useMemo, useState } from 'react';
import { Check, X, Sparkles, MapPin, Box, Palette, User } from 'lucide-react';
import type { CanonExtensionProposal } from '@/lib/api/canon-extensions';

interface Decision {
  decision: 'APPROVE' | 'REJECT';
  description?: string;
  rationale_note?: string;
}

interface CanonExtensionsPanelProps {
  proposals: readonly CanonExtensionProposal[];
  /** UUID of the canon_extension_proposed event to resolve. Required. */
  eventId: string;
  /** UUID of the series the extensions belong to. Required. */
  seriesId: string;
  /** Notify parent (e.g. AssetPreview) when all proposals dispositioned. */
  onResolved?: () => void;
}

const KIND_ICON = {
  character: User,
  location: MapPin,
  object: Box,
  style: Palette,
} as const;

const KIND_COLOR = {
  character: 'rgb(244, 114, 182)',
  location: 'rgb(96, 165, 250)',
  object: 'rgb(250, 204, 21)',
  style: 'rgb(167, 139, 250)',
} as const;

export function CanonExtensionsPanel({
  proposals,
  eventId,
  seriesId,
  onResolved,
}: CanonExtensionsPanelProps) {
  const [decisions, setDecisions] = useState<Record<number, Decision | null>>(() =>
    Object.fromEntries(proposals.map((_, i) => [i, null])),
  );
  const [editedDescriptions, setEditedDescriptions] = useState<Record<number, string>>(() =>
    Object.fromEntries(proposals.map((p, i) => [i, p.proposed_description])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  const allDecided = useMemo(
    () => proposals.every((_, i) => decisions[i] !== null && decisions[i] !== undefined),
    [decisions, proposals],
  );

  if (resolved) {
    return (
      <div
        className="px-4 py-3 rounded-lg border text-sm flex items-center gap-2"
        style={{
          background: 'var(--accent-success-bg, rgba(34, 197, 94, 0.08))',
          borderColor: 'var(--accent-success, rgba(34, 197, 94, 0.3))',
          color: 'var(--accent-success, rgb(34, 197, 94))',
        }}
      >
        <Check size={14} /> Extensions resolved. Open the Series Bible Library to add reference
        images and LOCK approved entries.
      </div>
    );
  }

  async function submit(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const payload = proposals.map((p, i) => {
        const d = decisions[i];
        if (!d) return null;
        return {
          name: p.name,
          kind: p.kind,
          decision: d.decision,
          description: editedDescriptions[i] ?? p.proposed_description,
          rationale_note: d.rationale_note,
        };
      }).filter(Boolean);

      const res = await fetch(`/api/series/${seriesId}/bible/extensions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, decisions: payload }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      setResolved(true);
      onResolved?.();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="px-3 py-3 rounded-lg border space-y-3"
      style={{
        background: 'var(--bg-elevated)',
        borderColor: 'var(--accent-warning, rgba(251, 146, 60, 0.4))',
      }}
    >
      <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--accent-warning, rgb(251, 146, 60))' }}>
        <Sparkles size={14} />
        Bible extension proposals — Director arbitration required
      </div>
      <p className="text-xs text-text-muted leading-relaxed">
        The agent surfaced {proposals.length} canonical asset{proposals.length === 1 ? '' : 's'} that
        do not yet exist in the LOCKED Series Bible. Approve to create a DRAFT in the Bible Library
        (then add reference image + LOCK), or reject so the agent rewrites the upstream asset
        without it.
      </p>

      <div className="space-y-2">
        {proposals.map((p, i) => {
          const Icon = KIND_ICON[p.kind] ?? Box;
          const color = KIND_COLOR[p.kind] ?? 'currentColor';
          const decision = decisions[i];
          return (
            <div
              key={`${p.kind}-${p.name}-${i}`}
              className="rounded-md border p-3 space-y-2"
              style={{
                borderColor: decision?.decision === 'APPROVE'
                  ? 'var(--accent-success, rgba(34,197,94,0.4))'
                  : decision?.decision === 'REJECT'
                  ? 'var(--accent-danger, rgba(239,68,68,0.4))'
                  : 'var(--border-glass)',
                background: 'var(--panel-glass-bg)',
              }}
            >
              <div className="flex items-center gap-2 text-sm">
                <Icon size={14} style={{ color }} />
                <span className="font-mono text-text-primary">{p.name}</span>
                <span className="text-text-muted text-[11px] uppercase tracking-wide">{p.kind}</span>
              </div>
              {p.rationale && (
                <div className="text-[11px] text-text-muted italic">Why: {p.rationale}</div>
              )}
              <textarea
                className="w-full text-xs rounded p-2 font-mono leading-relaxed"
                rows={3}
                placeholder="Description (Director can edit before approve)"
                style={{
                  background: 'var(--panel-hover-bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-glass)',
                }}
                value={editedDescriptions[i] ?? ''}
                onChange={(e) =>
                  setEditedDescriptions((m) => ({ ...m, [i]: e.target.value }))
                }
                disabled={!!decision}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDecisions((m) => ({ ...m, [i]: { decision: 'APPROVE' } }))}
                  className="text-xs px-2 py-1 rounded-md inline-flex items-center gap-1"
                  style={{
                    background: decision?.decision === 'APPROVE'
                      ? 'var(--accent-success, rgba(34,197,94,0.2))'
                      : 'var(--panel-hover-bg)',
                    color: decision?.decision === 'APPROVE'
                      ? 'var(--accent-success, rgb(34,197,94))'
                      : 'var(--text-secondary)',
                  }}
                >
                  <Check size={11} /> Approve to Bible
                </button>
                <button
                  type="button"
                  onClick={() => setDecisions((m) => ({ ...m, [i]: { decision: 'REJECT' } }))}
                  className="text-xs px-2 py-1 rounded-md inline-flex items-center gap-1"
                  style={{
                    background: decision?.decision === 'REJECT'
                      ? 'var(--accent-danger, rgba(239,68,68,0.2))'
                      : 'var(--panel-hover-bg)',
                    color: decision?.decision === 'REJECT'
                      ? 'var(--accent-danger, rgb(239,68,68))'
                      : 'var(--text-secondary)',
                  }}
                >
                  <X size={11} /> Reject
                </button>
                {decision && (
                  <button
                    type="button"
                    onClick={() => setDecisions((m) => ({ ...m, [i]: null }))}
                    className="text-xs px-2 py-1 rounded-md text-text-muted hover:text-text-primary"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="text-xs text-[color:var(--accent-danger,rgb(239,68,68))]">{error}</div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!allDecided || submitting}
          className="text-sm px-3 py-1.5 rounded-md disabled:opacity-50"
          style={{
            background: 'var(--accent-primary, rgb(99, 102, 241))',
            color: 'white',
          }}
        >
          {submitting ? 'Submitting…' : `Submit ${proposals.length} decision${proposals.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
