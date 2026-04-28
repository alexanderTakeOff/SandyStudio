// ──────────────────────────────────────────────────────────────────────────────
// components/studio-shell/StudioContentFrame.tsx
// ──────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StudioContentFrameProps {
  children: ReactNode;
  className?: string;
  maxWidth?: 'full' | 'wide' | 'standard';
}

const MAX: Record<NonNullable<StudioContentFrameProps['maxWidth']>, string> = {
  full:     'max-w-none',
  wide:     'max-w-[1600px]',
  standard: 'max-w-[1280px]',
};

export function StudioContentFrame({
  children,
  className,
  maxWidth = 'wide',
}: StudioContentFrameProps) {
  return (
    <main className="relative z-20 flex-1 overflow-y-auto">
      <div className={cn('mx-auto px-6 py-8', MAX[maxWidth], className)}>{children}</div>
    </main>
  );
}
