// ──────────────────────────────────────────────────────────────────────────────
// components/ui/FilterPills.tsx
// The status/segment filter row used across the studio surfaces. Extracted
// 2026-07-29 from the two hand-copied instances (inbox + episodes) so the third
// caller (series themes) reuses instead of forking a third copy.
//
// Optional `cssVar` per option paints the pill in that segment's semantic colour
// (a dot always, the border+tint when active) — this is what lets a status row
// be recognised by colour instead of read word by word.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { cn } from '@/lib/utils';

export interface FilterPillOption<T extends string> {
  id: T;
  label: string;
  /** Shown after the label when present (e.g. how many rows the segment holds). */
  count?: number;
  /** Semantic colour token for this segment, e.g. '--status-approved'. */
  cssVar?: string;
}

export interface FilterPillsProps<T extends string> {
  options: ReadonlyArray<FilterPillOption<T>>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
}

const FALLBACK_TINT = 'var(--accent-primary)';

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  className,
}: FilterPillsProps<T>) {
  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)} role="tablist">
      {options.map((o) => {
        const tint = o.cssVar ? `var(${o.cssVar})` : FALLBACK_TINT;
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium uppercase tracking-wider border transition-colors"
            style={{
              background: active ? `color-mix(in oklab, ${tint} 14%, transparent)` : 'transparent',
              borderColor: active ? tint : 'var(--panel-glass-border)',
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {o.cssVar && (
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: tint }}
              />
            )}
            {o.label}
            {typeof o.count === 'number' && (
              <span className="font-normal normal-case" style={{ color: 'var(--text-muted)' }}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
