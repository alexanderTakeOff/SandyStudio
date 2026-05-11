// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/series.ts
// Series + Bible tools for the new-episode-from-scratch smoke flow.
// ──────────────────────────────────────────────────────────────────────────────

import { checkVerbalApproval } from '../approval-check';
import { fail, ok, type Tool, type ToolContext, type ToolResult } from './types';

type AnyArgs = Record<string, unknown>;

interface ListSeriesArgs {
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  limit?: number;
}

export const listSeries: Tool<ListSeriesArgs> = {
  name: 'listSeries',
  description:
    'List SandyStudio series with their id, code (SS-S14, SS-PILOT, …), title, genre, audience. Use to discover series before creating a new episode or enriching its Bible.',
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'listSeries',
      description: 'List series available in the studio.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'] },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const status = obj.status === 'DRAFT' || obj.status === 'ACTIVE' || obj.status === 'ARCHIVED'
      ? obj.status
      : undefined;
    return {
      status,
      limit: typeof obj.limit === 'number' ? Math.min(100, Math.max(1, Math.floor(obj.limit))) : undefined,
    };
  },
  async execute(args, ctx): Promise<ToolResult> {
    let query = (ctx.supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          order: (c: string, o: { ascending: boolean }) => unknown;
        };
      };
    })
      .from('series')
      .select('id,code,title,genre,audience,logline,status,created_at')
      .order('created_at', { ascending: false });
    // Status filter applied via dynamic property chain because `series` is not
    // in the generated Database type yet.
    const qWithFilter = args.status
      ? (query as { eq: (c: string, v: string) => unknown }).eq('status', args.status)
      : query;
    const limited = (qWithFilter as { limit: (n: number) => Promise<{ data: unknown; error: { message: string } | null }> })
      .limit(args.limit ?? 50);
    const { data, error } = await limited;
    if (error) return fail(`series list failed: ${error.message}`);
    const rows = (data as Array<Record<string, unknown>>) ?? [];
    return ok(
      { series: rows },
      `${rows.length} series found${args.status ? ` (status=${args.status})` : ''}.`,
    );
  },
};

interface ListSeriesBiblesArgs {
  seriesId: string;
}

export const listSeriesBibles: Tool<ListSeriesBiblesArgs> = {
  name: 'listSeriesBibles',
  description:
    "Get the Series Bible sections (general_idea, characters, locations, objects, styles, audio) for a series. Returns each section with its assets (status, slug, description). Use before suggesting Bible improvements — read what's there first.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'listSeriesBibles',
      description: 'Read the Series Bible sections + their assets for one series.',
      parameters: {
        type: 'object',
        properties: {
          seriesId: { type: 'string', description: 'Series UUID.' },
        },
        required: ['seriesId'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    if (typeof obj.seriesId !== 'string' || !obj.seriesId) {
      throw new Error('seriesId is required');
    }
    return { seriesId: obj.seriesId };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const resp = await fetch(
      `${ctx.appOrigin.replace(/\/$/, '')}/api/series/${encodeURIComponent(args.seriesId)}/bible`,
      {
        method: 'GET',
        headers: { ...(ctx.cookieHeader ? { Cookie: ctx.cookieHeader } : {}) },
      },
    );
    let body: unknown = null;
    try { body = await resp.json(); } catch { /* ignore */ }
    if (!resp.ok) {
      const message =
        body && typeof body === 'object' && 'error' in body
          ? String((body as { error: unknown }).error)
          : `bible fetch failed (HTTP ${resp.status})`;
      return fail(message, `http_${resp.status}`);
    }
    // The envelope is `{ ok: true, data: { series, sections } }` from apiOk.
    const payload = (body as { data?: unknown })?.data ?? body;
    return ok(payload, 'Series Bible sections loaded.');
  },
};

interface EnrichBibleArgs {
  assetId: string;
}

export const enrichBible: Tool<EnrichBibleArgs> = {
  name: 'enrichBible',
  description:
    "Trigger EXEC-BIBLE-AUTHOR to enrich a DRAFT Bible asset: Sonnet generates a richer description + gpt-image-1 produces a reference image. Use after listSeriesBibles to pick which entry to enrich. Verbal approval required.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'enrichBible',
      description: 'Run the Bible-Author agent on a DRAFT Bible asset. Verbal approval required.',
      parameters: {
        type: 'object',
        properties: {
          assetId: { type: 'string', description: 'Bible asset UUID (SBL-*).' },
        },
        required: ['assetId'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    if (typeof obj.assetId !== 'string' || !obj.assetId) throw new Error('assetId is required');
    return { assetId: obj.assetId };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const approval = checkVerbalApproval(ctx.recentTurns ?? []);
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }
    const resp = await fetch(
      `${ctx.appOrigin.replace(/\/$/, '')}/api/assets/${encodeURIComponent(args.assetId)}/enrich`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ctx.cookieHeader ? { Cookie: ctx.cookieHeader } : {}),
        },
        body: JSON.stringify({ directorConfirm: true }),
      },
    );
    let body: unknown = null;
    try { body = await resp.json(); } catch { /* */ }
    if (!resp.ok) {
      const message =
        body && typeof body === 'object' && 'error' in body
          ? String((body as { error: unknown }).error)
          : `enrich failed (HTTP ${resp.status})`;
      return fail(message, `http_${resp.status}`);
    }
    return ok(body, 'Bible enrichment dispatched. Watch activity feed for completion.');
  },
};

