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
    "Get the Series Bible sections (general_idea, characters, locations, objects, styles, audio) for a series. Returns metadata only — each asset's id, filename, slug, status, version, file_type, content_chars (size in chars). Use this to discover what exists. To read the actual markdown of one asset, call `getAsset(id)` afterwards. NEVER expects the full body in this list — content is stripped to keep PA context window safe (a single LOCKED Bible can exceed 400 KB and choke OpenAI).",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'listSeriesBibles',
      description: 'Read the Series Bible sections + their assets for one series (metadata only — call getAsset for actual content).',
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
    const payload = ((body as { data?: unknown })?.data ?? body) as {
      series?: unknown;
      sections?: Array<{
        section?: unknown;
        label?: unknown;
        assets?: Array<Record<string, unknown>>;
      }>;
    };

    // ── Strip content from each asset to protect PA context window ─────────
    // Sprint «Дизайнер и Аниматор» PA hygiene fix (Tео, 2026-05-19): a single
    // LOCKED Bible can exceed 400 KB markdown. Returning it in the tool_result
    // pumps that into Polina's OpenAI context on the next round and choked
    // gpt-5.5 silently (HTTP 200, no assistant reply). Now we return only
    // metadata + content_chars indicator; Polina calls getAsset(id) to fetch
    // any specific asset's actual content.
    const stripped = (payload.sections ?? []).map((sec) => ({
      section: sec.section,
      label: sec.label,
      assets: (sec.assets ?? []).map((a) => {
        const content = a.content;
        const contentChars =
          typeof content === 'string' ? content.length : null;
        const { content: _omit, ...rest } = a;
        void _omit;
        return { ...rest, content_chars: contentChars };
      }),
    }));

    return ok(
      { series: payload.series, sections: stripped },
      'Series Bible sections loaded (metadata only — use getAsset(id) for actual content).',
    );
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
  section: 'general_idea' | 'character' | 'location' | 'object' | 'style' | 'audio' | 'scene_master';
  slug?: string;
  content: string;
  description?: string;
}

export const setBibleContent: Tool<SetBibleContentArgs> = {
  name: 'setBibleContent',
  description:
    "Write Director-supplied verbatim text as a NEW DRAFT version of a Bible section. Use this when the Director dictates / pastes specific canon text and wants it persisted exactly as-is (not paraphrased by an agent). Creates a fresh version — old versions stay as history. Slug defaults to 'main' if omitted; pass a specific slug only when distinguishing sub-entries (e.g. character='sandy' vs 'pink_panther'). Never ask the Director about slug — call listSeriesBibles first to see existing slugs, or default to 'main'. Verbal approval required.",
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
            enum: ['general_idea', 'character', 'location', 'object', 'style', 'audio', 'scene_master'],
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
    // Slug is OPTIONAL — defaults to 'main' for any section. Per Director
    // feedback 2026-05-11, asking the human about technical slug strings
    // breaks the agent-led flow. PA may still pass an explicit slug when
    // creating distinct sub-entries (sandy / pink_panther / cafe etc.).
    const rawSlug = typeof obj.slug === 'string' ? obj.slug : undefined;
    const slug = rawSlug && rawSlug.trim() !== '' ? rawSlug.trim() : 'main';
    const content = typeof obj.content === 'string' ? obj.content : '';
    const description = typeof obj.description === 'string' ? obj.description : undefined;
    if (!seriesId) throw new Error('seriesId is required');
    const VALID_SECTIONS = ['general_idea', 'character', 'location', 'object', 'style', 'audio', 'scene_master'];
    if (!VALID_SECTIONS.includes(section as string)) {
      throw new Error(`section must be one of ${VALID_SECTIONS.join(', ')}`);
    }
    if (!/^[a-z0-9_-]+$/i.test(slug)) {
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
    const slug = args.section === 'general_idea' ? 'main' : (args.slug ?? 'main');
    const fileType = args.section === 'general_idea'
      ? 'SBL-general_idea'
      : `SBL-${args.section}_${slug}`;

    // Director directive 2026-05-11: do NOT bump a fresh DRAFT every time —
    // overwrite the latest DRAFT in place. Only create a new version when
    // the most recent existing version is LOCKED / APPROVED / REJECTED.
    const { data: existing } = await ctx.supabase
      .from('assets')
      .select('id,status,version,filename')
      .eq('series_id', args.seriesId)
      .eq('file_type', fileType)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const EDITABLE_STATUSES = new Set(['DRAFT', 'REVIEW', 'REVISION']);
    if (existing && EDITABLE_STATUSES.has(existing.status)) {
      // Overwrite in place via PUT /api/assets/[id]/content.
      const resp = await fetch(
        `${ctx.appOrigin.replace(/\/$/, '')}/api/assets/${encodeURIComponent(existing.id)}/content`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(ctx.cookieHeader ? { Cookie: ctx.cookieHeader } : {}),
          },
          body: JSON.stringify({ content: args.content }),
        },
      );
      let payload: unknown = null;
      try { payload = await resp.json(); } catch { /* */ }
      if (!resp.ok) {
        const message =
          payload && typeof payload === 'object' && 'error' in payload
            ? String((payload as { error: unknown }).error)
            : `content overwrite failed (HTTP ${resp.status})`;
        return fail(message, `http_${resp.status}`);
      }
      return ok(
        payload,
        `Bible ${args.section}/${slug} v${existing.version} (${existing.status}) overwritten in place. No new version created.`,
      );
    }

    // Latest version is LOCKED/APPROVED/REJECTED (or there's nothing yet) —
    // create a fresh DRAFT version via POST /api/series/[id]/bible.
    const body: Record<string, unknown> = {
      section: args.section,
      slug,
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
    return ok(
      payload,
      `Bible ${args.section}/${slug} created as a new DRAFT version (previous was ${existing?.status ?? 'absent'}).`,
    );
  },
};

