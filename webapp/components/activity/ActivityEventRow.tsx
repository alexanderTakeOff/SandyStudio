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
import { actorKind, agentDisplayName } from '@/lib/api/agent-names';

export interface ActivityEventLike {
  id: string;
  event_type: string;
  severity: string;
  title: string;
  description: string | null;
  actor: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

type WhoKind = 'you' | 'polina' | 'agent' | 'ai' | 'system';

const SEVERITY_COLOR: Record<string, string> = {
  info: 'var(--accent-info)',
  warning: 'var(--accent-warning)',
  error: 'var(--accent-danger)',
};

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

/** Director-token actions are recorded with HIS uuid even when Polina fired them
 *  under his standing directive — the only signal is the "[Prod Assistant]" marker. */
function isPolinaProxy(e: ActivityEventLike): boolean {
  if ((e.description ?? '').startsWith('[Prod Assistant]')) return true;
  const reason = e.metadata?.reason;
  return typeof reason === 'string' && reason.startsWith('[Prod Assistant]');
}

interface Formatted {
  who: string;
  whoKind: WhoKind;
  action: string;
  verdict: string | null;
}

function formatActivity(e: ActivityEventLike): Formatted {
  const kind = actorKind(e.actor);
  const polina = kind === 'director' && isPolinaProxy(e);
  const who =
    kind === 'director'
      ? polina
        ? 'Polina'
        : 'You'
      : kind === 'ai-director'
        ? 'AI EP'
        : kind === 'agent'
          ? agentDisplayName(e.actor)
          : 'System';
  const whoKind: WhoKind =
    kind === 'director' ? (polina ? 'polina' : 'you') : kind === 'ai-director' ? 'ai' : kind === 'agent' ? 'agent' : 'system';

  // Verdict: explicit metadata wins; else a trailing "· PASS" on the title.
  let verdict = typeof e.metadata?.verdict === 'string' ? (e.metadata.verdict as string) : null;
  let title = e.title;
  const trailing = title.match(/·\s*([A-Z_]+)\s*$/);
  if (!verdict && trailing) verdict = trailing[1] ?? null;
  title = title.replace(/·\s*[A-Z_]+\s*$/, '').trim();

  const shot = (title.match(/SH\d+/) ?? [])[0] ?? null;

  let action = title;
  if (e.event_type === 'approval_granted' || /^[A-Z_]+ on /.test(title)) {
    const decisionRaw = (title.match(/^([A-Z_]+) on/) ?? [])[1] ?? 'APPROVE';
    const decision = decisionRaw.toLowerCase().replace('request_revision', 'revise');
    const assetKind = /shot_plan/.test(title)
      ? 'plan'
      : /ref_plan/.test(title)
        ? 'ref plan'
        : /VID-shot/.test(title)
          ? 'video'
          : /IMG-anchor/.test(title)
            ? 'anchor'
            : /SPC-brief/.test(title)
              ? 'brief'
              : 'asset';
    action = [decision, shot, assetKind].filter(Boolean).join(' ');
  } else if (e.event_type === 'manual_trigger') {
    const ag = (title.match(/EXEC-[A-Z-]+/) ?? [])[0];
    action = `trigger ${ag ? agentDisplayName(ag) : ''}${shot ? ` ${shot}` : ''}`.replace(/\s+/g, ' ').trim();
  } else if (kind === 'agent') {
    // Agent rows are logged in two shapes — factory's "Video Artist completed —
    // SH10" and the runner's "EXEC-VGEN completed (SS-…-SH10)". The agent name is
    // already the WHO chip, so reduce to verb + shot ("completed SH10"). Falls
    // back to the de-prefixed title when no verb is found.
    const verb = (title.match(/\b(started|completed|failed)\b/i) ?? [])[0];
    if (verb) {
      action = `${verb.toLowerCase()}${shot ? ` ${shot}` : ''}`;
    } else {
      const dn = agentDisplayName(e.actor);
      action = title.startsWith(dn) ? title.slice(dn.length).replace(/^\s*[—–-]?\s*/, '').trim() : title;
    }
  }

  return { who, whoKind, action: action || title, verdict };
}

const WHO_STYLE: Record<WhoKind, { bg: string; fg: string }> = {
  you: { bg: 'color-mix(in oklab, var(--accent-primary) 22%, transparent)', fg: 'var(--accent-primary)' },
  polina: { bg: 'color-mix(in oklab, var(--accent-info) 22%, transparent)', fg: 'var(--accent-info)' },
  ai: { bg: 'color-mix(in oklab, var(--accent-warning) 20%, transparent)', fg: 'var(--accent-warning)' },
  agent: { bg: 'color-mix(in oklab, var(--text-muted) 16%, transparent)', fg: 'var(--text-secondary)' },
  system: { bg: 'color-mix(in oklab, var(--text-muted) 14%, transparent)', fg: 'var(--text-muted)' },
};

function verdictColor(v: string): string {
  if (v === 'PASS' || v === 'PASS_WITH_UNCERTAINTY') return 'var(--accent-success)';
  if (v === 'FAIL' || v === 'REJECTED') return 'var(--accent-danger)';
  return 'var(--accent-warning)'; // REVISE / HALT / UNKNOWN
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