interface SetBibleContentArgs {
  seriesId: string;
  section: 'general_idea' | 'character' | 'location' | 'object' | 'style' | 'audio';
  slug?: string;
  content: string;
  description?: string;
}

export const setBibleContent: Tool<SetBibleContentArgs> = {
  name: 'setBibleContent',
  description:
    "Write Director-supplied verbatim text as a NEW DRAFT version of a Bible section. Use this when the Director dictates / pastes specific canon text and wants it persisted exactly as-is (not paraphrased by an agent). Creates a fresh version — old versions stay as history. For section='general_idea' the slug is always 'main'. For other sections (character/location/object/style/audio) slug is required (e.g. 'sandy' for character). Verbal approval required.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'setBibleContent',
      description: "Persist Director's verbatim text as a new DRAFT version of a Bible section.",
      parameters: {
        type: 'object',
        properties: {
          seriesId: { type: 'string', description: 'Series UUID.' },
          section: {
            type: 'string',
            enum: ['general_idea', 'character', 'location', 'object', 'style', 'audio'],
          },
          slug: {
            type: 'string',
            description: "Section item slug (e.g. 'sandy', 'cafe'). Required for non-general_idea sections.",
            pattern: '^[a-z0-9_-]+$',
            minLength: 1,
            maxLength: 80,
          },
          content: {
            type: 'string',
            description: 'The verbatim canon text the Director wants saved.',
            minLength: 10,
            maxLength: 200000,
          },
          description: {
            type: 'string',
            description: 'Optional short one-liner describing this Bible entry.',
            maxLength: 20000,
          },
        },
        required: ['seriesId', 'section', 'content'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const seriesId = typeof obj.seriesId === 'string' ? obj.seriesId : '';
    const section = obj.section as SetBibleContentArgs['section'];
    const slug = typeof obj.slug === 'string' ? obj.slug : undefined;
    const content = typeof obj.content === 'string' ? obj.content : '';
    const description = typeof obj.description === 'string' ? obj.description : undefined;
    if (!seriesId) throw new Error('seriesId is required');
    const VALID_SECTIONS = ['general_idea', 'character', 'location', 'object', 'style', 'audio'];
    if (!VALID_SECTIONS.includes(section as string)) {
      throw new Error(`section must be one of ${VALID_SECTIONS.join(', ')}`);
    }
    if (section !== 'general_idea' && !slug) {
      throw new Error(`slug is required for section "${section}"`);
    }
    if (slug && !/^[a-z0-9_-]+$/i.test(slug)) {
      throw new Error('slug must contain only letters, numbers, _ or -');
    }
    if (content.length < 10) throw new Error('content too short (min 10 chars)');
    return { seriesId, section, slug, content, description };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const approval = checkVerbalApproval(ctx.recentTurns ?? []);
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }
    const body: Record<string, unknown> = {
      section: args.section,
      slug: args.section === 'general_idea' ? 'main' : (args.slug ?? 'main'),
      content: args.content,
    };
    if (args.description) body.description = args.description;

    const resp = await fetch(
      `${ctx.appOrigin.replace(/\/$/, '')}/api/series/${encodeURIComponent(args.seriesId)}/bible`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ctx.cookieHeader ? { Cookie: ctx.cookieHeader } : {}),
        },
        body: JSON.stringify(body),
      },
    );
    let payload: unknown = null;
    try { payload = await resp.json(); } catch { /* */ }
    if (!resp.ok) {
      const message =
        payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : `setBibleContent failed (HTTP ${resp.status})`;
      return fail(message, `http_${resp.status}`);
    }
    return ok(payload, `Bible ${args.section}/${body.slug} updated as a new DRAFT version. Director can approve it from Inbox or via approveAsset.`);
  },
};

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
