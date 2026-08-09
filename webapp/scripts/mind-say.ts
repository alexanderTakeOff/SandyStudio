// Headless-слово Полине через МОСТ (наследник mind-post, Ф2 миграции).
//
// Старый mind-post собирал историю руками и бил в HTTP-роут копии; здесь — одна
// INSERT-строка в concierge_turns (мост подхватит и поведёт ход) плюс ожидание
// ответной assistant-строки. Память принадлежит СЕССИИ Полины, не этому скрипту.
//
//   npx tsx scripts/mind-say.ts --episode <uuid> "текст"
//   npx tsx scripts/mind-say.ts --episode <uuid> --file вопрос.md
//   echo "текст" | npx tsx scripts/mind-say.ts --episode <uuid> -
//   npx tsx scripts/mind-say.ts --episode <uuid> --cancel     ← оборвать ход
import { readFileSync } from 'node:fs';
import { sb } from './run/_env';
import { createThread, persistTurn, resolveOpenThreadId } from '../lib/concierge/threads';

const WAIT_MS = Number(process.env.MIND_SAY_WAIT_MS ?? 20 * 60 * 1000);
const POLL_MS = 3_000;

function usage(): never {
  console.error('usage: mind-say --episode <uuid> ("текст" | --file <path> | -) [--cancel]');
  process.exit(2);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const get = (k: string): string | null => {
    const i = argv.indexOf(k);
    return i >= 0 ? (argv[i + 1] ?? null) : null;
  };
  const episodeId = get('--episode') ?? process.env.RUN_EPISODE_ID ?? null;
  if (!episodeId) usage();
  const cancel = argv.includes('--cancel');

  const { data: ep, error: epErr } = await sb
    .from('episodes')
    .select('episode_code,series_id')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr || !ep) throw new Error(`эпизода ${episodeId} нет: ${epErr?.message ?? 'not found'}`);

  let threadId = await resolveOpenThreadId(sb as never, { episodeId, seriesId: ep.series_id });
  if (!threadId) {
    const thread = await createThread(sb as never, {
      episodeId,
      seriesId: ep.series_id,
      activeMode: '3',
      title: `mind ${ep.episode_code}`,
    });
    threadId = thread.id;
    console.log(`тред создан: ${threadId}`);
  }

  if (cancel) {
    // Нового event_type НЕТ (CHECK базы знает 10 значений) — отмена едет
    // обычным message с маркером в metadata; мост различает по нему.
    await persistTurn(sb as never, threadId, {
      role: 'director',
      event_type: 'message',
      content: '(отмена хода)',
      metadata: { cancel: true, for_bridge: true },
    });
    console.log('отмена отправлена — мост убьёт ход');
    return;
  }

  const fileArg = get('--file');
  const positional = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1]?.startsWith('--') !== true);
  const text = fileArg
    ? readFileSync(fileArg, 'utf8')
    : positional.includes('-')
      ? readFileSync(0, 'utf8')
      : positional[0];
  if (!text?.trim()) usage();

  const sentAt = new Date().toISOString();
  await persistTurn(sb as never, threadId, {
    role: 'director',
    event_type: 'message',
    content: text.trim(),
    metadata: { for_bridge: true },
  });
  console.log(`отправлено в тред ${threadId} (${ep.episode_code}); жду ответ моста…`);

  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const { data: replies } = await sb
      .from('concierge_turns')
      .select('role,content,metadata,created_at')
      .eq('thread_id', threadId)
      .gt('created_at', sentAt)
      .in('role', ['assistant', 'system'])
      .order('created_at', { ascending: true });
    const answer = (replies ?? []).find((r) => r.role === 'assistant');
    const failure = (replies ?? []).find(
      (r) => r.role === 'system' && (r.metadata as Record<string, unknown> | null)?.error,
    );
    if (answer) {
      const m = (answer.metadata ?? {}) as Record<string, unknown>;
      console.log('\n──── ответ Полины ────\n');
      console.log(answer.content);
      console.log(`\n[session ${String(m.session_id ?? '?').slice(0, 8)} · $${m.cost_usd ?? '?'} · turns ${m.num_turns ?? '?'}]`);
      return;
    }
    if (failure) {
      console.error('\n' + failure.content);
      process.exitCode = 1;
      return;
    }
  }
  console.error(`ответа нет за ${WAIT_MS / 60000} мин — проверь, жив ли мост (mind-bridge)`);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error('ERR:', e instanceof Error ? e.message : e);
  process.exit(1);
});
