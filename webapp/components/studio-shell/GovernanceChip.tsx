// ──────────────────────────────────────────────────────────────────────────────
// components/studio-shell/GovernanceChip.tsx
// Interactive Topbar chip for governance Mode 1..4. Opens a dropdown to pick
// the new mode. Per uiux.md §8.4. Director-only.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Tooltip } from '@/components/ui/Tooltip';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export type GovernanceMode = 1 | 2 | 3 | 4;

const MODE_LABEL: Record<GovernanceMode, string> = {
  1: 'MANUAL',
  2: 'HYBRID',
  3: 'DELEGATED',
  4: 'AUTOTEST',
};

const MODE_DESCRIPTION: Record<GovernanceMode, string> = {
  1: 'You approve every gate. Default; safest.',
  2: 'You + EXEC-DIR-AI share approvals per Authority Matrix.',
  3: 'EXEC-DIR-AI handles all approvals except hard limits.',
  4: 'AUTOTEST — every gate auto-passes. Pipeline testing only.',
};

interface GovernanceChipProps {
  current: GovernanceMode;
}

export function GovernanceChip({ current }: GovernanceChipProps) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<GovernanceMode>(current);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function apply() {
    const res = await fetch('/api/system/governance-mode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetMode: target, scope: 'global', confirm: true }),
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
      <Tooltip label={`Governance ${MODE_LABEL[current]} — click to change`} side="bottom">
        <button
          onClick={() => {
            setTarget(current);
            setOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider border border-glass text-text-secondary hover:bg-[var(--panel-hover-bg)] transition-colors"
          aria-label="Switch governance mode"
        >
          Mode {current}
        </button>
      </Tooltip>

      <Modal open={open} onClose={() => setOpen(false)} title="Governance mode">
        <div className="space-y-1.5">
          {([1, 2, 3, 4] as const).map((mode) => {
            const checked = target === mode;
            const isAutotest = mode === 4;
            return (
              <button
                key={mode}
                onClick={() => setTarget(mode)}
                className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border border-glass text-left hover:bg-[var(--panel-hover-bg)] transition-colors"
                style={
                  checked
                    ? {
                        borderColor: 'var(--panel-glass-border-active)',
                        background: 'var(--panel-hover-bg)',
                      }
                    : undefined
                }
              >
                <div
                  className="mt-1 h-3 w-3 rounded-full border-2 shrink-0"
                  style={{
                    borderColor: 'var(--accent-primary)',
                    background: checked ? 'var(--accent-primary)' : 'transparent',
                  }}
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-text-primary">
                    Mode {mode} — {MODE_LABEL[mode]}
                    {isAutotest && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--accent-warning)]">
                        testing only
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-secondary mt-0.5">{MODE_DESCRIPTION[mode]}</div>
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-text-muted mt-4 leading-relaxed">
          Director-only · hard limit per CLAUDE.md §6 · audited in activity feed.
          Hard-limit actions (PUBLISH, LOCKED, BUDGET, MODE_CHANGE) always require Director,
          regardless of governance mode.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={target === 4 ? 'warning' : 'primary'}
            onClick={apply}
            disabled={pending || target === current}
          >
            {pending ? 'Applying…' : `Apply Mode ${target}`}
          </Button>
        </div>
      </Modal>
    </>
  );
}
