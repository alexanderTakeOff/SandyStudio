// ──────────────────────────────────────────────────────────────────────────────
// components/ui/Badge.tsx
// ──────────────────────────────────────────────────────────────────────────────

import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** CSS variable name (e.g. '--asset-script') for the dot/border color */
  cssVar?: string;
}

export function Badge({ className, cssVar, style, children, ...props }: BadgeProps) {
  const tint = cssVar ? `var(${cssVar})` : 'var(--text-secondary)';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
        'border border-glass bg-panel-glass text-text-secondary',
        className,
      )}
      style={{ borderColor: tint, color: tint, ...style }}
      {...props}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: tint }}
      />
      {children}
    </span>
  );
}
