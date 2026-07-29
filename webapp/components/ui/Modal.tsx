// ──────────────────────────────────────────────────────────────────────────────
// components/ui/Modal.tsx
// Lightweight modal primitive. Renders into document.body via portal,
// respects ESC + backdrop click. Theme-token styled.
//
// READABILITY FLOOR (Director, 2026-07-29): a modal interrupts the human to ask
// him something, so its text must be readable at a glance — not squinted at.
// The title and the content wrapper set `text-base` (the document base size),
// which every child inherits unless it deliberately steps down. Small type is
// for service captions (counters, hints), never for the sentence the decision
// rests on. See specs/system/uiux.md §20.1.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  hideClose?: boolean;
}

export function Modal({ open, onClose, title, children, size = 'sm', hideClose }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      // React portals bubble synthetic events through the React parent tree,
      // not the DOM tree — so a textarea inside this modal would hand its
      // keydown to whatever parent component triggered the modal (e.g. the
      // episode page's stage row with `onKeyDown` that preventDefault()s
      // Space/Enter to toggle the row). Stop synthetic bubbling here so the
      // textarea actually receives the keystroke. Native `document` listeners
      // (e.g. our Escape handler above) are unaffected.
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative w-full rounded-2xl border border-glass bg-panel-glass-strong backdrop-blur-xl shadow-glass',
          size === 'sm' && 'max-w-md',
          size === 'md' && 'max-w-xl',
          size === 'lg' && 'max-w-3xl',
        )}
        style={{ boxShadow: 'var(--panel-shadow)' }}
      >
        {(title || !hideClose) && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-glass">
            <h3 className="text-base font-semibold text-text-primary">{title}</h3>
            {!hideClose && (
              <button
                onClick={onClose}
                className="p-1 rounded-md text-text-secondary hover:bg-[var(--panel-hover-bg)] hover:text-text-primary transition-colors"
                aria-label="Close"
              >
                <X size={16} strokeWidth={1.7} />
              </button>
            )}
          </div>
        )}
        <div className="px-5 py-4 text-base leading-relaxed">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
