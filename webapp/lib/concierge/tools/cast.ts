// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/cast.ts
//
// PA tool for the ART-AD Casting stage (Phase D, 2026-06-14). Lets Polина draft
// the episode cast gallery (SPC-episode_cast) from a Director-dictated canon slug
// list. The REST route runs the canon-existence preflight HARD GATE; on a gap it
// returns a Polина-readable instruction (create the missing canon in the Library,
// or drop it from the cast). The DRAFT is then ratified by the Director via
// approveAsset — proposal → ratify, per the casting governance.
//
//   PA tool → POST /api/episodes/:id/cast → SPC-episode_cast DRAFT
// ──────────────────────────────────────────────────────────────────────────────

import { gateMutation } from '../approval-check';
import { authHeaders, fail, ok, resolveEpisodeId, type Tool, type ToolResult } from './types';

interface CastMember {
  slug: string;
  role?: string;
}
interface CastEpisodeArgs {
  cast: CastMember[];
  episodeId?: string;
  note?: string;
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

function parseCast(raw: unknown): CastMember[] {
  if (!Array.isArray(raw)) return [];
  const out: CastMember[] = [];
  for (const el of raw) {
    if (typeof el === 'string' && el.trim()) {
      out.push({ slug: el.trim() });
    } else if (el && typeof el === 'object') {
      const slug = (el as { slug?: unknown }).slug;
      if (typeof slug === 'string' && slug.trim()) {
        const role = (el as { role?: unknown }).role;
        out.push({ slug: slug.trim(), role: typeof role === 'string' ? role : undefined });
      }
    }
  }
  return out;
}

export const castEpisode: Tool<CastEpisodeArgs> = {
  name: 'castEpisode',
  description:
    "Draft the episode cast gallery (ART-AD Casting stage): the subset of the series " +
    "Library — characters, locations, objects by canon slug — that appears in THIS " +
    "episode. Anything not cast is scoped OUT of every downstream stage (kills the " +
    "anvil/vanity-style bleed). The route runs a canon-existence HARD GATE: every slug " +
    "must already have LOCKED canon, else it returns the missing list (create it in the " +
    "Library or drop it). Creates a DRAFT — the Director then ratifies via approveAsset. " +
    "Use when the Director dictates the cast list for an episode. Verbal approval required.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'castEpisode',
      description:
        'Draft the episode cast gallery (SPC-episode_cast) from canon slugs. Canon-existence gated. Verbal approval required.',
      parameters: {
        type: 'object',
        properties: {
          cast: {
            type: 'array',
            description:
              'Canon members cast into the episode. Each item is a Bible slug (character/location/object) with an optional role note.',
            items: {
              type: 'object',
              properties: {
                slug: { type: 'string', description: 'Bible canon slug, e.g. "sandy_hourglass", "elevator_button_cluster".' },
                role: { type: 'string', description: 'Short note: where/why it appears (e.g. "corridor call panel").', maxLength: 200 },
              },
              required: ['slug'],
              additionalProperties: false,
            },
            minItems: 1,
          },
          episodeId: {
            type: 'string',
            description: 'Episode UUID. Omit to use the active conversation episode.',
          },
          note: {
            type: 'string',
            description: "Short audit note — paraphrase the Director's casting intent.",
            maxLength: 500,
          },
        },
        required: ['cast'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const cast = parseCast(obj.cast);
    if (cast.length === 0) throw new Error('cast must list at least one canon slug');
    return {
      cast,
      episodeId: typeof obj.episodeId === 'string' ? obj.episodeId : undefined,
      note: typeof obj.note === 'string' ? obj.note : undefined,
    };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const episodeId = resolveEpisodeId(args, ctx);
    if (!episodeId) {
      return fail('episodeId required — no active episode in conversation context.');
    }
    const approval = gateMutation('castEpisode', {
      mode: ctx.mode,
      turns: ctx.recentTurns ?? [],
    });
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }

    const url = new URL(
      `/api/episodes/${encodeURIComponent(episodeId)}/cast`,
      ctx.appOrigin,
    );
    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders(ctx) },
      body: JSON.stringify({ cast: args.cast, note: args.note }),
    });
    let body: unknown = null;
    try {
      body = await resp.json();
    } catch {
      /* body may be empty */
    }
    if (!resp.ok) {
      const detail =
        body && typeof body === 'object' ? JSON.stringify(body) : `HTTP ${resp.status}`;
      if (typeof detail === 'string' && detail.includes('preflight FAILED')) {
        return fail(
          `Canon-existence preflight blocked the cast: some slugs have no LOCKED canon. ` +
            `Create them in the series Library first (enrichBible / setBibleContent + lock), ` +
            `or remove them from the cast list, then call castEpisode again. Detail: ${detail}`,
          'canon_missing',
        );
      }
      return fail(`cast failed: ${detail}`);
    }
    const slugs = args.cast.map((c) => c.slug).join(', ');
    return ok(
      body,
      `Cast drafted for the episode (${args.cast.length} members: ${slugs}). ` +
        `Awaiting Director ratification — approve the SPC-episode_cast asset to lock scoping.`,
    );
  },
};
