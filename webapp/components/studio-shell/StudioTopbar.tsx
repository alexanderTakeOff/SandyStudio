// ──────────────────────────────────────────────────────────────────────────────
// components/studio-shell/StudioTopbar.tsx
// Top status/search bar per uiux.md §8.1.
// Phase 5c: chips become interactive levers per uiux.md §8.4.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { Search } from 'lucide-react';
import { SystemModeChip } from './SystemModeChip';
import { GovernanceChip } from './GovernanceChip';

interface StudioTopbarProps {
  governanceMode?: 1 | 2 | 3 | 4;
  systemMode?: '===1===' | '===5===';
}

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

      {/* Mode chips — now interactive */}
      <div className="flex items-center gap-2">
        <SystemModeChip current={systemMode} />
        <GovernanceChip current={governanceMode} />
      </div>
    </header>
  );
}
