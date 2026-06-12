// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/continuity-extract.ts
// Motor 1 extraction pass (2026-06-11) — the LLM half of Approach B.
//
// Turns each storyboard shot's action_prose + continuity_notes into a
// structured ShotStateDelta the deterministic state-ledger can judge.
// Extraction is MECHANICAL (no judging, no creativity) → claude-haiku-4-5,
// mirroring the CREAD skill-selection pattern. The judge lives in
// lib/agents/state-ledger.ts and never sees the LLM.
//
// Canonical naming is the weak link of the whole motor: the prompt pins one
// snake_case id per physical object across ALL shots; the parser narrows
// defensively and counts dropped entries so noise is visible, not silent.
// ──────────────────────────────────────────────────────────────────────────────

import {
  generateAnthropicText,
  AnthropicTextError,
  type AnthropicTextResult,
} from '../providers/anthropic-text';
import type { ShotStateDelta, StateAction } from '../state-ledger';
import type { StoryboardShotV2 } from '../../api/vgen-shot-helpers';

export const EXTRACT_MODEL = 'claude-haiku-4-5';
// 17-shot storyboard × ~4 actions × ~120 tokens of JSON ≈ 8k worst case.
export const EXTRACT_MAX_TOKENS = 8000;
// F6 (2026-06-12, E07 smoke): a 38-shot storyboard produced ~26k chars of
// JSON and hit the 8k output cap → EXTRACTION_FAILED (loud and graceful —
// the fail-visible design worked, but the whole episode lost the ledger).
// Extraction is now chunked: ≤ CHUNK_SIZE shots per call (12 × ~4 actions
// × ~120 tokens ≈ 5.8k, comfortable under the cap), deltas merged in code.
// Chunks run SEQUENTIALLY and each later chunk receives the canonical
// entity-id vocabulary accumulated so far — otherwise "lamp cord" in chunk
// 1 and "the cord" in chunk 3 mint two ids and the deterministic judge
// reports phantom entity-from-nowhere violations at every chunk boundary.
export const EXTRACT_CHUNK_SIZE = 12;

export class ContinuityExtractError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ContinuityExtractError';
  }
}

export interface ContinuityExtractResult {
  deltas: ShotStateDelta[];
  /** Raw entries the parser had to drop — surfaced in the WCHK report. */
  droppedEntries: number;
  costUsd: number;
  model: string;
}

const SYSTEM_PROMPT = [
  'You are a mechanical state-extraction pass for an animation studio QA pipeline.',
  'You read storyboard shots and emit, per shot, the entities touched and their state',
  'transitions as strict JSON. You do NOT judge quality, do NOT invent events that the',
  'prose does not state, and do NOT skip events the prose does state.',
  '',
  'CANONICAL NAMING (critical): one snake_case id per physical object, reused across',
  'ALL shots. If shot 3 says "lamp cord" and shot 8 says "the cord", both are',
  '"lamp_cord". Distinct similar objects get distinct ids ("desk_main",',
  '"round_side_table"). Never emit two ids for one object.',
].join('\n');

export function buildUserMessage(
  shots: readonly StoryboardShotV2[],
  /** Global ordinal of the first shot in this chunk (chunked extraction). */
  indexOffset = 0,
  /** Canonical entity ids minted by earlier chunks — MUST be reused. */
  knownEntityIds: readonly string[] = [],
): string {
  const lines = shots.map((s, i) => {
    const prose = s.action_prose ?? s.action ?? s.key_beat ?? '';
    const cont = s.continuity_notes ? ` || continuity_notes: ${s.continuity_notes}` : '';
    return `${indexOffset + i}. [${s.shot_id}] ${prose}${cont}`;
  });

  const knownIdsBlock =
    knownEntityIds.length > 0
      ? [
          '# Known canonical entity ids (from earlier shots of this storyboard)',
          'Reuse these EXACT ids whenever the prose refers to the same physical',
          'object — do NOT mint a new id for an object already listed here:',
          knownEntityIds.join(', '),
          '',
        ]
      : [];

  return [
    ...knownIdsBlock,
    '# Shots (timeline order)',
    ...lines,
    '',
    '# Task',
    'For every shot, extract the state-changing or state-revealing actions.',
    'Output exactly one fenced JSON block:',
    '',
    '```json',
    '{',
    '  "deltas": [',
    '    {',
    '      "shot_id": "<from input>",',
    '      "shot_index": <input ordinal>,',
    '      "entities_introduced": ["<ids first ESTABLISHED on screen in this shot>"],',
    '      "actions": [',
    '        {',
    '          "entity": "<canonical snake_case id>",',
    '          "verb": "<normalized verb, snake_case>",',
    '          "agent": "<character slug, or null when the event happens by itself>",',
    '          "presented_as_first": <true ONLY when the prose stages this as the FIRST discovery/encounter of the entity>,',
    '          "state_before": "<state the prose implies the entity is ALREADY in before the action, else null>",',
    '          "state_after": "<state after the action, snake_case>",',
    '          "cause": "<named narrative cause for agent-less events, else null>"',
    '        }',
    '      ]',
    '    }',
    '  ]',
    '}',
    '```',
    '',
    'Rules:',
    '- Shots with no state changes emit {"shot_id", "shot_index", "actions": []}.',
    '- agent: use null ONLY for autonomous events ("the light turns on"); use the',
    '  character slug when a character performs the action.',
    '- state_before: only when the prose IMPLIES a precondition (knocking over a pile',
    '  implies "standing"). Omit/null when the prose starts fresh.',
    '- Background/static set dressing is NOT an action; list it in',
    '  entities_introduced of the shot where it first appears, when visible.',
    '- The JSON must be valid. No prose outside the fenced block.',
  ].join('\n');
}

