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

  let body: { episodeId?: string; text?: string; cancel?: boolean; reset?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 });
  }
  const episodeId = body.episodeId?.trim();
  if (!episodeId) return NextResponse.json({ ok: false, error: 'episodeId required' }, { status: 400 });
  if (!body.cancel && !body.reset && !body.text?.trim()) {
    return NextResponse.json({ ok: false, error: 'text required' }, { status: 400 });
  }

  const sb = createSupabaseServiceRoleClient();
  const { data: ep, error: epErr } = await sb
    .from('episodes')
    .select('episode_code,series_id,metadata')
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

  // НОВАЯ СЕССИЯ УМА (11.08). Шелл Полины залипает на незакрытой кавычке, и
  // новый ход этого НЕ лечит: `--resume` восстанавливает состояние вместе с
  // сессией. Лечит только сброс `session_id` — до сегодня его делали руками в
  // базе. Отличается от «Нового разговора»: тот архивирует ПЕРЕПИСКУ, этот
  // забывает ПАМЯТЬ Полины.
  if (body.reset) {
    const meta = ((ep as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
    const mind = (meta.mind_session ?? {}) as {
      session_id?: string;
      busy?: { pid: number } | null;
    };
    // Во время хода сбрасывать нельзя: завершаясь, мост запишет session_id
    // обратно (он читает карту в НАЧАЛЕ хода) — сброс молча откатился бы.
    if (mind.busy) {
      return NextResponse.json(
        { ok: false, error: 'Полина сейчас работает — сперва остановите ход, потом сбрасывайте сессию' },
        { status: 409 },
      );
    }
    const nextMeta = {
      ...meta,
      mind_session: {
        ...mind,
        previous_session_id: mind.session_id ?? null,
        session_id: null,
        context_tokens: null,
        updated_at: new Date().toISOString(),
      },
    };
    const { error: updErr } = await sb.from('episodes').update({ metadata: nextMeta }).eq('id', episodeId);
    if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

    const note = await persistTurn(sb as never, threadId, {
      role: 'system',
      event_type: 'message',
      content: mind.session_id
        ? `Сессия ума перезапущена Директором. Прошлая сессия ${mind.session_id.slice(0, 8)} закрыта — следующий ход стартует с чистой памятью.`
        : 'Сессия ума и так была пуста — следующий ход стартует новой сессией.',
      metadata: { kind: 'mind_session_reset', previous_session_id: mind.session_id ?? null },
    });
    return NextResponse.json({ ok: true, threadId, turnId: note.id, reset: true });
  }

  const turn = await persistTurn(sb as never, threadId, {
    role: 'director',
    event_type: 'message',
    content: body.cancel ? '(отмена хода)' : body.text!.trim(),
    metadata: body.cancel ? { cancel: true, for_bridge: true } : { for_bridge: true },
  });

  return NextResponse.json({ ok: true, threadId, turnId: turn.id });
}
