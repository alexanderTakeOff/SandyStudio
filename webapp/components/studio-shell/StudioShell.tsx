// ──────────────────────────────────────────────────────────────────────────────
// components/studio-shell/StudioShell.tsx
// Top-level shell per uiux.md §8 — Sidebar + ConciergePanel + Content
// arranged in a 3-column grid. AmbientAssetField paints behind everything.
//
// TD-54.3 (2026-05-26): Column order locked as
//   [Sidebar (w-14/w-60)]  [ConciergePanel (0 when closed)]  [Content (1fr)]
// driven by two CSS vars on documentElement:
//   --sidebar-width  → owned by StudioSidebar (collapse toggle)
//   --pa-mid-width   → owned by ConciergePanel (open/close + drag-resize)
// Both are kept in sync via setProperty so the grid template animates
// columns smoothly when either changes.
//
// AmbientAssetField + ConciergePanel are 'use client'; they guard their own
// browser-only APIs internally.
// ──────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';
import { StudioSidebar } from './StudioSidebar';
import { StudioTopbar } from './StudioTopbar';
import { AmbientAssetField } from './AmbientAssetField';
import { ConciergePanel } from '@/components/concierge/ConciergePanel';
import { NotificationDotStyles } from '@/components/notifications/NotificationDot';

interface StudioShellProps {
  children: ReactNode;
  governanceMode?: 1 | 2 | 3;
}

export function StudioShell({ children, governanceMode }: StudioShellProps) {
  return (
    <div
      className="relative min-h-screen grid"
      style={{
        gridTemplateColumns: 'var(--sidebar-width, 15rem) var(--pa-mid-width, 0px) minmax(0, 1fr)',
        transition: 'grid-template-columns 200ms ease-out',
      }}
    >
      {/* Notification dot keyframes — global once per shell */}
      <NotificationDotStyles />

      {/* z-0 / -z-10 — Ambient background painted behind every column */}
      <AmbientAssetField />

      {/* z-20 — Sidebar, column 1. h-screen sticky so it survives page scroll. */}
      <div className="relative z-20 h-screen sticky top-0 self-start">
        <StudioSidebar />
      </div>

      {/* z-30 — Prod Assistant, column 2 (collapses to 0 when closed) */}
      <ConciergePanel />

      {/* z-20 — Topbar + Content, column 3.
          TD-54.2: scroll lives HERE, not on document. Topbar stays sticky
          at the top of the content viewport via the sticky wrapper below;
          each child page can adopt its own subsection-scoped scroll. */}
      <div className="relative z-20 flex flex-col min-w-0 h-screen overflow-y-auto">
        <div className="sticky top-0 z-10 bg-[var(--bg)]">
          <StudioTopbar governanceMode={governanceMode} />
        </div>
        {children}
      </div>
    </div>
  );
}
