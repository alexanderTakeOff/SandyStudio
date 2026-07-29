// ──────────────────────────────────────────────────────────────────────────────
// components/assets/CriticVerdictOverrideModal.tsx
// The visible exit from the critic-verdict gate (E33 audit, 2026-07-29).
//
// It opens ONLY after the approve route has already refused, and it shows what
// the critic actually said — "lighting is daytime", not "error 400". From there
// the Director has two honest moves: go back and regenerate (the default, and
// the only one reachable with one click), or knowingly ship over the verdict —
// which needs a deliberate second act (tick the acknowledgement) before the
// override button turns on. A bypass that is one careless click from the normal
// Approve is worse than no bypass at all.
//
// Presentational only: the parent owns the re-POST (same pattern as
// InboxNotePromptModal), so the override rides the SAME body the Director
// already submitted, plus `eref_options.override_critic_verdict: true` — which
// the route records in the `approval_granted` event metadata.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { CriticFailure } from '@/lib/api/asset-decision';

export interface CriticVerdictOverrideModalProps {
  open: boolean;
  /** What is being approved — usually the asset filename. */
  subjectLabel?: string;
  failures: readonly CriticFailure[];
  /** Close without approving — the default, recommended path. */
  onCancel: () => void;
  /** Re-send the same decision with the override flag. May throw. */
  onOverride: () => Promise<void> | void;
}

export function CriticVerdictOverrideModal({
  open,
  subjectLabel,
  failures,
  onCancel,
  onOverride,
}: CriticVerdictOverrideModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every open starts from an un-ticked acknowledgement — a stale tick would
  // turn the second act back into one click.
  useEffect(() => {
    if (!open) {
      setAcknowledged(false);
      setPending(false);
      setError(null);
    }
  }, [open]);

  async function override() {
    if (!acknowledged) return;
    setPending(true);
    setError(null);
    try {
      await onOverride();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={
        subjectLabel
          ? `Critic is holding this asset · ${subjectLabel}`
          : 'Critic is holding this asset'
      }
      size="md"
    >
      <div className="space-y-4">
        <p className="text-xs text-text-secondary leading-relaxed">
          Approval was refused because this asset&apos;s own critic said it should not
          ship. The normal move is to send it back and regenerate.
        </p>

        <ul className="space-y-2">
          {failures.map((f, i) => (
            <li
              key={`${f.critic}-${i}`}
              className="rounded-lg border px-3 py-2.5"
              style={{
                background: 'color-mix(in oklab, var(--accent-danger) 8%, transparent)',
                borderColor: 'color-mix(in oklab, var(--accent-danger) 35%, transparent)',
              }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <AlertTriangle
                  size={12}
                  className="shrink-0"
                  style={{ color: 'var(--accent-danger)' }}
                />
                <span className="text-xs font-medium text-text-primary">{f.critic}</span>
                <span
                  className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    background: 'color-mix(in oklab, var(--accent-danger) 18%, transparent)',
                    color: 'var(--accent-danger)',
                  }}
                >
                  {f.verdict}
                </span>
              </div>
              {f.detail && (
                <p className="text-xs text-text-secondary leading-relaxed mt-1.5">
                  “{f.detail}”
                </p>
              )}
            </li>
          ))}
        </ul>

        <label className="flex items-start gap-2 cursor-pointer text-xs text-text-secondary leading-relaxed">
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-[var(--accent-danger)]"
            checked={acknowledged}
            disabled={pending}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <span>
            I have read the verdict and am approving over it. The override is written
            to the approval audit trail.
          </span>
        </label>

        {error && (
          <p className="text-xs" style={{ color: 'var(--accent-danger)' }}>
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="primary" onClick={onCancel} disabled={pending}>
            Back — regenerate instead
          </Button>
          <Button
            variant="danger"
            onClick={override}
            disabled={pending || !acknowledged}
            title={
              acknowledged
                ? 'Approve this asset over its critic verdict'
                : 'Tick the acknowledgement first'
            }
          >
            {pending ? 'Approving…' : 'Approve over the verdict'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
