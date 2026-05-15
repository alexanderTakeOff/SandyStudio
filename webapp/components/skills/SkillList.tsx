// ──────────────────────────────────────────────────────────────────────────────
// components/skills/SkillList.tsx
// Left rail for /skills — groups skills by status (ACTIVE / DRAFT / DEPRECATED)
// with scope filter chips. Sprint σ.3.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import type { SkillFrontmatter } from '@/lib/skills/load-skill-file';

export interface SkillSummary {
  slug: string;
  frontmatter: SkillFrontmatter;
  bodyChars: number;
}

export type ScopeFilter = 'all' | 'global' | 'agent' | 'genre' | 'series' | 'episode';

interface SkillListProps {
  skills: readonly SkillSummary[];
  selectedSlug: string | null;
  scope: ScopeFilter;
  onScopeChange: (s: ScopeFilter) => void;
  onSelect: (slug: string) => void;
  onNew: () => void;
}

const SCOPE_CHIPS: Array<{ key: ScopeFilter; label: string }> = [
  { key: 'all',     label: 'All' },
  { key: 'global',  label: 'Global' },
  { key: 'agent',   label: 'Agent' },
  { key: 'genre',   label: 'Genre' },
  { key: 'series',  label: 'Series' },
  { key: 'episode', label: 'Episode' },
];

function scopeOf(s: SkillSummary): ScopeFilter {
  const a = s.frontmatter.applies_when;
  if (!a) return 'global';
  if (a.episode_id?.length) return 'episode';
  if (a.series_id?.length) return 'series';
  if (a.agent?.length) return 'agent';
  if (a.genre?.length) return 'genre';
  return 'global';
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:     'var(--accent-success, rgb(34, 197, 94))',
  DRAFT:      'var(--accent-warning, rgb(251, 146, 60))',
  DEPRECATED: 'var(--text-muted)',
};

export function SkillList({ skills, selectedSlug, scope, onScopeChange, onSelect, onNew }: SkillListProps) {
  const filtered = useMemo(
    () => (scope === 'all' ? skills : skills.filter((s) => scopeOf(s) === scope)),
    [skills, scope],
  );
  const groups = useMemo(() => {
    const buckets: Record<'ACTIVE' | 'DRAFT' | 'DEPRECATED', SkillSummary[]> = {
      ACTIVE: [],
      DRAFT: [],
      DEPRECATED: [],
    };
    for (const s of filtered) {
      const k = s.frontmatter.status as keyof typeof buckets;
      if (buckets[k]) buckets[k].push(s);
    }
    return buckets;
  }, [filtered]);

  return (
    <aside
      className="w-80 shrink-0 border-r border-glass flex flex-col"
      style={{ background: 'var(--bg-soft)' }}
    >
      <div className="px-4 py-3 border-b border-glass flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-text-primary">Skills</div>
          <div className="text-[11px] text-text-muted">{skills.length} total · {filtered.length} shown</div>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="text-xs px-2 py-1 rounded-md border border-glass-active hover:bg-[var(--panel-hover-bg)] transition-colors"
        >
          + New
        </button>
      </div>

      <div className="px-3 py-2 border-b border-glass flex flex-wrap gap-1.5">
        {SCOPE_CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onScopeChange(c.key)}
            className={cn(
              'text-[11px] px-2 py-0.5 rounded-full border transition-colors',
              scope === c.key
                ? 'border-glass-active text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
            style={scope === c.key ? { background: 'var(--panel-hover-bg)' } : undefined}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {(['ACTIVE', 'DRAFT', 'DEPRECATED'] as const).map((status) => {
          const items = groups[status];
          if (items.length === 0) return null;
          return (
            <div key={status}>
              <div className="px-2 pb-1 flex items-center gap-2">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: STATUS_COLOR[status] }}
                />
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  {status} ({items.length})
                </span>
              </div>
              <div className="space-y-0.5">
                {items.map((s) => {
                  const active = s.slug === selectedSlug;
                  return (
                    <button
                      key={s.slug}
                      type="button"
                      onClick={() => onSelect(s.slug)}
                      className={cn(
                        'w-full text-left px-2 py-1.5 rounded-md transition-colors',
                        active
                          ? 'bg-[var(--panel-hover-bg)] border border-glass-active'
                          : 'border border-transparent hover:bg-[var(--panel-hover-bg)]',
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-medium text-text-primary truncate flex-1">
                          {s.slug}
                        </span>
                        {s.frontmatter.hard && (
                          <Badge cssVar="--accent-danger" className="text-[9px]">HARD</Badge>
                        )}
                      </div>
                      <div className="text-[10px] text-text-muted line-clamp-2 mt-0.5">
                        {s.frontmatter.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center text-xs text-text-muted py-8">
            No skills match this scope filter.
          </div>
        )}
      </div>
    </aside>
  );
}