interface RegenerateBibleImageArgs {
  assetId: string;
  prompt: string;
  quality?: 'low' | 'medium' | 'high';
  styleAnchorAssetId?: string | null;
}

export const regenerateBibleImage: Tool<RegenerateBibleImageArgs> = {
  name: 'regenerateBibleImage',
  description:
    "Reroll the image on an already-enriched Bible / IMG-* asset. Use after the asset has been enriched at least once (enrichBible already ran) and the Director wants a NEW image — either because the prompt has been rewritten via setBibleContent, or because the previous result didn't fit. Creates a new image version under metadata.image_prompt.history and updates staging_path/drive_* to the new image. Refuses if asset is LOCKED. Verbal approval required for each operation (one approval covers a batch only if Director said 'одобряю перегенерацию N локаций' in the same window). Does NOT work for first enrichment — use enrichBible for that.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'regenerateBibleImage',
      description:
        'Reroll an already-enriched Bible / IMG-* asset image with a (possibly edited) prompt. Verbal approval required.',
      parameters: {
        type: 'object',
        properties: {
          assetId: { type: 'string', description: 'Asset UUID. Must be non-LOCKED and already enriched.' },
          prompt: {
            type: 'string',
            description:
              "The image prompt to use for the new generation. Required. If the Director hasn't supplied a new prompt explicitly, use the current asset's image prompt (from a prior listSeriesBibles call or by reading the asset.metadata.image_prompt.history). For location assets, enforce: no characters, no people, no animals, no silhouettes — only environment, architecture, lighting, signage, neutral props.",
            minLength: 8,
            maxLength: 8000,
          },
          quality: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: "gpt-image-1 quality tier. Defaults to 'medium'.",
          },
          styleAnchorAssetId: {
            type: ['string', 'null'],
            description:
              "Optional override for the visual style anchor used during generation. Pass the UUID of a Bible style asset (SBL-style*) to swap the locked-style reference (e.g. when the active LOCKED style anchor diverges from current text canon, and the Director has approved a new style draft). Pass null to explicitly clear the anchor (rare). Omit to keep the asset's existing anchor.",
          },
        },
        required: ['assetId', 'prompt'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    if (typeof obj.assetId !== 'string' || !obj.assetId) {
      throw new Error('assetId is required');
    }
    if (typeof obj.prompt !== 'string' || obj.prompt.trim().length < 8) {
      throw new Error('prompt is required (min 8 chars)');
    }
    const quality =
      obj.quality === 'low' || obj.quality === 'medium' || obj.quality === 'high'
        ? obj.quality
        : undefined;
    let styleAnchorAssetId: string | null | undefined = undefined;
    if (obj.styleAnchorAssetId === null) styleAnchorAssetId = null;
    else if (typeof obj.styleAnchorAssetId === 'string' && obj.styleAnchorAssetId.length > 0) {
      styleAnchorAssetId = obj.styleAnchorAssetId;
    }
    return { assetId: obj.assetId, prompt: obj.prompt, quality, styleAnchorAssetId };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const approval = checkVerbalApproval(ctx.recentTurns ?? []);
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }
    const resp = await fetch(
      `${ctx.appOrigin.replace(/\/$/, '')}/api/assets/${encodeURIComponent(args.assetId)}/regenerate-image`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ctx.cookieHeader ? { Cookie: ctx.cookieHeader } : {}),
        },
        body: JSON.stringify({
          prompt: args.prompt,
          quality: args.quality ?? 'medium',
          directorConfirm: true,
          ...(args.styleAnchorAssetId !== undefined
            ? { style_anchor_asset_id: args.styleAnchorAssetId }
            : {}),
        }),
      },
    );
    let body: unknown = null;
    try {
      body = await resp.json();
    } catch {
      /* keep body null */
    }
    if (!resp.ok) {
      const message =
        body && typeof body === 'object' && 'error' in body
          ? String((body as { error: unknown }).error)
          : `regenerate-image failed (HTTP ${resp.status})`;
      return fail(message, `http_${resp.status}`);
    }
    // The route returns either {action: 'reroll', new_version, cost_usd, ...}
    // or {action_blocked: true, reason} (200 with status code embedded).
    const payload = (body as { data?: unknown })?.data ?? body;
    if (
      payload &&
      typeof payload === 'object' &&
      'action_blocked' in payload &&
      (payload as { action_blocked?: boolean }).action_blocked
    ) {
      const reason = String((payload as { reason?: string }).reason ?? 'action blocked');
      return fail(reason, 'action_blocked');
    }
    const versionInfo =
      payload && typeof payload === 'object' && 'new_version' in payload
        ? ` → v${(payload as { new_version: number }).new_version}`
        : '';
    const costInfo =
      payload && typeof payload === 'object' && 'cost_usd' in payload
        ? ` ($${(payload as { cost_usd: number }).cost_usd.toFixed(4)})`
        : '';
    return ok(payload, `Image regenerated${versionInfo}${costInfo}. Watch Bible / activity feed.`);
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// createSeries — Sprint «Дизайнер и Аниматор» follow-up 2026-05-19 (Тео)
// Mirrors the POST /api/series endpoint so the Director can spin up a fresh
// series from PA chat. Verbal approval gated.
// ──────────────────────────────────────────────────────────────────────────────

