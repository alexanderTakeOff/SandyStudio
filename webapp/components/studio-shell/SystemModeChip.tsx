// ──────────────────────────────────────────────────────────────────────────────
// components/studio-shell/SystemModeChip.tsx
// Interactive Topbar chip for ===1=== / ===5=== — opens a confirm modal.
// Per uiux.md §8.4. Director-only hard-limit (CLAUDE.md §6).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Circle } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export type SystemMode = '===1===' | '===5===';

interface SystemModeChipProps {
  current: SystemMode;
}

export function SystemModeChip({ current }: SystemModeChipProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const target: SystemMode = current === '===5===' ? '===1===' : '===5===';

  async function confirm() {
    const res = await fetch('/api/system/mode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetMode: target, confirm: true }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Mode change failed: ${(j as { error?: string }).error ?? res.statusText}`);
      return;
    }
    setOpen(false);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <Tooltip
        label={`Click to switch — ${current === '===5===' ? 'currently EDIT' : 'currently ANALYTICS'}`}
        side="bottom"
      >
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider border transition-colors hover:brightness-125"
          style={{
            color:
              current === '===5==='
                ? 'var(--accent-warning)'
                : 'var(--text-secondary)',
            borderColor:
              current === '===5==='
                ? 'color-mix(in oklab, var(--accent-warning) 50%, transparent)'
                : 'var(--panel-glass-border)',
            background:
              current === '===5==='
                ? 'color-mix(in oklab, var(--accent-warning) 14%, transparent)'
                : 'transparent',
          }}
          aria-label="Switch system mode"
        >
          <Circle size={6} fill="currentColor" />
          {current === '===5===' ? 'EDIT' : 'ANALYTICS'}
        </button>
      </Tooltip>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Switch to ${target} ${target === '===5===' ? 'EDIT' : 'ANALYTICS'}?`}
      >
        <p className="text-sm text-text-secondary leading-relaxed">
          {target === '===5==='
            ? 'EDIT mode allows file writes, status changes, and irreversible actions.'
            : 'ANALYTICS mode is read-only. All write attempts will be blocked.'}
        </p>
        <p className="text-xs text-text-muted mt-3">
          Director-only — hard limit per CLAUDE.md §6. The change is logged in the audit trail.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant={target === '===5===' ? 'warning' : 'primary'} onClick={confirm} disabled={pending}>
            {pending ? 'Switching…' : `Confirm ${target}`}
          </Button>
        </div>
      </Modal>
    </>
  );
}
