// ──────────────────────────────────────────────────────────────────────────────
// components/inbox/InboxNotePromptModal.tsx
// Modal that asks the Director for a note when a REJECT or REQUEST_REVISION
// decision is taken from the Inbox surfaces (Inbox page, Dashboard preview).
//
// Replaces the prior `window.prompt('Note for ...')` flow which throws
// "prompt() is not supported" in Next.js dev (and most modern sandboxed
// browser contexts) — that's what made the REJECT button appear dead.
//
// Reusable: parent supplies the `decision` and an `onSubmit(note)` handler.
// The handler does the actual fetch — this modal stays purely presentational.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export type InboxNoteDecision = 'REQUEST_REVISION' | 'REJECT';

interface InboxNotePromptModalProps {
  open: boolean;
  decision: InboxNoteDecision;
  /** Title context — usually the asset filename or item title. */
  subjectLabel?: string;
  onClose: () => void;
  onSubmit: (note: string) => Promise<void> | void;
}

const MIN_NOTE_LEN = 3;

const TITLES: Record<InboxNoteDecision, string> = {
  REQUEST_REVISION: 'Request revision',
  REJECT: 'Reject',
};

const PLACEHOLDERS: Record<InboxNoteDecision, string> = {
  REQUEST_REVISION: 'e.g. Tone is too dramatic — keep it light and physical',
  REJECT: 'e.g. Old test artefact, no longer needed',
};

export function InboxNotePromptModal({
  open,
  decision,
  subjectLabel,
  onClose,
  onSubmit,
}: InboxNotePromptModalProps) {
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setNote('');
      setPending(false);
      setError(null);
    }
  }, [open]);

  async function submit() {
    if (note.trim().length < MIN_NOTE_LEN) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(note.trim());
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  const title = subjectLabel
    ? `${TITLES[decision]} · ${subjectLabel}`
    : TITLES[decision];

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-xs text-text-secondary leading-relaxed">
          {decision === 'REJECT'
            ? 'The asset will move to REJECTED. The note is saved to the audit log.'
            : 'The asset will move to REVISION and the producing agent will be re-triggered with your note as guidance.'}
        </p>
        <div>
          <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
            Note (required)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder={PLACEHOLDERS[decision]}
            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm leading-relaxed resize-y"
            style={{ minHeight: 88 }}
            autoFocus
          />
          <div className="text-[10px] text-text-muted mt-1">
            Minimum {MIN_NOTE_LEN} characters · {note.length} typed
          </div>
        </div>
        {error && (
          <p className="text-xs" style={{ color: 'var(--accent-danger)' }}>
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending || note.trim().length < MIN_NOTE_LEN}
            variant={decision === 'REJECT' ? 'danger' : 'warning'}
          >
            {pending ? 'Submitting…' : TITLES[decision]}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
