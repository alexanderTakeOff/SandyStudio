// ──────────────────────────────────────────────────────────────────────────────
// lib/api/agent-names.ts
// Single source of truth for human-readable agent role names. Industry-standard
// short English terms used everywhere in user-facing UI / chat / reports.
//
// Director directive 2026-05-12:
//   "В Pipeline а также во всех окнах и сообщениях Где проходят имена агентов
//    чтобы они выходили на человеческом языке"
//
// Companion: lib/concierge/system-prompt-builder.ts AGENT_NAMES block uses
// the same labels so PA chat outputs them too.
// ──────────────────────────────────────────────────────────────────────────────

export const AGENT_DISPLAY_NAME: Readonly<Record<string, string>> = Object.freeze({
  // Execution (production) tier — short English industry-standard roles
  // Topic 3 (2026-06-02) rename map — single Critic word replaces the
  // Reviewer / Checker / Supervisor / "X's Critic" sprawl. Friendly subtitle
  // retained in pipeline-stages.ts ROW_DEFINITIONS.subtitle.
  'EXEC-ORCH':          'Showrunner',
  'EXEC-SW':            'Writer',
  'EXEC-SREV':          'Script Critic',
  'EXEC-STY':           'Production Designer',
  'EXEC-SB':            'Storyboard Artist',
  'EXEC-WCHK':          'Continuity Critic',
  'EXEC-CONT':          'Continuity Critic', // legacy alias of WCHK while CONT lands
  'EXEC-ARCH':          'Archivist',
  'EXEC-EREF':          'Reference Artist',
  'EXEC-EREF-DESIGNER': 'Reference Designer',
  'EXEC-EPREV':         'Reference Critic',
  'EXEC-VANIM':         'Video Designer',
  'EXEC-VPREV':         'Video Critic',
  'EXEC-EDIT':          'Editor',
  'EXEC-VGEN':          'Video Artist',
  'EXEC-MGEN':          'Composer',
  'EXEC-STITCH':        'Online Editor',
  'EXEC-COPY':          'Publicist',
  'EXEC-THUMB':         'Key Art Artist', // renders the approved Key Art plan
  'EXEC-PUB':           'Distribution',
  'EXEC-ANAL':          'Audience Analyst',
  'EXEC-BIBLE-AUTHOR':  'Bible Editor',
  'EXEC-CONC':          'Prod Assistant',
  'EXEC-DIR-AI':        'AI Executive Producer',

  // Strategic (board) tier
  'BOARD-MKT':          'Market Analyst',
  'BOARD-FIN':          'Line Producer',
  'BOARD-FAI':          'Brand Guardian',
  'BOARD-CRIT':         'Risk Analyst',
  'BOARD-CRD':          'Creative Director',

  // Artistic council tier
  'ART-PROD':           'Producer',
  'ART-HW':             'Head Writer',
  'ART-AD':             'Art Director',
  'ART-MS':             'Music Supervisor',
  'ART-WB':             'World Builder',
  'ART-CAST':           'Casting Director',
  'ART-CONT':           'Continuity Supervisor',

  // Director / human
  'Director':           'Director',
} as const);

/**
 * Returns the human-readable role name for an agent code, falling back to the
 * code itself if unmapped (so unknown agents still render something).
 */
export function agentDisplayName(code: string | null | undefined): string {
  if (!code) return '';
  return AGENT_DISPLAY_NAME[code] ?? code;
}

// ── Actor classification (2026-06-16) ────────────────────────────────────────
// Activity events carry an `actor`: a HUMAN Director is a UUID user id; an agent
// is its code (`EXEC-*`); the autonomous AI Director is `exec-dir-ai`; pipeline
// internals are null. The feed highlights human-Director commands so the
// Director can spot what HE did amid the automated stream.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ActorKind = 'director' | 'ai-director' | 'agent' | 'system';

export function actorKind(actor: string | null | undefined): ActorKind {
  if (!actor) return 'system';
  if (UUID_RE.test(actor)) return 'director';
  if (actor === 'exec-dir-ai' || actor === 'EXEC-DIR-AI') return 'ai-director';
  return 'agent';
}

/** True when an activity event was a HUMAN Director command (UUID actor). */
export function isDirectorAction(actor: string | null | undefined): boolean {
  return actorKind(actor) === 'director';
}

/**
 * Maps an array of agent codes to their display names. Skips empty / null
 * entries. Useful for pipeline stage rows that own multiple agents.
 */
export function agentDisplayNames(codes: ReadonlyArray<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const c of codes) {
    if (!c) continue;
    out.push(agentDisplayName(c));
  }
  return out;
}
