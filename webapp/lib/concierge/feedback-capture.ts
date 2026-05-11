// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/feedback-capture.ts
//
// Detects director-side markers in Prod Assistant chat messages and writes
// structured feedback entries to a project-local log file. A long-running
// Claude Code session can `tail -F` that log via the Monitor tool and react
// to feedback in real time — closing the loop between Director's testing in
// the webapp and engineering work in the IDE.
//
// Markers (per Director directive 2026-05-11):
//   !todo [N] [text]   → bundle the last N PA turns + optional note as a
//                        feedback record requesting deeper analysis
//   !fb   [N] [text]   → same shape, treated as a smaller / quicker note
//
// The `===PAON/OFF===` toggle was deliberately rejected — too easy to
// forget OFF and flood the log.
// ──────────────────────────────────────────────────────────────────────────────

import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';
import type { ConciergeTurnRow } from './types';

export type FeedbackMarker = 'todo' | 'fb';

export interface ParsedMarker {
  kind: FeedbackMarker;
  /** How many prior turns the Director wants attached. Default 3, capped at 20. */
  windowSize: number;
  /** Optional text after the `[N]` argument. */
  note: string;
}

/**
 * `!todo` and `!fb` accept an optional integer right after the marker, then
 * an optional free-text note. Examples:
 *
 *   !fb               → kind='fb', N=3, note=''
 *   !todo 7           → kind='todo', N=7, note=''
 *   !fb mic flickers  → kind='fb', N=3, note='mic flickers'
 *   !todo 5 approval gate looks too strict
 *                     → kind='todo', N=5, note='approval gate ...'
 */
export function parseMarker(text: string): ParsedMarker | null {
  const m = text.trim().match(/^!(todo|fb)(?:\s+(\d+))?(?:\s+([\s\S]*))?$/i);
  if (!m) return null;
  const kind = m[1].toLowerCase() as FeedbackMarker;
  const n = m[2] ? Math.min(20, Math.max(1, parseInt(m[2], 10))) : 3;
  const note = (m[3] ?? '').trim();
  return { kind, windowSize: n, note };
}

interface CaptureInput {
  marker: ParsedMarker;
  threadId: string;
  episodeId: string | null;
  supabase: SupabaseClient<Database>;
  /** Absolute path to the worktree root where the .claude/ directory lives. */
  worktreeRoot: string;
}

interface CaptureResult {
  ok: boolean;
  /** Absolute path to the file the entry was appended to. */
  logPath: string;
  /** How many turns were captured. */
  turnCount: number;
  error?: string;
}

/**
 * Append a feedback entry to `.claude/pa-feedback.log` and return the path
 * for diagnostics. Always best-effort — never throws.
 */
export async function captureFeedback(input: CaptureInput): Promise<CaptureResult> {
  const { marker, threadId, episodeId, supabase, worktreeRoot } = input;
  const logDir = path.join(worktreeRoot, '.claude');
  const logPath = path.join(logDir, 'pa-feedback.log');

  // Pull the last N turns from this thread to give Claude context.
  // We grab N + a tiny buffer so the prior assistant reply is included.
  let turns: ConciergeTurnRow[] = [];
  try {
    const { data, error } = await supabase
      .from('concierge_turns')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(marker.windowSize + 2);
    if (error) {
      return { ok: false, logPath, turnCount: 0, error: error.message };
    }
    turns = ((data ?? []) as unknown as ConciergeTurnRow[]).reverse();
  } catch (err) {
    return {
      ok: false,
      logPath,
      turnCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const stamp = new Date().toISOString();
  const lines: string[] = [];
  lines.push(`===== !${marker.kind.toUpperCase()} ${stamp} thread=${threadId.slice(0, 8)} episode=${episodeId ?? '-'} =====`);
  if (marker.note) lines.push(`NOTE: ${marker.note}`);
  lines.push(`WINDOW: last ${marker.windowSize} turns (most recent first)`);
  lines.push('');

  // Print the most recent N turns oldest-first inside the block.
  const window = turns.slice(-marker.windowSize);
  for (const t of window) {
    const role = t.role.padEnd(9);
    const evt = t.event_type;
    const time = t.created_at.slice(11, 19);
    if (evt === 'tool_call') {
      const calls = ((t.metadata as { tool_calls?: Array<{ name: string; arguments: string }> })?.tool_calls ?? [])
        .map((c) => `${c.name}(${truncate(c.arguments, 120)})`)
        .join('; ');
      lines.push(`[${time}] ${role} 🔧 ${calls}`);
    } else if (evt === 'tool_result') {
      const meta = t.metadata as { tool_name?: string; ok?: boolean } | null;
      const ok = meta?.ok ? '✓' : '✗';
      lines.push(`[${time}] ${role} ↪ ${meta?.tool_name ?? '?'} ${ok}: ${truncate(t.content, 200)}`);
    } else {
      lines.push(`[${time}] ${role} ${truncate(t.content, 600)}`);
    }
  }
  lines.push('===== END =====');
  lines.push('');
  const blob = lines.join('\n') + '\n';

  try {
    await mkdir(logDir, { recursive: true });
    await appendFile(logPath, blob, 'utf8');
  } catch (err) {
    return {
      ok: false,
      logPath,
      turnCount: window.length,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  return { ok: true, logPath, turnCount: window.length };
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
