// ──────────────────────────────────────────────────────────────────────────────
// app/api/team-chat/post/route.ts
// Sprint α — Team-chat unified thread. 2026-05-14.
//
// Lets the CLI agent (Claude) drop messages into the PA chat thread the
// Director uses, so the three voices (Director, PA, Claude) share one
// channel:
//
//   Director writes in the webapp panel  → role=director turn
//   PA replies via /api/concierge/chat   → role=assistant turn
//   Claude curls this endpoint           → role=system, metadata.kind='claude_message'
//
// PA's system prompt lifts `claude_message` turns alongside pipeline events
// (block in lib/concierge/system-prompt-builder.ts), so her next reply is
// aware of what Claude said without explicit prompting.
//
// AUTH: Bearer token in `TEAM_CHAT_TOKEN` env var. Service-role-style trust
// — the CLI agent in the worktree holds the same .env.local. Distinct from
// the Supabase service role key so revoking it doesn't blow up backend ops.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { UnauthorizedError, ValidationError, NotFoundError } from '@/lib/api/errors';
import { persistTurn } from '@/lib/concierge/threads';
import { inngest } from '@/lib/inngest/client';
import type { Database } from '@/lib/supabase/types.gen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  // If omitted, the endpoint targets the latest open thread (single-Director
  // model). Callers usually omit and let the server pick.
  thread_id: z.string().uuid().optional(),
  content: z.string().trim().min(1).max(8000),
  // Author label rendered in the bubble. Default 'Claude' but kept open for
  // future agents (e.g. Polina extensions, evaluator agents, etc).
  author: z.string().trim().min(1).max(40).default('Claude'),
  // Optional structured signal forwarded into metadata for downstream tools.
  tag: z.string().trim().min(1).max(40).optional(),
});

function getAuthToken(req: Request): string | null {
  const h = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

export const POST = withApiHandler(async (req) => {
  const expected = process.env.TEAM_CHAT_TOKEN?.trim();
  if (!expected) {
    throw new Error('TEAM_CHAT_TOKEN env var is not configured');
  }
  // q3 (2026-06-12, Director: «авторизованное на действие лицо/роль»):
  // presenting the EXEC-DIR-AI role token (CLAUDE.md §4 delegation) marks the
  // turn as an AUTHORIZED PRINCIPAL — checkVerbalApproval then accepts its
  // approvals for Category-B actions in strict modes (hard limits stay
  // human-Director-only). The right rides on the ROLE TOKEN, not the author
  // label; the «Александр» masking workaround is retired — author can
  // honestly say «Тео».
  const dirAiToken = process.env.EXEC_DIR_AI_TOKEN?.trim();
  const presented = getAuthToken(req);
  const isAuthorizedPrincipal = Boolean(
    presented && dirAiToken && presented === dirAiToken,
  );
  if (!presented || (presented !== expected && !isAuthorizedPrincipal)) {
    throw new UnauthorizedError('Invalid or missing Bearer token for /api/team-chat/post');
  }

  const body = await parseJson(req, Body);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE service-role env is not configured');
  }
  const sb = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Resolve target thread.
  let threadId = body.thread_id;
  if (!threadId) {
    // Ф4.4 (тред = эпизод): при НЕСКОЛЬКИХ открытых тредах пост без thread_id —
    // ОТКАЗ с перечнем, а не угадывание. «Последний открытый глобально» молча
    // ронял сообщение в чужой сериал, стоило двум тредам жить параллельно.
    const { data: openThreads, error: latestErr } = await sb
      .from('concierge_threads')
      .select('id,episode_id,series_id,started_at')
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(10);
    if (latestErr) {
      throw new Error(`thread lookup failed: ${latestErr.message}`);
    }
    const open = openThreads ?? [];
    if (open.length === 0) {
      throw new ValidationError(
        'No open concierge thread to post into. Open the Prod Assistant panel in the webapp to start one, then retry.',
      );
    }
    if (open.length > 1) {
      const list = open
        .map((t) => `${t.id} (episode=${t.episode_id ?? '—'}, series=${t.series_id ?? '—'})`)
        .join('; ');
      throw new ValidationError(
        `Открыто ${open.length} тредов — пост без thread_id неоднозначен. Укажи thread_id явно. Открытые: ${list}`,
      );
    }
    threadId = open[0].id;
  } else {
    const { data: t, error: tErr } = await sb
      .from('concierge_threads')
      .select('id')
      .eq('id', threadId)
      .maybeSingle();
    if (tErr) throw new Error(`thread fetch failed: ${tErr.message}`);
    if (!t) throw new NotFoundError(`Concierge thread ${threadId}`);
  }

  // 2. Persist as system turn with kind=claude_message.
  const content = `**${body.author}:** ${body.content}`;
  const turn = await persistTurn(sb, threadId, {
    role: 'system',
    event_type: 'message',
    content,
    metadata: {
      kind: 'claude_message',
      author: body.author,
      tag: body.tag ?? null,
      posted_at: new Date().toISOString(),
      ...(isAuthorizedPrincipal ? { authorized_principal: true } : {}),
    },
  });

  // TD-20.B autonomy 2026-05-20 — nudge Polina so she can react to the
  // claude_message without waiting on Director input. Fire-and-forget; the
  // user has already received apiOk by the time Inngest is contacted.
  void inngest
    .send({
      name: 'sandystudio/pa/notify-needed',
      data: {
        threadId,
        source: 'claude_message',
        triggerId: turn.id,
      },
    })
    .catch((sendErr) => {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('[team-chat/post] pa/notify-needed send failed:', sendErr);
      }
    });

  return apiOk({
    thread_id: threadId,
    turn_id: turn.id,
    persisted: true,
    content,
  });
});
