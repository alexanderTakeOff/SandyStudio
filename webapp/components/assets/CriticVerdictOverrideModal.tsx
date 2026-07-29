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
// SHORT BY CONSTRUCTION (Director, 2026-07-29): the first pass poured the whole
// verdict onto the screen — up to three complaints at 600 chars each. Nobody
// reads a wall at decision time. What the human needs is WHO objected and WHAT
// in one line; the full text lives one disclosure away. If the dialog cannot be
// read in two seconds it is too long.
//
// Presentational only: the parent owns the re-POST (same pattern as
// InboxNotePromptModal), so the override rides the SAME body the Director
// already submitted, plus `eref_options.override_critic_verdict: true` — which
// the route records in the `approval_granted` event metadata.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
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

/** The one-line version of a verdict: its worst complaint, clamped. */
const HEADLINE_MAX = 90;

function headline(detail: string): string {
  // The route joins complaints worst-first with ' · ' — the first is the one
  // that matters; the rest are behind the disclosure.
  const first = detail.split(' · ')[0]?.replace(/^(CRITICAL|MAJOR|MINOR):\s*/i, '').trim() ?? '';
  if (first.length <= HEADLINE_MAX) return first;
  return `${first.slice(0, HEADLINE_MAX).trimEnd()}…`;
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
    <Modal open={open} onClose={onCancel} title="Critic says no" size="md">
      <div className="space-y-4">
        {subjectLabel && (
          <p className="text-sm font-mono text-text-muted truncate" title={subjectLabel}>
            {subjectLabel}
          </p>
        )}

        <ul className="space-y-2">
          {failures.map((f, i) => (
            <li key={`${f.critic}-${i}`}>
              <div>
                <span className="font-semibold text-text-primary">{f.critic}</span>
                <span style={{ color: 'var(--accent-danger)' }}> — {f.verdict}</span>
              </div>
              {f.detail && (
                <>
                  <p className="text-text-secondary">{headline(f.detail)}</p>
                  {f.detail.length > HEADLINE_MAX && (
                    <details className="mt-1">
                      <summary className="text-sm text-text-muted cursor-pointer">
                        Подробнее
                      </summary>
                      <p className="text-sm text-text-secondary mt-1">{f.detail}</p>
                    </details>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>

        <label className="flex items-center gap-2.5 cursor-pointer text-text-secondary">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent-danger)]"
            checked={acknowledged}
            disabled={pending}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <span>Ship it anyway. Logged.</span>
        </label>

        {error && <p style={{ color: 'var(--accent-danger)' }}>{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="primary" onClick={onCancel} disabled={pending}>
            Regenerate instead
          </Button>
          <Button
            variant="danger"
            onClick={override}
            disabled={pending || !acknowledged}
            title={acknowledged ? 'Approve over the verdict' : 'Tick the box first'}
          >
            {pending ? 'Approving…' : 'Approve anyway'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
