// ──────────────────────────────────────────────────────────────────────────────
// components/activity/ActivityEventRow.tsx
//
// ONE row renderer for every activity feed. Before this the same row markup was
// duplicated in three places (dashboard ActivityFeedZone, the full /activity
// page, and the per-episode panel) — so the Director-command highlight had to
// be added three times and was missed on the episode feed. Each caller keeps
// its own data fetch / filters / header; the ROW (severity bar, Director
// highlight, title, time, type, description, optional trailing control) lives
// here. New feed treatments (e.g. critic verdict in the title) now land once.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import type { ReactNode } from 'react';
import { isDirectorAction } from '@/lib/api/agent-names';

export interface ActivityEventLike {
  id: string;
  event_type: string;
  severity: string;
  title: string;
  description: string | null;
  actor: string | null;
  created_at: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  info: 'var(--accent-info)',
  warning: 'var(--accent-warning)',
  error: 'var(--accent-danger)',
};

export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export interface ActivityEventRowProps {
  event: ActivityEventLike;
  /** Show the raw `event_type` as a middle segment (the full feed page does). */
  showType?: boolean;
  /** Trailing control rendered on the right of the title row (e.g. open-preview). */
  trailing?: ReactNode;
}

export function ActivityEventRow({ event: e, showType, trailing }: ActivityEventRowProps) {
  const isDir = isDirectorAction(e.actor);
  return (
    <div
      className={`group flex gap-3 px-3 py-2 rounded-lg border ${
        isDir ? '' : 'border-glass bg-panel-glass-strong'
      }`}
      style={
        isDir
          ? {
              borderColor: 'color-mix(in oklab, var(--accent-primary) 45%, transparent)',
              background: 'color-mix(in oklab, var(--accent-primary) 8%, var(--bg-elevated))',
            }
          : undefined
      }
    >
      <div
        className="w-0.5 rounded-full self-stretch shrink-0"
        style={{
          background: isDir ? 'var(--accent-primary)' : SEVERITY_COLOR[e.severity] ?? 'var(--text-muted)',
          opacity: isDir ? 1 : 0.7,
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs">
          {isDir && (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider shrink-0"
              style={{
                background: 'color-mix(in oklab, var(--accent-primary) 20%, transparent)',
                color: 'var(--accent-primary)',
              }}
            >
              Director
            </span>
          )}
          <span className="text-text-primary font-medium flex-1 min-w-0 truncate">{e.title}</span>
          {showType && (
            <>
              <span className="text-text-muted">·</span>
              <span className="text-text-muted shrink-0">{e.event_type}</span>
            </>
          )}
          <span className="text-text-muted shrink-0">{relativeTime(e.created_at)}</span>
          {trailing}
        </div>
        {e.description && (
          <div className="text-[12px] text-text-secondary mt-1 leading-snug">{e.description}</div>
        )}
      </div>
    </div>
  );
}
