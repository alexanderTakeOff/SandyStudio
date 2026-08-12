// Ф5 миграции «Полина в харнес»: ЕДИНСТВЕННЫЙ HTTP-остаток пульта чата.
//
// Панель больше не гоняет агентский цикл по HTTP — она кладёт строку в
// concierge_turns (этим роутом), мост подхватывает и ведёт ход headless-сессии,
// ответ приходит панели Realtime'ом. Отмена — той же строкой с metadata.cancel.
//
// РАЗГОВОР ИДЁТ ПО СУЩНОСТИ (12.08): эпизод, сериал или студия. Тред уже несёт
// эту привязку (`concierge_threads.episode_id` / `series_id`), а сессия ума —
// карта на треде (0057). Поэтому роут принимает КОНТЕКСТ ОПЕРАТОРА, а не только
// эпизод: до этого разговоров уровня сериала и студии не существовало вовсе.
//
// В отличие от старого /api/mind/chat (D78 — без auth вовсе), вход только для
// Директора: requireDirector — тот же гейт, что у settings/approve.
import { NextResponse } from 'next/server';
import { requireDirector } from '@/lib/api/auth';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import {
  createThread,
  persistTurn,
  resolveOpenThreadId,
  readThreadMindSession,
  writeThreadMindSession,
} from '@/lib/concierge/threads';

export const runtime = 'nodejs';

interface TurnBody {
  /** Что открыто у Директора; `kind` выводится студией из маршрута. */
  scope?: { kind?: 'episode' | 'series' | 'studio'; episodeId?: string | null; seriesId?: string | null };
  /** Совместимость с прежним телом запроса. */
  episodeId?: string;
  text?: string;
  cancel?: boolean;
  reset?: boolean;
  /** Вкладка сайдбара — обстановка, в которой Директор говорит. */
  tab?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    await requireDirector();
  } catch {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: TurnBody;
  try {
    body = (await req.json()) as TurnBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 });
  }

  const episodeId = (body.scope?.episodeId ?? body.episodeId)?.trim() || null;
  const seriesId = body.scope?.seriesId?.trim() || null;
  if (!body.cancel && !body.reset && !body.text?.trim()) {
    return NextResponse.json({ ok: false, error: 'text required' }, { status: 400 });
  }

  const sb = createSupabaseServiceRoleClient();

  // Сущность разговора: эпизод (тогда его серия — из базы), иначе серия, иначе
  // студия. Ни одна из веток не обязательна — студийный тред законен.
  let threadSeriesId = seriesId;
  let title = 'mind студия';
  if (episodeId) {
    const { data: ep, error: epErr } = await sb
      .from('episodes')
      .select('episode_code,series_id')
      .eq('id', episodeId)
      .maybeSingle();
    if (epErr || !ep) return NextResponse.json({ ok: false, error: 'episode not found' }, { status: 404 });
    threadSeriesId = ep.series_id ?? seriesId;
    title = `mind ${ep.episode_code}`;
  } else if (seriesId) {
    const { data: se } = await sb.from('series').select('code').eq('id', seriesId).maybeSingle();
    title = `mind ${(se as { code?: string } | null)?.code ?? 'сериал'}`;
  }

  let threadId = await resolveOpenThreadId(sb as never, {
    episodeId,
    seriesId: episodeId ? threadSeriesId : seriesId,
  });
  // Каскад резолва отдаёт тред СЕРИАЛА, когда у эпизода своего ещё нет, —
  // для сессии ума это была бы чужая сущность. Тред заводим свой.
  if (threadId) {
    const { data: found } = await sb
      .from('concierge_threads')
      .select('episode_id,series_id')
      .eq('id', threadId)
      .maybeSingle();
    const f = (found ?? {}) as { episode_id?: string | null; series_id?: string | null };
    const sameEntity = episodeId
      ? f.episode_id === episodeId
      : seriesId
        ? !f.episode_id && f.series_id === seriesId
        : !f.episode_id && !f.series_id;
    if (!sameEntity) threadId = null;
  }
  if (!threadId) {
    const thread = await createThread(sb as never, {
      episodeId,
      seriesId: episodeId ? threadSeriesId : seriesId,
      activeMode: '3',
      title,
    });
    threadId = thread.id;
  }

  // НОВАЯ СЕССИЯ УМА (11.08). Шелл Полины залипает на незакрытой кавычке, и
  // новый ход этого НЕ лечит: `--resume` восстанавливает состояние вместе с
  // сессией. Лечит только сброс `session_id` — до сегодня его делали руками в
  // базе. Отличается от «Нового разговора»: тот архивирует ПЕРЕПИСКУ, этот
  // забывает ПАМЯТЬ Полины.
  if (body.reset) {
    const mind = await readThreadMindSession(sb as never, threadId);
    // Во время хода сбрасывать нельзя: завершаясь, мост запишет session_id
    // обратно (он читает карту в НАЧАЛЕ хода) — сброс молча откатился бы.
    if (mind.busy) {
      return NextResponse.json(
        { ok: false, error: 'Полина сейчас работает — сперва остановите ход, потом сбрасывайте сессию' },
        { status: 409 },
      );
    }
    await writeThreadMindSession(sb as never, threadId, {
      previous_session_id: mind.session_id ?? null,
      session_id: null,
      context_tokens: null,
    });
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
    metadata: body.cancel
      ? { cancel: true, for_bridge: true }
      : { for_bridge: true, ...(body.tab ? { tab: body.tab } : {}) },
  });

  return NextResponse.json({ ok: true, threadId, turnId: turn.id });
}
