// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/storyboard.ts
//
// PA tools that read APPROVED STB-storyboard structure for an episode.
// Added 2026-05-22 to close a vocabulary gap Director surfaced: Polina was
// asking the Director for shotIds when she wanted to fire downstream tools
// (regenerateRefPlan / regenerateImageFromPlan). Her job is to find them
// from the canonical source, not to ask.
//
// `listShots(episodeId?)` returns the production-order list of shots from
// the latest APPROVED STB-storyboard for the episode, with shotId + act +
// brief action preview + characters + location, so Polina can:
//   - Resolve "SH09" / "the 9th shot" → full canonical shotId
//   - Spot continuity context (location, characters) without extra calls
//   - Pair a plan from listRefPlans with a shot when shotId mapping is
//     ambiguous
//
// Read-only — calls without verbal approval.
// ──────────────────────────────────────────────────────────────────────────────

import { listStoryboardShots } from '@/lib/api/vgen-shot-helpers';
import {
  fail,
  ok,
  resolveEpisodeCode,
  resolveEpisodeId,
  type Tool,
  type ToolResult,
} from './types';

interface ListShotsArgs {
  episodeId?: string;
  /** Optional: episode code (e.g., "SS-S15-E10") as fallback when episodeId is unavailable. */
  episodeCode?: string;
  /** Optional: filter to a single act for noisy episodes (1-based). */
  act?: number;
  /** Optional: cap on returned shots (default 200). */
  limit?: number;
}

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

export const listShots: Tool<ListShotsArgs> = {
  name: 'listShots',
  description:
    "List every shot from the APPROVED storyboard for one episode in production order. " +
    "Returns each shot's canonical shotId, act + index, shot_role, action preview, " +
    "characters, and location. **Call this whenever you need a shotId you don't already have** — " +
    "e.g. Director says 'next two shots' or 'SH09', or you need to map a Plan to its shot. " +
    "Read-only. NEVER ask the Director for a shotId — fetch it via this tool.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'listShots',
      description:
        'List shots from the APPROVED storyboard for one episode. Read-only.',
      parameters: {
        type: 'object',
        properties: {
          episodeId: {
            type: 'string',
            description:
              'Episode UUID. Omit to use active conversation episode.',
          },
          episodeCode: {
            type: 'string',
            description:
              'Episode code (e.g., "SS-S15-E10") as fallback when episodeId is unavailable.',
          },
          act: {
            type: 'number',
            description:
              'Optional act filter (1-based). Omit to return all acts.',
          },
          limit: {
            type: 'number',
            description: 'Optional cap on rows (default 200).',
          },
        },
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    return {
      episodeId:
        typeof obj.episodeId === 'string' ? obj.episodeId : undefined,
      episodeCode:
        typeof obj.episodeCode === 'string' ? obj.episodeCode : undefined,
      act:
        typeof obj.act === 'number' && Number.isFinite(obj.act)
          ? obj.act
          : undefined,
      limit:
        typeof obj.limit === 'number' && Number.isFinite(obj.limit)
          ? Math.max(1, Math.min(1000, Math.round(obj.limit)))
          : undefined,
    };
  },
  async execute(args, ctx): Promise<ToolResult> {
    let episodeId = resolveEpisodeId(args, ctx);
    const episodeCodeUsed = resolveEpisodeCode(args, ctx);

    // Fallback: if episodeId not available, try to resolve via episodeCode
    if (!episodeId && episodeCodeUsed) {
      const { data: ep } = await ctx.supabase
        .from('episodes')
        .select('id')
        .eq('episode_code', episodeCodeUsed)
        .maybeSingle();
      episodeId = ep?.id ?? null;
      if (!episodeId) {
        return fail(
          `Could not resolve episode code "${episodeCodeUsed}" — not found in database.`,
        );
      }
    }

    if (!episodeId) {
      return fail(
        'episodeId required — provide episodeId, episodeCode, or set active episode in conversation context.',
      );
    }

    // Find the latest APPROVED STB-storyboard for the episode. Storyboards
    // can have revisions; we want the latest APPROVED version.
    const { data, error } = await ctx.supabase
      .from('assets')
      .select('id,filename,status,version,content,created_at')
      .eq('episode_id', episodeId)
      .eq('file_type', 'STB-storyboard')
      .eq('status', 'APPROVED')
      .order('version', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      return fail(`storyboard fetch failed: ${error.message}`);
    }
    if (!data) {
      return fail(
        `No APPROVED STB-storyboard found for episode ${episodeId}. ` +
          'Storyboard must be approved before shots can be listed.',
        'no_approved_storyboard',
      );
    }
    const content = (data as { content?: string | null }).content ?? '';
    if (!content.trim()) {
      return fail(
        `STB-storyboard asset ${data.id} has empty content.`,
        'empty_content',
      );
    }

    const all = listStoryboardShots(content);
    const filtered =
      typeof args.act === 'number'
        ? all.filter((s) => s.act === args.act)
        : all;
    const limit = args.limit ?? 200;
    const capped = filtered.slice(0, limit);

    return ok(
      {
        episodeId,
        storyboardAssetId: data.id,
        storyboardFilename: data.filename,
        storyboardVersion: data.version,
        totalShots: all.length,
        returnedShots: capped.length,
        truncated: filtered.length > limit,
        actFilter: args.act ?? null,
        shots: capped,
      },
      `${capped.length}/${all.length} shot(s) from storyboard ${data.filename}`,
    );
  },
};
