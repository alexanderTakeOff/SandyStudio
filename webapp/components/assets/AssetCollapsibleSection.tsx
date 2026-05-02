// ──────────────────────────────────────────────────────────────────────────────
// components/assets/AssetCollapsibleSection.tsx
// Reusable collapsible disclosure used in AssetDrawer to keep the drawer
// compact (Director's request 2026-05-02 — every big block must be foldable).
//
// Lives in /components/assets/ so it can be reused by Bible Drawer + episode
// preview Drawer + future asset surfaces.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface AssetCollapsibleSectionProps {
  open: boolean;
  onToggle: () => void;
  label: ReactNode;
  /** Optional right-aligned meta — small monospace string. */
  meta?: ReactNode;
  children: ReactNode;
}

export function AssetCollapsibleSection({
  open,
  onToggle,
  label,
  meta,
  children,
}: AssetCollapsibleSectionProps) {
  return (
    <div className="rounded-lg border border-glass overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[var(--panel-hover-bg)] transition-colors"
      >
        <span className="flex items-center gap-2 text-xs uppercase tracking-wider text-text-secondary">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {label}
        </span>
        {meta && <span className="text-[10px] text-text-muted font-mono">{meta}</span>}
      </button>
      {open && <div className="border-t border-glass p-3">{children}</div>}
    </div>
  );
}
