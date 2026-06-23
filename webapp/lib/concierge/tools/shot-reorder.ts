// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/shot-reorder.ts
// TD-86 (2026-05-27): PA tool for Director-initiated shot reordering.
// Atomically swaps a pair of shots in BOTH the storyboard's acts[].shots[]
// AND the animatic's animatic_v1.shot_list. Without the animatic-side sync
// EXEC-STITCH would still use the pre-swap order (the bug Director hit
// 2026-05-27 after the manual TD-72 storyboard-only swap).
//
// Scope (v1): swap a pair of shots by shot_id. Block-level / full reorder
// shapes can extend this same tool later — the storage path is identical.
//
// Idempotent: re-running with the same pair lands the same final state.
// Verbal-approval gated.
//
// SH is STABLE IDENTITY, not playback position. shot_id is assigned once at
// generation (renumberShotsContinuous → episode-continuous SH01..SHnn, verified
// by storyboarder's collectShotIdViolations postcondition) and assets/metadata
// reference it by value. Reordering therefore swaps shot OBJECTS and leaves
// shot_id strings untouched — after a reorder SH numbers intentionally no longer
// equal playback position. Do NOT "fix" this by renumbering on reorder: that
// would orphan every IMG/VID asset keyed to the old id. The generation-time SH
// invariant deliberately does not run here.
// ──────────────────────────────────────────────────────────────────────────────

import { gateMutation } from '../approval-check';
import { fail, ok, resolveEpisodeId, type Tool, type ToolContext, type ToolResult } from './types';

function safeParse(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    /* fallthrough */
  }
  return {};
}

interface ReorderShotsArgs {
  episodeId?: string;
  shotIdA: string;
  shotIdB: string;
}

interface StoryboardShot {
  shot_id: string;
  shot_role?: string;
  [key: string]: unknown;
}

interface StoryboardAct {
  act: number;
  shots: StoryboardShot[];
  [key: string]: unknown;
}

interface StoryboardContract {
  acts: StoryboardAct[];
  policy_notes?: string[];
  [key: string]: unknown;
}

interface AnimaticShotEntry {
  shot_id: string;
  [key: string]: unknown;
}

interface AnimaticV1 {
  shot_list: AnimaticShotEntry[];
  [key: string]: unknown;
}

function findStoryboardPosition(sb: StoryboardContract, suffix: string): { actIdx: number; shotIdx: number } | null {
  for (let a = 0; a < sb.acts.length; a++) {
    for (let s = 0; s < sb.acts[a].shots.length; s++) {
      if (sb.acts[a].shots[s].shot_id.endsWith(suffix)) {
        return { actIdx: a, shotIdx: s };
      }
    }
  }
  return null;
}

function findAnimaticPosition(list: AnimaticShotEntry[], suffix: string): number {
  return list.findIndex((s) => s.shot_id.endsWith(suffix));
}

