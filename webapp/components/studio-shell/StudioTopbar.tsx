// ──────────────────────────────────────────────────────────────────────────────
// components/studio-shell/StudioTopbar.tsx
// Top status bar per uiux.md §8.1.
// Phase 5c: chips are interactive levers per uiux.md §8.4.
// UI-cleanup (2026-07-24): search mockup + system-mode (ANALYTICS/EDIT) chip
// removed; only the governance-mode lever remains, pinned top-right.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { GovernanceChip } from './GovernanceChip';

interface StudioTopbarProps {
  governanceMode?: 1 | 2 | 3;
}

export function StudioTopbar({ governanceMode = 1 }: StudioTopbarProps) {
  return (
    <header className="relative z-20 flex items-center justify-end gap-3 h-14 px-4 border-b border-glass bg-panel-glass backdrop-blur-md">
      <GovernanceChip current={governanceMode} />
    </header>
  );
}
