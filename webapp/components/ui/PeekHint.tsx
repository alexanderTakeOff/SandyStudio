// ──────────────────────────────────────────────────────────────────────────────
// components/ui/PeekHint.tsx
// Self-dismissing inline hint. Replaces muted description rows.
//
// Behaviour:
//   - On mount → bubble auto-peeks for ~4s, then fades out.
//   - Hover/focus on trigger (or bubble) → bubble pins (no auto-hide).
//   - Mouse/focus leaves → 250ms grace → fades out.
//   - Click trigger → toggle pinned state explicitly (sticky for keyboard).
//   - Global toggle off → renders nothing visible at all.
//
// Visual: small "i" affordance next to label/row, bubble appears beside it
// using the existing panel-glass-strong surface. Respects prefers-reduced-motion.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHintsEnabled } from '@/lib/hints/preferences';

interface PeekHintProps {
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** ms the bubble auto-stays after mount. 0 disables auto-peek. */
  autoPeekMs?: number;
  /** ms after pointer/focus leaves before bubble fades. */
  graceMs?: number;
  /** Optional override label (sr-only) for the trigger button. */
  triggerLabel?: string;
  className?: string;
}

const POS: Record<NonNullable<PeekHintProps['side']>, string> = {
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
  right:  'left-full top-1/2 -translate-y-1/2 ml-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left:   'right-full top-1/2 -translate-y-1/2 mr-2',
};

export function PeekHint({
  children,
  side = 'right',
  autoPeekMs = 4000,
  graceMs = 250,
  triggerLabel = 'Show hint',
  className,
}: PeekHintProps) {
  const enabled = useHintsEnabled();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  useEffect(() => {
    if (!enabled || autoPeekMs <= 0) return;
    setOpen(true);
    peekTimer.current = setTimeout(() => {
      setOpen((isOpen) => (pinned ? isOpen : false));
    }, autoPeekMs);
    return () => {
      if (peekTimer.current) clearTimeout(peekTimer.current);
    };
    // we intentionally re-run only when hints toggle flips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (peekTimer.current) clearTimeout(peekTimer.current);
    };
  }, []);

  if (!enabled) return null;

  function show() {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (peekTimer.current) {
      clearTimeout(peekTimer.current);
      peekTimer.current = null;
    }
    setOpen(true);
  }

  function scheduleHide() {
    if (pinned) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOpen(false), graceMs);
  }

  function togglePin() {
    setPinned((prev) => {
      const next = !prev;
      if (next) setOpen(true);
      return next;
    });
  }

  return (
    <span
      className={cn('relative inline-flex items-center', className)}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocus={show}
      onBlur={scheduleHide}
    >
      <button
        type="button"
        aria-label={triggerLabel}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={togglePin}
        className={cn(
          'inline-flex h-4 w-4 items-center justify-center rounded-full',
          'text-text-muted hover:text-text-secondary transition-colors',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-info)]',
          pinned && 'text-text-secondary',
        )}
      >
        <Info size={12} aria-hidden />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'peek-hint-bubble absolute z-50 max-w-[20rem] rounded-lg px-3 py-2 text-xs leading-relaxed',
            'bg-panel-glass-strong border border-glass text-text-secondary shadow-[var(--panel-shadow)]',
            'backdrop-blur-md',
            POS[side],
          )}
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
        >
          {children}
        </span>
      )}
    </span>
  );
}