interface CreateSeriesArgs {
  code: string;
  title: string;
  audience?: 'adult' | 'kids' | 'mixed' | 'other';
  genre?: 'comedy' | 'drama' | 'doc' | 'sci_fi' | 'other';
  logline?: string;
  episode_budget_ceiling?: number;
}

export const createSeries: Tool<CreateSeriesArgs> = {
  name: 'createSeries',
  description:
    "Create a brand-new series (SS-S15, SS-S16, etc) in DRAFT status. Seeds the default Approval Authority Matrix automatically. Use when the Director wants to start a fresh series from scratch (new comedy, new genre experiment). Requires verbal approval. After creation, use setBibleContent to author the general_idea/main Bible section, then createEpisode to start the first episode.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'createSeries',
      description: 'Insert a new DRAFT series row + default authority matrix. Verbal approval required.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'Series code matching ^SS-(S\\d{2}|PILOT)$, e.g. "SS-S15" or "SS-PILOT".',
            pattern: '^SS-(S\\d{2}|PILOT)$',
          },
          title: { type: 'string', minLength: 1, maxLength: 80 },
          audience: { type: 'string', enum: ['adult', 'kids', 'mixed', 'other'] },
          genre: { type: 'string', enum: ['comedy', 'drama', 'doc', 'sci_fi', 'other'] },
          logline: { type: 'string', maxLength: 200 },
          episode_budget_ceiling: { type: 'number', exclusiveMinimum: 0 },
        },
        required: ['code', 'title'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const code = typeof obj.code === 'string' ? obj.code.trim() : '';
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    if (!/^SS-(S\d{2}|PILOT)$/.test(code)) {
      throw new Error('code must match ^SS-(S\\d{2}|PILOT)$ (e.g. SS-S15)');
    }
    if (title.length === 0) throw new Error('title is required');
    const audience =
      obj.audience === 'adult' ||
      obj.audience === 'kids' ||
      obj.audience === 'mixed' ||
      obj.audience === 'other'
        ? obj.audience
        : undefined;
    const genre =
      obj.genre === 'comedy' ||
      obj.genre === 'drama' ||
      obj.genre === 'doc' ||
      obj.genre === 'sci_fi' ||
      obj.genre === 'other'
        ? obj.genre
        : undefined;
    const logline = typeof obj.logline === 'string' ? obj.logline : undefined;
    const episode_budget_ceiling =
      typeof obj.episode_budget_ceiling === 'number' && obj.episode_budget_ceiling > 0
        ? obj.episode_budget_ceiling
        : undefined;
    return { code, title, audience, genre, logline, episode_budget_ceiling };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const approval = checkVerbalApproval(ctx.recentTurns ?? []);
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }

    const url = new URL('/api/series', ctx.appOrigin);
    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(ctx.cookieHeader ? { cookie: ctx.cookieHeader } : {}),
      },
      body: JSON.stringify({
        code: args.code,
        title: args.title,
        ...(args.audience ? { audience: args.audience } : {}),
        ...(args.genre ? { genre: args.genre } : {}),
        ...(args.logline ? { logline: args.logline } : {}),
        ...(args.episode_budget_ceiling
          ? { episode_budget_ceiling: args.episode_budget_ceiling }
          : {}),
      }),
    });
    let body: unknown = null;
    try {
      body = await resp.json();
    } catch {
      /* */
    }
    if (!resp.ok) {
      const errMsg =
        body && typeof body === 'object' ? JSON.stringify(body) : `HTTP ${resp.status}`;
      return fail(`createSeries failed: ${errMsg}`);
    }
    return ok(body, `Series ${args.code} "${args.title}" created.`);
  },
};

