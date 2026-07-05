// ──────────────────────────────────────────────────────────────────────────────
// lib/api/activity-format.ts
//
// SINGLE source of truth for turning an activity/pipeline event into a scannable
// "WHO · action · verdict" line + its role-colour palette. Extracted 2026-07-05
// from components/activity/ActivityEventRow.tsx so BOTH surfaces that show
// pipeline events — the Activity feed AND the Polina↔Director chat pipeline rows
// — render through ONE formatter instead of two divergent implementations.
//
// Director directive (2026-07-04): every system event row must read as
//   WHO (the SUBJECT — writer wrote → Writer; critic approved → Critic;
//        artist finished → the artist), human role names not codes
//   · WHAT (plain action)
//   · TARGET (shot + asset kind + VERSION)
// with the role highlighted from the existing system palette.
//
// WHO + palette reuse lib/api/agent-names.ts (actorKind + agentDisplayName) so
// there is still exactly one agent-name mapping in the codebase.
// ──────────────────────────────────────────────────────────────────────────────

import { actorKind, agentDisplayName } from './agent-names';

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

export type WhoKind = 'you' | 'polina' | 'agent' | 'ai' | 'system';

export const SEVERITY_COLOR: Record<string, string> = {
  info: 'var(--accent-info)',
  warning: 'var(--accent-warning)',
  error: 'var(--accent-danger)',
};

/** Role → chip colour. The palette the Director asked to reuse "системно". */
export const WHO_STYLE: Record<WhoKind, { bg: string; fg: string }> = {
  you: { bg: 'color-mix(in oklab, var(--accent-primary) 22%, transparent)', fg: 'var(--accent-primary)' },
  polina: { bg: 'color-mix(in oklab, var(--accent-info) 22%, transparent)', fg: 'var(--accent-info)' },
  ai: { bg: 'color-mix(in oklab, var(--accent-warning) 20%, transparent)', fg: 'var(--accent-warning)' },
  agent: { bg: 'color-mix(in oklab, var(--text-muted) 16%, transparent)', fg: 'var(--text-secondary)' },
  system: { bg: 'color-mix(in oklab, var(--text-muted) 14%, transparent)', fg: 'var(--text-muted)' },
};

export function verdictColor(v: string): string {
  if (v === 'PASS' || v === 'PASS_WITH_UNCERTAINTY') return 'var(--accent-success)';
  if (v === 'FAIL' || v === 'REJECTED') return 'var(--accent-danger)';
  return 'var(--accent-warning)'; // REVISE / HALT / UNKNOWN
}

/** Director-token actions are recorded with HIS uuid even when Polina fired them
 *  under his standing directive — the only signal is the "[Prod Assistant]" marker. */
export function isPolinaProxy(e: ActivityEventLike): boolean {
  if ((e.description ?? '').startsWith('[Prod Assistant]')) return true;
  const reason = e.metadata?.reason;
  return typeof reason === 'string' && reason.startsWith('[Prod Assistant]');
}

export interface Formatted {
  who: string;
  whoKind: WhoKind;
  action: string;
  verdict: string | null;
}

/** Friendly asset-kind noun from the filename in the title, else the raw
 *  file_type carried in event metadata (agent-completion rows have no filename
 *  in the title, so metadata is the only source there). */
function deriveAssetKind(title: string, fileType: unknown): string {
  if (/shot_plan/.test(title)) return 'plan';
  if (/ref_plan/.test(title)) return 'ref plan';
  if (/VID-shot/.test(title)) return 'video';
  if (/IMG-anchor/.test(title)) return 'anchor';
  if (/SPC-brief/.test(title)) return 'brief';
  const ft = typeof fileType === 'string' ? fileType : '';
  if (/shot_plan|shot-plan/i.test(ft)) return 'plan';
  if (/ref_plan|ref-plan/i.test(ft)) return 'ref plan';
  if (/VID/i.test(ft)) return 'video';
  if (/IMG/i.test(ft)) return 'anchor';
  if (/brief/i.test(ft)) return 'brief';
  return '';
}

/**
 * Turn an activity/pipeline event into a one-line { who, action, verdict } plus
 * its palette kind. Pure — trivially unit-testable and shared by feed + chat.
 */
export function formatActivity(e: ActivityEventLike): Formatted {
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

  // Shot label = the bare SH token (refactor 2026-06-26 q8). SH is episode-unique,
  // so it alone identifies the shot; act/scene are gone from identity and no longer
  // shown. Reads the new `S15-E12-SH08` id and any legacy compound alike.
  const shot = (title.match(/SH\d+/i) ?? [])[0]?.toUpperCase() ?? null;
  // Asset version rides in the filename embedded in the title (…-v03-STATUS.ext)
  // for approval rows; agent-completion rows carry it in metadata.version (the
  // emitter reads it off the produced asset). Either source → "v03".
  const vMatch = title.match(/-v(\d+)-/i);
  const metaVersion = typeof e.metadata?.version === 'string' ? e.metadata.version : null;
  const versionTag = vMatch ? `v${vMatch[1]}` : metaVersion;
  const assetKind = deriveAssetKind(title, e.metadata?.file_type);

  let action = title;
  if (e.event_type === 'approval_granted' || /^[A-Z_]+ on /.test(title)) {
    const decisionRaw = (title.match(/^([A-Z_]+) on/) ?? [])[1] ?? 'APPROVE';
    const decision = decisionRaw.toLowerCase().replace('request_revision', 'revise');
    action = [decision, shot, assetKind || 'asset', versionTag].filter(Boolean).join(' ');
  } else if (e.event_type === 'manual_trigger') {
    const ag = (title.match(/EXEC-[A-Z-]+/) ?? [])[0];
    action = `trigger ${ag ? agentDisplayName(ag) : ''}${shot ? ` ${shot}` : ''}`.replace(/\s+/g, ' ').trim();
  } else if (kind === 'agent') {
    // Agent rows are logged in two shapes — factory's "Video Artist completed —
    // SH10" and the runner's "EXEC-VGEN completed (SS-…-SH10)". The agent name is
    // already the WHO chip, so reduce to verb + shot + kind + version
    // ("completed SH10 video v03"). Falls back to the de-prefixed title.
    const verb = (title.match(/\b(started|completed|failed)\b/i) ?? [])[0];
    if (verb) {
      action = [verb.toLowerCase(), shot, assetKind, versionTag].filter(Boolean).join(' ');
    } else {
      const dn = agentDisplayName(e.actor);
      action = title.startsWith(dn) ? title.slice(dn.length).replace(/^\s*[—–-]?\s*/, '').trim() : title;
    }
  }

  return { who, whoKind, action: action || title, verdict };
}
