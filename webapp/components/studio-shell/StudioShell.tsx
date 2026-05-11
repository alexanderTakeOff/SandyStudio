// ──────────────────────────────────────────────────────────────────────────────
// components/studio-shell/StudioShell.tsx
// Top-level shell per uiux.md §8 — Sidebar + Topbar + ContentFrame + Ambient.
// Uses the z-index model from §8.2.
// AmbientAssetField and ConciergePanel are 'use client' components; they
// guard their own browser-only APIs internally.
// ──────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';
import { StudioSidebar } from './StudioSidebar';
import { StudioTopbar } from './StudioTopbar';
import { AmbientAssetField } from './AmbientAssetField';
import { ConciergePanel } from '@/components/concierge/ConciergePanel';
import { NotificationDotStyles } from '@/components/notifications/NotificationDot';

interface StudioShellProps {
  children: ReactNode;
  governanceMode?: 1 | 2 | 3 | 4;
  systemMode?: '===1===' | '===5===';
}

export function StudioShell({ children, governanceMode, systemMode }: StudioShellProps) {
  // The Prod Assistant panel writes --pa-pad-left / --pa-pad-right on the
  // document root via useEffect (see ConciergePanel.tsx). The wrapper here
  // reserves space for the panel via padding so the rest of the UI shrinks
  // instead of being overlapped. Falls back to 0 when the panel is closed
  // or the vars are unset (initial server render).
  return (
    <div
      className="relative min-h-screen flex transition-[padding] duration-200 ease-out"
      style={{
        paddingLeft: 'var(--pa-pad-left, 0px)',
        paddingRight: 'var(--pa-pad-right, 0px)',
      }}
    >
      {/* Notification dot keyframes — global once per shell */}
      <NotificationDotStyles />

      {/* z-0 / -z-10 — Ambient background */}
      <AmbientAssetField />

      {/* z-20 — Sidebar */}
      <StudioSidebar />

      {/* z-20 — Topbar + Content */}
      <div className="relative z-20 flex-1 flex flex-col min-w-0">
        <StudioTopbar governanceMode={governanceMode} systemMode={systemMode} />
        {children}
      </div>

      {/* z-30 — Prod Assistant docked panel (writes the CSS vars above) */}
      <ConciergePanel />
    </div>
  );
}
