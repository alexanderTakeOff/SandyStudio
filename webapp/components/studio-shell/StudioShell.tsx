// ──────────────────────────────────────────────────────────────────────────────
// components/studio-shell/StudioShell.tsx
// Top-level shell per uiux.md §8 — Sidebar + Topbar + ContentFrame + Ambient.
// Uses the z-index model from §8.2.
// ──────────────────────────────────────────────────────────────────────────────

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { StudioSidebar } from './StudioSidebar';
import { StudioTopbar } from './StudioTopbar';

// AmbientAssetField uses three.js — load only on the client.
const AmbientAssetField = dynamic(
  () => import('./AmbientAssetField').then((m) => m.AmbientAssetField),
  { ssr: false },
);

const ConciergePanel = dynamic(
  () => import('@/components/concierge/ConciergePanel').then((m) => m.ConciergePanel),
  { ssr: false },
);

interface StudioShellProps {
  children: ReactNode;
  governanceMode?: 1 | 2 | 3 | 4;
  systemMode?: '===1===' | '===5===';
}

export function StudioShell({ children, governanceMode, systemMode }: StudioShellProps) {
  return (
    <div className="relative min-h-screen flex">
      {/* z-0 / -z-10 — Ambient background */}
      <AmbientAssetField />

      {/* z-20 — Sidebar */}
      <StudioSidebar />

      {/* z-20 — Topbar + Content */}
      <div className="relative z-20 flex-1 flex flex-col min-w-0">
        <StudioTopbar governanceMode={governanceMode} systemMode={systemMode} />
        {children}
      </div>

      {/* z-30 — Concierge floating panel */}
      <ConciergePanel />
    </div>
  );
}
