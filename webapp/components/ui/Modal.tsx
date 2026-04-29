// ──────────────────────────────────────────────────────────────────────────────
// components/ui/Modal.tsx
// Lightweight modal primitive. Renders into document.body via portal,
// respects ESC + backdrop click. Theme-token styled.
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
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
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
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
