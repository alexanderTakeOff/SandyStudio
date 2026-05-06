// ──────────────────────────────────────────────────────────────────────────────
// components/preview/PreviewDrawer.tsx
// Right-side overlay drawer for asset preview (Phase 5d step 3).
//
// Director q1: opens from a per-item button (Eye icon) in activity feed —
// click on the whole item is reserved for a future short-summary view.
// Director q2: overlay (not split layout), with size toggle small ↔ wide ↔ full
// so images/videos can be viewed close to original size.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, Maximize2, Minimize2, Square, ChevronLeft, ChevronRight } from 'lucide-react';
import { AssetPreview } from './AssetPreview';

export type PreviewDrawerSize = 'small' | 'wide' | 'full';

export interface PreviewDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Asset to preview. null while opening / closing. */
  assetId: string | null;
  /** Title hint — usually the asset filename or activity title. */
  title?: string;
  /** Footer slot for kebab actions; rendered below the preview body. */
  footer?: ReactNode;
  /**
   * Optional prev/next navigation. Caller supplies callbacks; drawer renders
   * chevron buttons in the header that invoke them. When a callback is null,
   * the corresponding button is disabled (end of list).
   *
   * Used by EpisodeTimeline so Director can review shots without closing the
   * drawer between cells. Keyboard: ← / → arrow keys when drawer is open.
   */
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
  /** Optional position label (e.g. "5 / 13") shown next to nav arrows. */
  navLabel?: string;
}

const WIDTHS: Record<PreviewDrawerSize, string> = {
  small: '480px',
  wide: '70vw',
  full: '100vw',
};

export function PreviewDrawer({
  open,
  onClose,
  assetId,
  title,
  footer,
  onPrev,
  onNext,
  navLabel,
}: PreviewDrawerProps) {
  const [size, setSize] = useState<PreviewDrawerSize>('small');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Don't hijack arrow keys when the user is typing inside an input.
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        (target?.isContentEditable ?? false);
      if (isTyping) return;
      if (e.key === 'ArrowLeft' && onPrev) {
        e.preventDefault();
        onPrev();
      }
      if (e.key === 'ArrowRight' && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose, onPrev, onNext]);

  // Reset size when drawer closes so next open starts compact.
  useEffect(() => {
    if (!open) setSize('small');
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 pointer-events-none" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-auto"
        onClick={onClose}
      />
      <aside
        className="absolute top-0 right-0 h-full pointer-events-auto flex flex-col border-l border-glass shadow-2xl transition-[width] duration-200 ease-out"
        style={{
          width: WIDTHS[size],
          maxWidth: '100vw',
          background: 'var(--panel-glass-strong-bg)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-glass">
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wider text-text-muted">
              Preview
            </div>
            {title && (
              <div className="text-sm font-medium text-text-primary truncate" title={title}>
                {title}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <SizeButton
              active={size === 'small'}
              onClick={() => setSize('small')}
              label="Small"
              icon={<Minimize2 size={14} />}
            />
            <SizeButton
              active={size === 'wide'}
              onClick={() => setSize('wide')}
              label="Wide"
              icon={<Square size={14} />}
            />
            <SizeButton
              active={size === 'full'}
              onClick={() => setSize('full')}
              label="Full"
              icon={<Maximize2 size={14} />}
            />
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-text-secondary hover:bg-[var(--panel-hover-bg)] hover:text-text-primary transition-colors ml-1"
              aria-label="Close preview"
            >
              <X size={14} strokeWidth={1.7} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {assetId ? (
            <AssetPreview assetId={assetId} />
          ) : (
            <p className="text-sm text-text-secondary">No asset selected.</p>
          )}
        </div>

        {footer && (
          <div className="border-t border-glass px-4 py-2.5 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}

function SizeButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="p-1.5 rounded-md transition-colors"
      style={{
        background: active ? 'var(--panel-hover-bg)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}
      aria-label={`${label} size`}
      title={label}
    >
      {icon}
    </button>
  );
}
