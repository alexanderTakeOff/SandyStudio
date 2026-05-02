// ──────────────────────────────────────────────────────────────────────────────
// components/ui/Button.tsx
// ──────────────────────────────────────────────────────────────────────────────

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-[var(--accent-primary)] text-[var(--text-inverse)] hover:opacity-90 active:opacity-80',
  secondary:
    'bg-panel-glass-strong text-text-primary border border-glass hover:bg-[var(--panel-hover-bg)]',
  ghost:
    'bg-transparent text-text-secondary hover:bg-[var(--panel-hover-bg)] hover:text-text-primary',
  danger:
    'bg-[var(--accent-danger)] text-white hover:opacity-90 active:opacity-80',
  warning:
    'bg-[var(--accent-warning)] text-[var(--text-inverse)] hover:opacity-90 active:opacity-80',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
        'transition-all duration-150 focus:outline-none focus:ring-2',
        'focus:ring-[var(--accent-primary)] focus:ring-offset-2 focus:ring-offset-[var(--bg-base)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  );
});
