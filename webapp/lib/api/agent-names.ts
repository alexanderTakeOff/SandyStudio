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
  'EXEC-ORCH':          'Showrunner',
  'EXEC-SW':            'Writer',
  'EXEC-SREV':          'Story Editor',
  'EXEC-STY':           'Production Designer',
  'EXEC-SB':            'Storyboard Artist',
  'EXEC-WCHK':          'Script Supervisor',
  'EXEC-CONT':          'Script Supervisor', // legacy alias of WCHK while CONT lands
  'EXEC-ARCH':          'Archivist',
  'EXEC-EREF':          'Reference Artist',
  'EXEC-EREF-DESIGNER': 'Reference Designer',
  'EXEC-EPREV':         "Designer's Critic",
  'EXEC-VANIM':         'Video Designer',
  'EXEC-VPREV':         "Video Designer's Critic",
  'EXEC-GAGAD':         'Gag AD',
  'EXEC-EDIT':          'Editor',
  'EXEC-VGEN':          'Video Artist',
  'EXEC-MGEN':          'Composer',
  'EXEC-STITCH':        'Online Editor',
  'EXEC-COPY':          'Publicist',
  'EXEC-THUMB':         'Key Art Designer',
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