function narrowAction(raw: unknown): StateAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.entity !== 'string' || a.entity.length === 0) return null;
  if (typeof a.state_after !== 'string' || a.state_after.length === 0) return null;
  return {
    entity: a.entity,
    verb: typeof a.verb === 'string' ? a.verb : 'unknown',
    agent:
      typeof a.agent === 'string' ? a.agent : a.agent === null ? null : undefined,
    presented_as_first: a.presented_as_first === true,
    state_before:
      typeof a.state_before === 'string' && a.state_before.length > 0
        ? a.state_before
        : null,
    state_after: a.state_after,
    cause:
      typeof a.cause === 'string' && a.cause.length > 0 ? a.cause : null,
  };
}

/** Defensive narrowing of the Haiku JSON → typed deltas + dropped count. */
export function parseShotStateDeltas(body: unknown): {
  deltas: ShotStateDelta[];
  droppedEntries: number;
} {
  const root =
    body && typeof body === 'object'
      ? (body as { deltas?: unknown }).deltas
      : null;
  if (!Array.isArray(root)) {
    throw new ContinuityExtractError(
      'Extraction JSON has no "deltas" array — cannot run the state ledger',
    );
  }
  const deltas: ShotStateDelta[] = [];
  let dropped = 0;
  for (const raw of root) {
    if (!raw || typeof raw !== 'object') {
      dropped += 1;
      continue;
    }
    const d = raw as Record<string, unknown>;
    if (typeof d.shot_id !== 'string' || typeof d.shot_index !== 'number') {
      dropped += 1;
      continue;
    }
    const actionsRaw = Array.isArray(d.actions) ? d.actions : [];
    const actions: StateAction[] = [];
    for (const a of actionsRaw) {
      const narrowed = narrowAction(a);
      if (narrowed) actions.push(narrowed);
      else dropped += 1;
    }
    deltas.push({
      shot_id: d.shot_id,
      shot_index: d.shot_index,
      entities_introduced: Array.isArray(d.entities_introduced)
        ? d.entities_introduced.filter(
            (x): x is string => typeof x === 'string' && x.length > 0,
          )
        : undefined,
      actions,
    });
  }
  if (deltas.length === 0) {
    throw new ContinuityExtractError(
      'Extraction returned zero parseable shot deltas',
    );
  }
  return { deltas, droppedEntries: dropped };
}

/** Split shots into timeline-ordered chunks of at most EXTRACT_CHUNK_SIZE. */
export function chunkShots<T>(shots: readonly T[], size = EXTRACT_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < shots.length; i += size) {
    out.push(shots.slice(i, i + size) as T[]);
  }
  return out;
}

export async function runContinuityExtract(
  shots: readonly StoryboardShotV2[],
): Promise<ContinuityExtractResult> {
  if (shots.length === 0) {
    throw new ContinuityExtractError('No shots to extract state deltas from');
  }

  const chunks = chunkShots(shots);
  const allDeltas: ShotStateDelta[] = [];
  let droppedTotal = 0;
  let costTotal = 0;
  let modelUsed = EXTRACT_MODEL;
  // Vocabulary carried chunk-to-chunk so canonical naming stays global.
  const knownIds = new Set<string>();

  let offset = 0;
  for (const chunk of chunks) {
    let result: AnthropicTextResult;
    try {
      result = await generateAnthropicText({
        systemPrompt: SYSTEM_PROMPT,
        userMessage: buildUserMessage(chunk, offset, [...knownIds]),
        model: EXTRACT_MODEL,
        maxOutputTokens: EXTRACT_MAX_TOKENS,
        expectsJson: true,
        agentClass: 'checker', // F7: mechanical extraction rides the free tier
      });
    } catch (err: unknown) {
      if (err instanceof AnthropicTextError) {
        throw new ContinuityExtractError(
          `Extraction call failed (shots ${offset}-${offset + chunk.length - 1}): ${err.message}`,
          err,
        );
      }
      throw err;
    }

    if (!result.body) {
      throw new ContinuityExtractError(
        `No JSON block in extraction response (shots ${offset}-${offset + chunk.length - 1})`,
      );
    }

    const { deltas, droppedEntries } = parseShotStateDeltas(result.body);
    for (const d of deltas) {
      for (const id of d.entities_introduced ?? []) knownIds.add(id);
      for (const a of d.actions) knownIds.add(a.entity);
    }
    allDeltas.push(...deltas);
    droppedTotal += droppedEntries;
    costTotal += result.costUsd;
    modelUsed = result.model;
    offset += chunk.length;
  }

  return {
    deltas: allDeltas,
    droppedEntries: droppedTotal,
    costUsd: costTotal,
    model: modelUsed,
  };
}
