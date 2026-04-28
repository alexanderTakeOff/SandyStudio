// ──────────────────────────────────────────────────────────────────────────────
// components/ui/Tooltip.tsx
// Lightweight CSS-only tooltip. Future: Radix Tooltip if interaction grows.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  label: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
  className?: string;
}

const POS: Record<NonNullable<TooltipProps['side']>, string> = {
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
  right:  'left-full top-1/2 -translate-y-1/2 ml-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left:   'right-full top-1/2 -translate-y-1/2 mr-2',
};

export function Tooltip({ label, side = 'right', children, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-md px-2 py-1 text-xs',
            'bg-panel-glass-strong border border-glass text-text-primary shadow-[var(--panel-shadow)]',
            'backdrop-blur-md',
            POS[side],
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
