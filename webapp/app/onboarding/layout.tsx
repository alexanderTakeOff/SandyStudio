// ──────────────────────────────────────────────────────────────────────────────
// app/onboarding/layout.tsx
// Onboarding wizard runs OUTSIDE StudioShell — fullscreen + dimmed ambient.
// Per onboarding.md §3.
// ──────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';
import { AmbientAssetField } from '@/components/studio-shell/AmbientAssetField';

export const dynamic = 'force-dynamic';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      <div className="absolute inset-0 -z-10">
        <AmbientAssetField />
      </div>
      <div className="absolute inset-0 -z-10 bg-black/40 backdrop-blur-sm" />
      {children}
    </div>
  );
}
