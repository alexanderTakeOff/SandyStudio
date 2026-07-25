// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/layout.tsx
// Wraps every authenticated studio route in the StudioShell. Auth is enforced
// by middleware.ts; this layout assumes the user is signed in.
//
// The global governance-mode default is no longer surfaced here: the mode lever
// moved into Episode Settings as a per-episode control (2026-07-24 Chunk 2c), so
// the shell no longer reads app_config for it.
// ──────────────────────────────────────────────────────────────────────────────

import { StudioShell } from '@/components/studio-shell/StudioShell';
import { WorkspaceScopeProvider } from '@/components/providers/WorkspaceScopeProvider';

export const dynamic = 'force-dynamic';

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceScopeProvider>
      <StudioShell>{children}</StudioShell>
    </WorkspaceScopeProvider>
  );
}
