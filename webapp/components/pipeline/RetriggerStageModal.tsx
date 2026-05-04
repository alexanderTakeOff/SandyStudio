// ──────────────────────────────────────────────────────────────────────────────
// components/pipeline/RetriggerStageModal.tsx
// Re-trigger modal — opens from StageKebabMenu "Re-trigger…". Asks Director
// for a reason (required, audit log) and posts to /api/episodes/[id]/trigger.
//
// Replaces the prior `window.prompt()` + `window.confirm()` flow which threw
// "prompt() is not supported" in Next.js dev (and most modern sandboxed
// browser contexts). UX mirrors RejectModal so the visual language stays
// consistent across kebab actions.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface RetriggerStageModalProps {
  open: boolean;
  onClose: () => void;
  episodeId: string;
  stageLabel: string;
  producerAgent: string;
  onTriggered?: () => void;
}

const MIN_REASON_LEN = 3;

export function RetriggerStageModal({
  open,
  onClose,
  episodeId,
  stageLabel,
  producerAgent,
  onTriggered,
}: RetriggerStageModalProps) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setReason('');
      setPending(false);
      setError(null);
    }
  }, [open]);

  async function submit() {
    if (reason.trim().length < MIN_REASON_LEN) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/trigger`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentCode: producerAgent, reason: reason.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error ?? `Re-trigger failed (${res.status})`,
        );
      }
      onTriggered?.();
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
      title={`Re-trigger ${producerAgent} · ${stageLabel}`}
    >
      <div className="space-y-4">
        <p className="text-xs text-text-secondary leading-relaxed">
          This will fire <span className="font-mono">{producerAgent}</span> and may
          produce a duplicate asset (a new version). Downstream agents will fire
          automatically when their input gates pass.
        </p>
        <div>
          <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
            Reason (required, audit log)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="e.g. Re-run with Bible canon now loaded"
            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm leading-relaxed resize-y"
            style={{ minHeight: 88 }}
            autoFocus
          />
          <div className="text-[10px] text-text-muted mt-1">
            Minimum {MIN_REASON_LEN} characters · {reason.length} typed
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
            disabled={pending || reason.trim().length < MIN_REASON_LEN}
          >
            {pending ? 'Triggering…' : `Re-trigger ${producerAgent}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
