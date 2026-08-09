// Ф5 миграции «Полина в харнес»: ЕДИНСТВЕННЫЙ HTTP-остаток пульта чата.
//
// Панель больше не гоняет агентский цикл по HTTP — она кладёт строку в
// concierge_turns (этим роутом), мост подхватывает и ведёт ход headless-сессии,
// ответ приходит панели Realtime'ом. Отмена — той же строкой с metadata.cancel.
//
// В отличие от старого /api/mind/chat (D78 — без auth вовсе), вход только для
// Директора: requireDirector — тот же гейт, что у settings/approve.
import { NextResponse } from 'next/server';
import { requireDirector } from '@/lib/api/auth';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { createThread, persistTurn, resolveOpenThreadId } from '@/lib/concierge/threads';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    await requireDirector();
  } catch {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: { episodeId?: string; text?: string; cancel?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 });
  }
  const episodeId = body.episodeId?.trim();
  if (!episodeId) return NextResponse.json({ ok: false, error: 'episodeId required' }, { status: 400 });
  if (!body.cancel && !body.text?.trim()) {
    return NextResponse.json({ ok: false, error: 'text required' }, { status: 400 });
  }

  const sb = createSupabaseServiceRoleClient();
  const { data: ep, error: epErr } = await sb
    .from('episodes')
    .select('episode_code,series_id')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr || !ep) return NextResponse.json({ ok: false, error: 'episode not found' }, { status: 404 });

  let threadId = await resolveOpenThreadId(sb as never, { episodeId, seriesId: ep.series_id });
  if (!threadId) {
    const thread = await createThread(sb as never, {
      episodeId,
      seriesId: ep.series_id,
      activeMode: '3',
      title: `mind ${ep.episode_code}`,
    });
    threadId = thread.id;
  }

  const turn = await persistTurn(sb as never, threadId, {
    role: 'director',
    event_type: 'message',
    content: body.cancel ? '(отмена хода)' : body.text!.trim(),
    metadata: body.cancel ? { cancel: true, for_bridge: true } : { for_bridge: true },
  });

  return NextResponse.json({ ok: true, threadId, turnId: turn.id });
}