interface CopyAssetImageArgs {
  fromAssetId: string;
  toAssetId: string;
}

export const copyAssetImage: Tool<CopyAssetImageArgs> = {
  name: 'copyAssetImage',
  description:
    "Carry over the image fields (staging_path, drive_path, drive_file_id, drive_web_view_url, and image_prompt history if present) from one Bible asset to another. Use when the Director wants a canonical asset from a prior series (e.g. SS-S14 Sandy LOCKED) to become the starting reference image for the new series (e.g. SS-S15 Sandy DRAFT) WITHOUT regenerating. Preserves the target's text canon (content / description). Refuses on LOCKED target, missing source image, or source==target. Verbal approval required.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'copyAssetImage',
      description: 'Carry over image fields from one Bible asset to another (no regeneration).',
      parameters: {
        type: 'object',
        properties: {
          fromAssetId: { type: 'string', description: 'Source asset UUID (the one whose image you want to reuse).' },
          toAssetId: { type: 'string', description: 'Target asset UUID (the one being populated; text canon stays).' },
        },
        required: ['fromAssetId', 'toAssetId'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const fromAssetId = typeof obj.fromAssetId === 'string' ? obj.fromAssetId : '';
    const toAssetId = typeof obj.toAssetId === 'string' ? obj.toAssetId : '';
    if (!fromAssetId) throw new Error('fromAssetId required');
    if (!toAssetId) throw new Error('toAssetId required');
    return { fromAssetId, toAssetId };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const approval = checkVerbalApproval(ctx.recentTurns ?? []);
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }
    const resp = await fetch(
      `${ctx.appOrigin.replace(/\/$/, '')}/api/assets/${encodeURIComponent(args.toAssetId)}/copy-image-from`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ctx.cookieHeader ? { Cookie: ctx.cookieHeader } : {}),
        },
        body: JSON.stringify({ fromAssetId: args.fromAssetId, directorConfirm: true }),
      },
    );
    let body: unknown = null;
    try { body = await resp.json(); } catch { /* */ }
    if (!resp.ok) {
      const message =
        body && typeof body === 'object' && 'error' in body
          ? String((body as { error: unknown }).error)
          : `copy-image-from failed (HTTP ${resp.status})`;
      return fail(message, `http_${resp.status}`);
    }
    return ok(body, `Image fields copied. Target now shares the source's reference image.`);
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
