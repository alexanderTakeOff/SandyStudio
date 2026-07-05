// ──────────────────────────────────────────────────────────────────────────────
// components/activity/ActivityEventRow.tsx
//
// ONE row renderer for every activity feed (dashboard zone, full /activity,
// per-episode panel). Director directive 2026-06-16: the feed was "War and
// Peace" — repeated governance boilerplate, and a single "DIRECTOR" chip that
// could not tell HIM apart from Polina acting under his standing directive.
//
// Collapsed row is one scannable line:  WHO · action · VERDICT · 4 mins ago · 13:31
//   WHO  — You (human) / Polina (PA proxy) / <Agent name> / AI EP / System
//   action — the title cleaned of SS- filename cruft
//   VERDICT — PASS / REVISE / … (critics), colour-coded
// Everything else (full description, raw title, event_type) goes into an
// expandable drawer toggled by the chevron.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, type ReactNode } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import {
  formatActivity,
  verdictColor,
  SEVERITY_COLOR,
  WHO_STYLE,
  type ActivityEventLike,
} from '@/lib/api/activity-format';

export type { ActivityEventLike } from '@/lib/api/activity-format';

export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} min${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return `${h} hr${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(diff / 86_400_000);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export interface ActivityEventRowProps {
  event: ActivityEventLike;
  /** Trailing control (e.g. open-preview) rendered after the timestamps. */
  trailing?: ReactNode;
}

export function ActivityEventRow({ event: e, trailing }: ActivityEventRowProps) {
  const [open, setOpen] = useState(false);
  const f = formatActivity(e);
  const highlight = f.whoKind === 'you' || f.whoKind === 'polina';
  const hasDetail = Boolean(e.description) || true; // raw title + type always available

  return (
    <div
      className={`group flex gap-2.5 px-3 py-2 rounded-lg border ${
        highlight ? '' : 'border-glass bg-panel-glass-strong'
      }`}
      style={
        highlight
          ? {
              borderColor: `color-mix(in oklab, ${WHO_STYLE[f.whoKind].fg} 40%, transparent)`,
              background: `color-mix(in oklab, ${WHO_STYLE[f.whoKind].fg} 7%, var(--bg-elevated))`,
            }
          : undefined
      }
    >
      <div
        className="w-0.5 rounded-full self-stretch shrink-0"
        style={{
          background: highlight ? WHO_STYLE[f.whoKind].fg : SEVERITY_COLOR[e.severity] ?? 'var(--text-muted)',
          opacity: highlight ? 1 : 0.7,
        }}
      />
      <div className="flex-1 min-w-0">
        {/* Collapsed one-liner: WHO · action · verdict · 4 mins ago · 13:31 */}
        <div className="flex items-center gap-1.5 text-xs">
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider shrink-0"
            style={{ background: WHO_STYLE[f.whoKind].bg, color: WHO_STYLE[f.whoKind].fg }}
          >
            {f.who}
          </span>
          <span className="text-text-primary font-medium truncate">{f.action}</span>
          {f.verdict && (
            <span
              className="px-1 py-0.5 rounded text-[9px] font-bold uppercase shrink-0"
              style={{
                background: `color-mix(in oklab, ${verdictColor(f.verdict)} 18%, transparent)`,
                color: verdictColor(f.verdict),
              }}
            >
              {f.verdict}
            </span>
          )}
          <div className="flex-1" />
          <span className="text-text-muted shrink-0">{relativeTime(e.created_at)}</span>
          <span className="text-text-muted/70 shrink-0 tabular-nums">· {clockTime(e.created_at)}</span>
          {trailing}
          {hasDetail && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="shrink-0 text-text-muted hover:text-text-primary"
              aria-label={open ? 'Collapse details' : 'Expand details'}
              title="Details"
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          )}
        </div>

        {/* Expanded drawer: the governance boilerplate + raw title + type. */}
        {open && (
          <div className="mt-1.5 pl-1 border-l border-glass space-y-1">
            {e.description && (
              <div className="text-[11px] text-text-secondary leading-snug whitespace-pre-wrap">
                {e.description}
              </div>
            )}
            <div className="text-[10px] text-text-muted font-mono">
              {e.event_type} · {e.title}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
