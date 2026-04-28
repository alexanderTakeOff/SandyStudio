// ──────────────────────────────────────────────────────────────────────────────
// components/studio-shell/StudioTopbar.tsx
// Top status/search bar per uiux.md §8.1.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { Search, Circle } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

interface StudioTopbarProps {
  governanceMode?: 1 | 2 | 3 | 4;
  systemMode?: '===1===' | '===5===';
}

const GOV_LABEL: Record<NonNullable<StudioTopbarProps['governanceMode']>, string> = {
  1: 'MANUAL',
  2: 'HYBRID',
  3: 'DELEGATED',
  4: 'AUTOTEST',
};

export function StudioTopbar({
  governanceMode = 1,
  systemMode = '===1===',
}: StudioTopbarProps) {
  return (
    <header className="relative z-20 flex items-center gap-3 h-14 px-4 border-b border-glass bg-panel-glass backdrop-blur-md">
      {/* Search */}
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="Search episodes, assets, agents…"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[var(--accent-primary)]"
          />
        </div>
      </div>

      {/* Mode chips */}
      <div className="flex items-center gap-2">
        <Tooltip label={`System mode ${systemMode === '===5===' ? '5 — EDIT' : '1 — ANALYTICS'}`} side="bottom">
          <span
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider border"
            style={{
              color: systemMode === '===5===' ? 'var(--accent-warning)' : 'var(--text-secondary)',
              borderColor:
                systemMode === '===5==='
                  ? 'color-mix(in oklab, var(--accent-warning) 50%, transparent)'
                  : 'var(--panel-glass-border)',
              background:
                systemMode === '===5==='
                  ? 'color-mix(in oklab, var(--accent-warning) 14%, transparent)'
                  : 'transparent',
            }}
          >
            <Circle size={6} fill="currentColor" />
            {systemMode === '===5===' ? 'EDIT' : 'ANALYTICS'}
          </span>
        </Tooltip>

        <Tooltip label={`Governance ${GOV_LABEL[governanceMode]}`} side="bottom">
          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider border border-glass text-text-secondary">
            Mode {governanceMode}
          </span>
        </Tooltip>
      </div>
    </header>
  );
}
