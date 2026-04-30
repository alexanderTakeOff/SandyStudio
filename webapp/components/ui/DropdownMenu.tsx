// ──────────────────────────────────────────────────────────────────────────────
// components/ui/DropdownMenu.tsx
// Minimal headless dropdown menu primitive. Click-outside + ESC to close,
// keyboard nav (ArrowUp/Down/Enter/Esc), portal-rendered. No Radix dep —
// kebab is the only consumer for now (per provider_strategy.md §4.2).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface DropdownItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  shortcut?: string;
}

export interface DropdownSeparator {
  separator: true;
}

export type DropdownEntry = DropdownItem | DropdownSeparator;

export interface DropdownMenuProps {
  trigger: ReactNode;
  items: DropdownEntry[];
  align?: 'start' | 'end';
  /** Width of the menu in px. Default 240. */
  width?: number;
  /** Optional aria label for the trigger button. */
  ariaLabel?: string;
}

interface MenuPosition {
  top: number;
  left: number;
}

const isItem = (entry: DropdownEntry): entry is DropdownItem =>
  !('separator' in entry);

export function DropdownMenu({
  trigger,
  items,
  align = 'end',
  width = 240,
  ariaLabel,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPosition | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const itemEntries = items
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry }) => isItem(entry) && !(entry as DropdownItem).disabled);

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const top = rect.bottom + 4;
    const left = align === 'end' ? rect.right - width : rect.left;
    setPos({ top, left: Math.max(8, left) });
    setOpen(true);
    setActiveIndex(itemEntries[0]?.idx ?? -1);
  }

  function closeMenu() {
    setOpen(false);
    setActiveIndex(-1);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      closeMenu();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeMenu();
        triggerRef.current?.focus();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const direction = e.key === 'ArrowDown' ? 1 : -1;
        const enabledIdxs = itemEntries.map((x) => x.idx);
        if (enabledIdxs.length === 0) return;
        const currentPos = enabledIdxs.indexOf(activeIndex);
        const nextPos = (currentPos + direction + enabledIdxs.length) % enabledIdxs.length;
        setActiveIndex(enabledIdxs[nextPos]!);
      }
      if (e.key === 'Enter' && activeIndex >= 0) {
        const entry = items[activeIndex];
        if (entry && isItem(entry)) {
          entry.onSelect();
          closeMenu();
        }
      }
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, activeIndex, items, itemEntries]);

  const menuStyle: CSSProperties = {
    top: pos?.top ?? 0,
    left: pos?.left ?? 0,
    width,
    background: 'var(--panel-glass-strong-bg)',
    backdropFilter: 'blur(14px)',
    boxShadow: 'var(--panel-shadow)',
  };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          if (open) closeMenu();
          else openMenu();
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        className="inline-flex items-center justify-center"
      >
        {trigger}
      </button>

      {open && pos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              className="fixed z-[60] rounded-xl border border-glass py-1.5"
              style={menuStyle}
            >
              {items.map((entry, idx) => {
                if (!isItem(entry)) {
                  return (
                    <div
                      key={`sep-${idx}`}
                      role="separator"
                      className="my-1 mx-2 h-px"
                      style={{ background: 'var(--border-glass)' }}
                    />
                  );
                }
                const item = entry;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={`${item.label}-${idx}`}
                    role="menuitem"
                    disabled={item.disabled}
                    onMouseEnter={() => !item.disabled && setActiveIndex(idx)}
                    onClick={() => {
                      if (item.disabled) return;
                      item.onSelect();
                      closeMenu();
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                      'disabled:opacity-40 disabled:cursor-not-allowed',
                      item.destructive
                        ? 'text-[var(--accent-danger)]'
                        : 'text-text-primary',
                    )}
                    style={{
                      background: isActive ? 'var(--panel-hover-bg)' : 'transparent',
                    }}
                  >
                    {item.icon && (
                      <span className="flex-shrink-0 opacity-80">{item.icon}</span>
                    )}
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut && (
                      <span className="text-[10px] uppercase tracking-wider text-text-muted">
                        {item.shortcut}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