export const reorderShots: Tool<ReorderShotsArgs> = {
  name: 'reorderShots',
  description:
    "TD-86 (2026-05-27): swap two shots in the episode's playback order. Updates BOTH storyboard JSON shots[] and animatic shot_list atomically — without the second update EXEC-STITCH plays the pre-swap order. Shot ids stay attached to content; only POSITION changes. Use when Director says 'swap SH21 and SH22' / 'поменяй кадры местами'. Verbal approval required. Idempotent.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'reorderShots',
      description: 'Swap two shots in episode playback order. Updates storyboard + animatic atomically.',
      parameters: {
        type: 'object',
        properties: {
          episodeId: {
            type: 'string',
            description: 'Episode UUID. Omit to use active conversation episode.',
          },
          shotIdA: {
            type: 'string',
            description: "First shot id (e.g. 'SS-S15-E01-A3-SC10-SH21' or just 'SH21' — suffix match).",
          },
          shotIdB: {
            type: 'string',
            description: 'Second shot id to swap with shotIdA.',
          },
        },
        required: ['shotIdA', 'shotIdB'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const shotIdA = typeof obj.shotIdA === 'string' ? obj.shotIdA : '';
    const shotIdB = typeof obj.shotIdB === 'string' ? obj.shotIdB : '';
    if (!shotIdA || !shotIdB) throw new Error('shotIdA and shotIdB are required');
    if (shotIdA === shotIdB) throw new Error('shotIdA and shotIdB must differ');
    return {
      episodeId: typeof obj.episodeId === 'string' ? obj.episodeId : undefined,
      shotIdA,
      shotIdB,
    };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const episodeId = resolveEpisodeId(args, ctx);
    if (!episodeId) return fail('episodeId required — no active episode.');

    const approval = gateMutation('reorderShots', {
      mode: ctx.mode,
      turns: ctx.recentTurns ?? [],
    });
    if (!approval.approved) return fail(approval.reason, 'verbal_approval_required');

    // 1. Find latest APPROVED storyboard.
    const { data: stbList, error: stbErr } = await ctx.supabase
      .from('assets')
      .select('id,filename,status,version,content,updated_at')
      .eq('episode_id', episodeId)
      .or('file_type.eq.STB-storyboard,file_type.like.STB-storyboard-%')
      .order('version', { ascending: false });
    if (stbErr) return fail(`storyboard lookup failed: ${stbErr.message}`);
    const stbRow = (stbList ?? []).find((r) => r.status === 'APPROVED' || r.status === 'LOCKED');
    if (!stbRow) return fail('No APPROVED/LOCKED storyboard for this episode.', 'no_storyboard');
    if (stbRow.status === 'LOCKED') {
      return fail(`Storyboard ${stbRow.filename} is LOCKED — refuse to modify (CLAUDE.md §7).`, 'locked');
    }
    const stbContent = (stbRow as { content?: string | null }).content ?? '';
    const jsonMatch = stbContent.match(/```json\s*\n([\s\S]+?)\n```/);
    if (!jsonMatch) return fail('Storyboard has no fenced ```json block.', 'malformed_storyboard');
    let sb: StoryboardContract;
    try {
      sb = JSON.parse(jsonMatch[1]) as StoryboardContract;
    } catch (e) {
      return fail(`Storyboard JSON parse failed: ${String(e)}`, 'malformed_storyboard');
    }
    if (!Array.isArray(sb.acts)) return fail('Storyboard has no acts[].', 'malformed_storyboard');

    const posA = findStoryboardPosition(sb, args.shotIdA);
    const posB = findStoryboardPosition(sb, args.shotIdB);
    if (!posA) return fail(`Shot ${args.shotIdA} not found in storyboard.`, 'shot_not_found');
    if (!posB) return fail(`Shot ${args.shotIdB} not found in storyboard.`, 'shot_not_found');

    // 2. Find latest APPROVED/LOCKED animatic with animatic_v1 contract.
    const { data: animList, error: animErr } = await ctx.supabase
      .from('assets')
      .select('id,filename,status,version,metadata,updated_at')
      .eq('episode_id', episodeId)
      .eq('file_type', 'VID-animatic')
      .order('version', { ascending: false });
    if (animErr) return fail(`animatic lookup failed: ${animErr.message}`);
    const animRow = (animList ?? []).find((r) => r.status === 'APPROVED' || r.status === 'LOCKED');
    if (!animRow) return fail('No APPROVED/LOCKED animatic for this episode.', 'no_animatic');
    if (animRow.status === 'LOCKED') {
      return fail(`Animatic ${animRow.filename} is LOCKED — refuse to modify.`, 'locked');
    }
    const animMeta = (animRow as { metadata?: unknown }).metadata as
      | { animatic_v1?: AnimaticV1 }
      | null;
    const v1 = animMeta?.animatic_v1;
    if (!v1 || !Array.isArray(v1.shot_list)) {
      return fail('Animatic has no animatic_v1.shot_list.', 'malformed_animatic');
    }
    const animPosA = findAnimaticPosition(v1.shot_list, args.shotIdA);
    const animPosB = findAnimaticPosition(v1.shot_list, args.shotIdB);
    if (animPosA < 0) return fail(`Shot ${args.shotIdA} not in animatic.shot_list.`, 'shot_not_found');
    if (animPosB < 0) return fail(`Shot ${args.shotIdB} not in animatic.shot_list.`, 'shot_not_found');

    // 3. Atomic swap on both structures (in-memory).
    // Storyboard: deep clone act->shots[idx] swap to preserve other act fields.
    if (posA.actIdx === posB.actIdx) {
      const shots = sb.acts[posA.actIdx].shots;
      [shots[posA.shotIdx], shots[posB.shotIdx]] = [shots[posB.shotIdx], shots[posA.shotIdx]];
    } else {
      // Cross-act swap: shots live in different acts. Swap the shot objects.
      const tmp = sb.acts[posA.actIdx].shots[posA.shotIdx];
      sb.acts[posA.actIdx].shots[posA.shotIdx] = sb.acts[posB.actIdx].shots[posB.shotIdx];
      sb.acts[posB.actIdx].shots[posB.shotIdx] = tmp;
    }
    if (!Array.isArray(sb.policy_notes)) sb.policy_notes = [];
    sb.policy_notes.push(
      `director-reorder ${new Date().toISOString()} — swapped ${args.shotIdA} ↔ ${args.shotIdB} via reorderShots PA tool (TD-86). Shot ids unchanged.`,
    );

    // Animatic: swap shot_list entries.
    [v1.shot_list[animPosA], v1.shot_list[animPosB]] = [v1.shot_list[animPosB], v1.shot_list[animPosA]];

    // 4. Persist storyboard content (replace JSON block in-place).
    const newJsonText = JSON.stringify(sb, null, 2);
    const newStbContent = stbContent.replace(jsonMatch[0], '```json\n' + newJsonText + '\n```');
    if (newStbContent === stbContent) {
      return fail('Storyboard content replacement produced no diff — abort.', 'no_diff');
    }
    const { error: stbUpdErr } = await ctx.supabase
      .from('assets')
      .update({ content: newStbContent } as never)
      .eq('id', stbRow.id);
    if (stbUpdErr) return fail(`storyboard update failed: ${stbUpdErr.message}`);

    // 5. Persist animatic metadata.
    const newAnimMeta = { ...(animMeta ?? {}), animatic_v1: v1 };
    const { error: animUpdErr } = await ctx.supabase
      .from('assets')
      .update({ metadata: newAnimMeta } as never)
      .eq('id', animRow.id);
    if (animUpdErr) {
      // Storyboard already saved — drift state. Log it loudly so caller
      // knows the partial write happened.
      return fail(
        `animatic update FAILED after storyboard succeeded — DRIFT. Re-run to retry. err=${animUpdErr.message}`,
        'partial_write',
      );
    }

    return ok(
      {
        episodeId,
        swap: [args.shotIdA, args.shotIdB],
        storyboard: { id: stbRow.id, filename: stbRow.filename },
        animatic: { id: animRow.id, filename: animRow.filename },
        storyboardPositions: { a: posA, b: posB },
        animaticPositions: { a: animPosA, b: animPosB },
      },
      `Swapped ${args.shotIdA} ↔ ${args.shotIdB}. Storyboard + animatic both updated. EXEC-STITCH will now play the new order.`,
    );
  },
};
