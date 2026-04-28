// ──────────────────────────────────────────────────────────────────────────────
// components/ui/Card.tsx
// Glass-style panel card per uiux.md §5.2.
// ──────────────────────────────────────────────────────────────────────────────

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'glass' | 'glass-strong' | 'solid';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant = 'glass', ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl border backdrop-blur-md transition-colors',
        'border-glass shadow-[var(--panel-shadow)]',
        variant === 'glass' && 'bg-panel-glass',
        variant === 'glass-strong' && 'bg-panel-glass-strong',
        variant === 'solid' && 'bg-bg-elevated',
        className,
      )}
      style={{ backdropFilter: 'blur(var(--panel-glass-blur))' }}
      {...props}
    />
  );
});

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pt-5 pb-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <h3
      className={cn(
        'text-sm font-semibold tracking-wide text-text-primary uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-between px-5 py-3 border-t border-glass', className)}
      {...props}
    />
  );
}
