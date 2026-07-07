// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/themes.ts
// PA tool for the Episode-Themes surface (q9a, 2026-06-30).
//
//   - listThemes   (read-only — list the existing theme bank)
//   - proposeTheme (mutating — verbal approval gated)
//
// Closes the smoke gap where Polina judged themes but had no hand to write the
// bank ("добавь в themes" was a no-op). She proposes ONE theme as a DRAFT; the
// Director re-statuses approved/invalidated freely in the Themes UI. Reuses the
// existing POST /api/series/{id}/themes route (slug-clash guard, provenance,
// activity event) instead of touching the DB directly — anti-additivity.
// ──────────────────────────────────────────────────────────────────────────────

import { seriesIdForEpisode } from '@/lib/api/series-bible';
import { gateMutation } from '../approval-check';
import { authHeaders, fail, ok, resolveEpisodeId, isUuid, type Tool, type ToolContext, type ToolResult } from './types';

type AnyArgs = Record<string, unknown>;

function safeParse(raw: string): AnyArgs {
  if (!raw || raw.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as AnyArgs;
    return {};
  } catch {
    return {};
  }
}

/** Resolve the target series UUID: explicit arg wins, else the bound episode's series. */
async function resolveSeriesId(
  args: { seriesId?: string | null; episodeId?: string | null },
  ctx: ToolContext,
): Promise<string | null> {
  if (isUuid(args.seriesId)) return args.seriesId;
  const episodeId = resolveEpisodeId(args, ctx);
  if (episodeId) {
    try {
      return await seriesIdForEpisode(ctx.supabase, episodeId);
    } catch {
      return null;
    }
  }
  return null;
}

interface ProposeThemeArgs {
  description: string;
  content: string;
  slug?: string;
  seriesId?: string | null;
  episodeId?: string | null;
}

export const proposeTheme: Tool<ProposeThemeArgs> = {
  name: 'proposeTheme',
  description:
    "Persist a NEW episode theme (reusable visual gag engine) as a DRAFT in the series Themes surface. Verbal approval required (Director must say 'да' / 'одобряю' / similar in the active thread before this call). Use after Director approves a theme you proposed, or when he says «добавь в themes». `description` is the ONE-LINER shown in the index (what the gag engine is, in a sentence); `content` is the full theme markdown (mechanism, escalation, why it fits the series). The theme lands in the Draft group — Director re-statuses approved/invalidated in the UI. Refuses to overwrite an existing theme slug.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'proposeTheme',
      description: 'Create a new DRAFT episode theme. Verbal approval required.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', minLength: 8, maxLength: 2000, description: 'One-liner for the index — what the gag engine is.' },
          content: { type: 'string', minLength: 20, maxLength: 200000, description: 'Full theme markdown (mechanism, escalation, series fit).' },
          slug: { type: 'string', maxLength: 80, description: 'Optional explicit slug; derived from the one-liner when omitted.' },
          seriesId: { type: 'string', description: 'Series UUID. Omit to use the open episode\'s series.' },
          episodeId: { type: 'string', description: 'Episode UUID — only used to derive the series when seriesId is omitted.' },
        },
        required: ['description', 'content'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const description = typeof obj.description === 'string' ? obj.description.trim() : '';
    if (description.length < 8) throw new Error('description (one-liner) is required, min 8 chars');
    const content = typeof obj.content === 'string' ? obj.content : '';
    if (content.trim().length < 20) throw new Error('content (full theme markdown) is required, min 20 chars');
    const slug = typeof obj.slug === 'string' && obj.slug.trim() ? obj.slug.trim() : undefined;
    const seriesId = typeof obj.seriesId === 'string' ? obj.seriesId : undefined;
    const episodeId = typeof obj.episodeId === 'string' ? obj.episodeId : undefined;
    return { description, content, slug, seriesId, episodeId };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const approval = gateMutation('proposeTheme', {
      mode: ctx.mode,
      turns: ctx.recentTurns ?? [],
    });
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }

    const seriesId = await resolveSeriesId(args, ctx);
    if (!seriesId) {
      return fail(
        'Could not resolve which series to add the theme to. Open an episode (so the thread binds its series) or pass seriesId.',
        'series_unresolved',
      );
    }

    try {
      const res = await fetch(`${ctx.appOrigin}/api/series/${seriesId}/themes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(ctx) },
        body: JSON.stringify({
          slug: args.slug,
          description: args.description,
          content: args.content,
          theme_status: 'draft',
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { data?: { id?: string; filename?: string }; error?: string }
        | null;
      if (!res.ok) {
        return fail(
          json?.error ?? `theme create failed (HTTP ${res.status})`,
          res.status === 400 ? 'invalid' : 'create_failed',
        );
      }
      const filename = json?.data?.filename ?? args.slug ?? 'theme';
      return ok(
        { themeId: json?.data?.id, filename, theme_status: 'draft', seriesId },
        `Added theme "${filename}" as DRAFT. Tell Director: review it in the Themes tab, then move it to Approved or Invalidated.`,
      );
    } catch (err) {
      return fail(`proposeTheme failed: ${err instanceof Error ? err.message : 'unknown'}`, 'create_failed');
    }
  },
};

interface ListThemesArgs {
  seriesId?: string | null;
  episodeId?: string | null;
}

export const listThemes: Tool<ListThemesArgs> = {
  name: 'listThemes',
  description:
    "Read-only. List the episode themes (reusable visual gag engines) already in the series Themes bank — each with slug, one-liner description, and status (approved / draft / invalidated). Call freely to answer «какие темы есть?» and BEFORE proposing a new theme, to avoid duplicating an existing gag engine. Resolves the series from the open episode when seriesId is omitted.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'listThemes',
      description: 'List existing episode themes for the series. Read-only, no approval needed.',
      parameters: {
        type: 'object',
        properties: {
          seriesId: { type: 'string', description: 'Series UUID. Omit to use the open episode\'s series.' },
          episodeId: { type: 'string', description: 'Episode UUID — only used to derive the series when seriesId is omitted.' },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const seriesId = typeof obj.seriesId === 'string' ? obj.seriesId : undefined;
    const episodeId = typeof obj.episodeId === 'string' ? obj.episodeId : undefined;
    return { seriesId, episodeId };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const seriesId = await resolveSeriesId(args, ctx);
    if (!seriesId) {
      return fail(
        'Could not resolve which series to list themes for. Open an episode (so the thread binds its series) or pass seriesId.',
        'series_unresolved',
      );
    }

    try {
      const res = await fetch(`${ctx.appOrigin}/api/series/${seriesId}/themes`, {
        method: 'GET',
        headers: { ...authHeaders(ctx) },
      });
      const json = (await res.json().catch(() => null)) as
        | { data?: { themes?: Array<{ slug?: string; description?: string; theme_status?: string }> }; error?: string }
        | null;
      if (!res.ok) {
        return fail(json?.error ?? `theme list failed (HTTP ${res.status})`, 'list_failed');
      }
      const themes = json?.data?.themes ?? [];
      return ok(
        {
          seriesId,
          count: themes.length,
          themes: themes.map((t) => ({
            slug: t.slug,
            description: t.description,
            theme_status: t.theme_status,
          })),
        },
        themes.length
          ? `${themes.length} theme(s) in the bank.`
          : 'No themes in the bank yet — propose one with proposeTheme after Director approval.',
      );
    } catch (err) {
      return fail(`listThemes failed: ${err instanceof Error ? err.message : 'unknown'}`, 'list_failed');
    }
  },
};
