// ──────────────────────────────────────────────────────────────────────────────
// components/studio-shell/GovernanceChip.tsx
// Interactive Topbar chip for governance Mode 1..4. Opens a dropdown to pick
// the new mode. Per uiux.md §8.4. Director-only.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
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
  /** Global default from the server layout — used as the fallback / no-episode value. */
  current: GovernanceMode;
}

// F11: pull the focused episode's UUID out of the URL so the chip reads AND
// writes the episode's own mode, not the global default.
const EPISODE_UUID_RE =
  /\/episodes\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function GovernanceChip({ current }: GovernanceChipProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const episodeId = pathname?.match(EPISODE_UUID_RE)?.[1] ?? null;

  // F11 (2026-07-01): show the EFFECTIVE mode of the episode in focus (episode
  // override → global), NOT just the global default. The old badge read only
  // the global app_config value, so it showed Mode 2 while an episode ran
  // Mode 3 and cascaded — the Director trusted a wrong badge.
  const [effective, setEffective] = useState<GovernanceMode>(current);
  const [scope, setScope] = useState<'episode' | 'global'>('global');
  const [target, setTarget] = useState<GovernanceMode>(current);

  useEffect(() => {
    let cancelled = false;
    const q = episodeId ? `?episodeId=${episodeId}` : '';
    fetch(`/api/system/governance-mode${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.data) return;
        const eff = Number(j.data.effective) as GovernanceMode;
        setEffective(eff);
        setScope(j.data.scope === 'episode' ? 'episode' : 'global');
        setTarget(eff);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [episodeId, current]);

  async function apply() {
    const res = await fetch('/api/system/governance-mode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // F11: write the episode override when an episode is in focus — previously
      // this always wrote scope:'global', so "set Mode 2" changed the global
      // default while the episode stayed on its own (higher) mode.
      body: JSON.stringify({
        targetMode: target,
        scope: episodeId ? { episodeId } : 'global',
        confirm: true,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Mode change failed: ${(j as { error?: string }).error ?? res.statusText}`);
      return;
    }
    setEffective(target);
    setScope(episodeId ? 'episode' : 'global');
    setOpen(false);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <Tooltip
        label={`Governance ${MODE_LABEL[effective]} · ${
          scope === 'episode' ? 'episode override' : 'global default'
        } — click to change`}
        side="bottom"
      >
        <button
          onClick={() => {
            setTarget(effective);
            setOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider border border-glass text-text-secondary hover:bg-[var(--panel-hover-bg)] transition-colors"
          aria-label="Switch governance mode"
        >
          Mode {effective}
          <span className="opacity-60">{scope === 'episode' ? '· ep' : '· gl'}</span>
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

        <p className="text-[11px] mt-4 leading-relaxed font-medium" style={{ color: 'var(--accent-primary)' }}>
          Applies to: {scope === 'episode' ? 'THIS EPISODE (override)' : 'GLOBAL default (no episode in focus)'}.
        </p>
        <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
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
            disabled={pending || target === effective}
          >
            {pending ? 'Applying…' : `Apply Mode ${target} → ${scope === 'episode' ? 'episode' : 'global'}`}
          </Button>
        </div>
      </Modal>
    </>
  );
}
