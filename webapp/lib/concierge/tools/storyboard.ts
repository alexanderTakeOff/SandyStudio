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
import { resolveShotId } from '@/lib/api/shot-identity';
import { excludedShotIdsFromEpisodeMeta } from '@/lib/api/animatic-shotlist';
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
    "characters, location, its VIDEO approval status (approved / review / draft / none), " +
    "and whether it is excluded (a 'button' shot cut from the final cut). Also returns a " +
    "`videoSummary` rollup: which shots are awaiting your approval and which have no video yet. " +
    "**Call this whenever you need a shotId you don't already have** (e.g. 'next two shots', 'SH09', " +
    "mapping a Plan to its shot) OR to answer 'which shots still need approval / generation' — read " +
    "`videoSummary.awaiting_approval` (needs Director approval) and `videoSummary.missing` (no video yet). " +
    "Read-only. NEVER ask the Director for a shotId or which shots need approval — fetch it via this tool.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'listShots',
      description:
        'List shots from the APPROVED storyboard for one episode, each with its video ' +
        'approval status + excluded flag, plus a videoSummary of shots awaiting approval / ' +
        'missing video. Read-only.',
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

    // ── Per-shot VIDEO status + exclusion (Director 2026-07-03) ──────────────
    // Enrich each shot with its best VID-shot approval status + the episode's
    // excluded ("button") flag, plus a top-level rollup, so Polina can answer
    // "which shots still need approval / generation" from ONE call instead of
    // cross-matching the storyboard against VID assets by hand.
    const tokenOf = (s: string | null | undefined): string | null =>
      s ? s.match(/sh\d+/i)?.[0]?.toUpperCase() ?? null : null;

    const [vidRes, epRes] = await Promise.all([
      ctx.supabase
        .from('assets')
        .select('id,filename,status,metadata')
        .eq('episode_id', episodeId)
        .like('file_type', 'VID-shot%'),
      ctx.supabase
        .from('episodes')
        .select('metadata')
        .eq('id', episodeId)
        .maybeSingle(),
    ]);
    const excludedIds = excludedShotIdsFromEpisodeMeta(
      (epRes.data as { metadata?: unknown } | null)?.metadata,
    );
    const excludedTokens = new Set(
      [...excludedIds].map((e) => tokenOf(e)).filter((t): t is string => t !== null),
    );
    const isExcluded = (shotId: string): boolean =>
      excludedIds.has(shotId) || excludedTokens.has(tokenOf(shotId) ?? '');

    // Best VID-shot per shot token (APPROVED > REVIEW > REVISION > DRAFT).
    const STATUS_RANK: Record<string, number> = {
      APPROVED: 4, LOCKED: 4, REVIEW: 3, REVISION: 2, DRAFT: 1,
    };
    const bestVideoByToken = new Map<
      string,
      { id: string; filename: string; status: string; rank: number }
    >();
    for (const r of (vidRes.data ?? []) as Array<{
      id: string; filename: string; status: string; metadata?: unknown;
    }>) {
      const tok =
        tokenOf(resolveShotId({ metadata: r.metadata, content: null })) ??
        tokenOf(r.filename);
      if (!tok) continue;
      const rank = STATUS_RANK[r.status] ?? 0;
      const prev = bestVideoByToken.get(tok);
      if (!prev || rank > prev.rank) {
        bestVideoByToken.set(tok, { id: r.id, filename: r.filename, status: r.status, rank });
      }
    }
    const normVideo = (status: string): 'approved' | 'review' | 'draft' | 'none' =>
      status === 'APPROVED' || status === 'LOCKED'
        ? 'approved'
        : status === 'REVIEW' || status === 'REVISION'
          ? 'review'
          : status === 'DRAFT'
            ? 'draft'
            : 'none';
    const videoFor = (shotId: string) => {
      const v = bestVideoByToken.get(tokenOf(shotId) ?? '');
      return v
        ? { status: normVideo(v.status), asset_id: v.id, filename: v.filename }
        : { status: 'none' as const, asset_id: null, filename: null };
    };

    // Rollup over ALL shots (not just the act-filtered/capped view).
    const videoSummary = {
      total: all.length,
      approved: 0,
      awaiting_approval: [] as Array<{ shotId: string; asset_id: string; filename: string }>,
      missing: [] as string[],
      excluded: [] as string[],
      missing_note:
        'Shots with no VID-shot row: not generated yet. Excluded "button" shots are listed under `excluded`, never `missing`.',
    };
    for (const s of all) {
      if (isExcluded(s.shotId)) {
        videoSummary.excluded.push(s.shotId);
        continue;
      }
      const v = videoFor(s.shotId);
      if (v.status === 'approved') {
        videoSummary.approved++;
      } else if (v.asset_id) {
        videoSummary.awaiting_approval.push({
          shotId: s.shotId,
          asset_id: v.asset_id,
          filename: v.filename!,
        });
      } else {
        videoSummary.missing.push(s.shotId);
      }
    }

    const shots = capped.map((s) => ({
      ...s,
      excluded: isExcluded(s.shotId),
      video: videoFor(s.shotId),
    }));

    return ok(
      {
        episodeId,
        storyboardAssetId: data.id,
        storyboardFilename: data.filename,
        storyboardVersion: data.version,
        totalShots: all.length,
        returnedShots: shots.length,
        truncated: filtered.length > limit,
        actFilter: args.act ?? null,
        shots,
        videoSummary,
      },
      `${shots.length}/${all.length} shot(s) from storyboard ${data.filename} · video: ` +
        `${videoSummary.approved}/${all.length} approved, ${videoSummary.awaiting_approval.length} awaiting approval, ` +
        `${videoSummary.missing.length} missing, ${videoSummary.excluded.length} excluded.`,
    );
  },
};
