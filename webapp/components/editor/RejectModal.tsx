// ──────────────────────────────────────────────────────────────────────────────
// components/editor/RejectModal.tsx
// Reject + revise modal — opens from kebab "Reject + revise". Posts a
// REQUEST_REVISION decision to /api/assets/[id]/approve with a required note.
// Different from EditorModal: this is a feedback loop (note travels into
// revision_log + activity_event), not an in-place content edit.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface RejectModalProps {
  open: boolean;
  onClose: () => void;
  assetId: string | null;
  assetFilename?: string;
  onRejected?: () => void;
}

const MIN_NOTE_LEN = 8;

export function RejectModal({
  open,
  onClose,
  assetId,
  assetFilename,
  onRejected,
}: RejectModalProps) {
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
    if (!assetId || note.trim().length < MIN_NOTE_LEN) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/assets/${assetId}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // directorConfirm:true required in Mode 1 — approve route gates
        // AGENT_RUN through enforceMode and throws GovernanceBlockError
        // without it (Sprint φ UI bug fix 2026-05-16; AssetPreview's
        // requestRevision already passed this flag).
        body: JSON.stringify({ decision: 'REQUEST_REVISION', note, directorConfirm: true }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error ?? `Reject failed (${res.status})`,
        );
      }
      onRejected?.();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={assetFilename ? `Reject + revise · ${assetFilename}` : 'Reject + revise'}
    >
      <div className="space-y-4">
        <p className="text-xs text-text-secondary leading-relaxed">
          Asset will move to <span className="font-mono">REVISION</span> and the
          producing agent will be re-triggered with your note as guidance.
        </p>
        <div>
          <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
            What needs to change? (required)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={5}
            placeholder="e.g. Sandy looks too gloomy in act 2 — restore the sly grin"
            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm leading-relaxed resize-y"
            style={{ minHeight: 100 }}
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
            variant="warning"
          >
            {pending ? 'Submitting…' : 'Reject + revise'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
