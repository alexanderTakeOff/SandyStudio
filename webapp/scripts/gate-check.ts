// Гейт-проверки для хуков клона Полины (Ф3 миграции). НЕ defineTool — это
// инфраструктура харнеса, не рука Полины: в реестр TOOLS.md и в карту маршрута
// не попадает.
//
//   npx tsx scripts/gate-check.ts --kind spend    → exit 2 + stderr, если тратить нельзя
//   npx tsx scripts/gate-check.ts --kind context  → 5-8 строк состояния эпизода в stdout
//
// Эпизод — ТОЛЬКО из RUN_EPISODE_ID (его выставляет мост на ход): хук не
// принимает эпизод аргументом, чтобы его нельзя было подменить из промпта.
import { sb } from './run/_env';
import { assertEpisodeReadyToSpend } from './run/_asset';

/**
 * Деньги эпизода — ДВЕ РАЗНЫЕ ВЕЛИЧИНЫ (Директор, 10.08).
 *
 * ПРЯМЫЕ — счета провайдеров: fal (видео), openai (кадры), anthropic по API
 * (агенты конвейера, в том числе те, кого Полина позвала через Agent/Task).
 * Их и ограничивает потолок эпизода.
 *
 * КОСВЕННЫЕ — ходы самой Полины: мост помечает их тиром «subscription-estimate»,
 * это оценка по прайсу API для сравнения нагрузки. С подписки эти доллары НЕ
 * списываются. До этой правки они лежали в одной куче с прямыми, и E06 подошёл
 * к потолку $70 с суммой $61.62, из которых реальными были ~$19: фиктивные
 * деньги остановили бы настоящее производство.
 */
const SUBSCRIPTION_TIER_MARK = 'subscription-estimate';

async function spentUsd(episodeId: string): Promise<{ direct: number; indirect: number }> {
  const { data } = await sb
    .from('budget_log')
    .select('cost_usd,model_or_tier')
    .eq('episode_id', episodeId);
  let direct = 0;
  let indirect = 0;
  for (const r of (data ?? []) as Array<{ cost_usd: number | null; model_or_tier: string | null }>) {
    const usd = Number(r.cost_usd) || 0;
    if (String(r.model_or_tier ?? '').includes(SUBSCRIPTION_TIER_MARK)) indirect += usd;
    else direct += usd;
  }
  return { direct, indirect };
}

async function main(): Promise<void> {
  const kind = process.argv[process.argv.indexOf('--kind') + 1];
  const episodeId = process.env.RUN_EPISODE_ID;
  if (!episodeId) {
    console.error('gate-check: RUN_EPISODE_ID не выставлен — ход без эпизода тратить не может');
    process.exit(2);
  }

  const { data: ep, error } = await sb
    .from('episodes')
    .select('episode_code,status,budget_ceiling,metadata')
    .eq('id', episodeId)
    .maybeSingle();
  if (error || !ep) {
    console.error(`gate-check: эпизод ${episodeId} не найден (${error?.message ?? '—'})`);
    process.exit(2);
  }

  if (kind === 'spend') {
    // Тот же гейт, что внутри инструментов (D90) — хук дублирует его ДО запуска
    // npx, чтобы отказ стоил ноль, и держит правило, даже если инструмент сломают.
    try {
      await assertEpisodeReadyToSpend(episodeId);
    } catch (e) {
      console.error(String(e instanceof Error ? e.message : e));
      process.exit(2);
    }
    const { direct, indirect } = await spentUsd(episodeId);

    // ЛИЧНЫЙ ЛИМИТ ПОЛИНЫ — ПРЕДУПРЕЖДЕНИЕ, НЕ СТЕНА (Директор, 10.08: «пока
    // горячимся — счётчика расходов в режиме подписки у нас ещё нет; warning да,
    // блокировать не надо»). Стена, построенная на цифре, которой мы сами не
    // доверяем, остановит работу по ложному поводу — а это дороже перерасхода.
    // Предупреждение живёт в контекстной строке каждого хода (--kind context).
    // Единственная настоящая стена здесь — потолок эпизода по ПРЯМЫМ тратам.
    const ceiling = Number(ep.budget_ceiling ?? 0);
    if (ceiling > 0 && direct >= ceiling) {
      console.error(
        `${ep.episode_code}: потолок исчерпан — ПРЯМЫХ трат $${direct.toFixed(2)} из $${ceiling.toFixed(2)}. ` +
          'Поднять потолок может только Директор (Episode Settings).',
      );
      process.exit(2);
    }
    console.log(
      `gate ok · прямые $${direct.toFixed(2)} из $${ceiling.toFixed(2)}` +
        ` · подписка (косвенно, деньгами не списывается) $${indirect.toFixed(2)}`,
    );
    return;
  }

  if (kind === 'context') {
    // Динамика для UserPromptSubmit — замена dynamic-части старого prompt.ts:
    // состояние СВЕЖЕЕ на каждый ход, а не на момент резюма сессии.
    const { direct, indirect } = await spentUsd(episodeId);
    const ceiling = ep.budget_ceiling === null ? null : Number(ep.budget_ceiling);
    const { data: assets } = await sb
      .from('assets')
      .select('status')
      .eq('episode_id', episodeId);
    const byStatus = new Map<string, number>();
    for (const a of assets ?? []) byStatus.set(a.status, (byStatus.get(a.status) ?? 0) + 1);
    const counts = [...byStatus.entries()]
      .sort()
      .map(([s, n]) => `${s}:${n}`)
      .join(' · ');
    console.log(`[СОСТОЯНИЕ ЭПИЗОДА — свежее, на этот ход]`);
    console.log(`${ep.episode_code} · статус ${ep.status}`);
    console.log(
      ceiling === null
        ? `деньги: ПРЯМЫХ трат $${direct.toFixed(2)}, потолок НЕ ЗАДАН — до первой траты получи его у Директора`
        : `деньги: ПРЯМЫЕ $${direct.toFixed(2)} из $${ceiling.toFixed(2)} — только они упираются в потолок (журнал budget_log — истина)`,
    );
    // Косвенные показываем ОТДЕЛЬНОЙ строкой и никогда не складываем с прямыми:
    // это нагрузка на подписку, а не счёт. Собственные ходы Полины — сюда;
    // агент, которого она позвала через Agent/Task, идёт по API и попадает в ПРЯМЫЕ.
    console.log(
      `подписка (косвенно, деньгами не списывается): $${indirect.toFixed(2)} — твои ходы; в потолок НЕ входят`,
    );
    // Личный лимит — предупреждение в КАЖДОМ ходе, без стены. Видно и тебе, и в
    // рапорте Директору; решение тратить дальше — твоё, ответ за него — тоже.
    const personalCap = Number((ep.metadata as Record<string, unknown> | null)?.concierge_cap_usd ?? 0);
    if (personalCap > 0 && direct >= personalCap) {
      console.log(
        `⚠️ ТВОЙ ЛИЧНЫЙ ЛИМИТ ПРЕВЫШЕН: прямых трат $${direct.toFixed(2)} при лимите $${personalCap.toFixed(2)}. ` +
          'Блокировки нет — есть твоя обязанность сказать об этом Директору ДО следующей платной операции.',
      );
    } else if (personalCap > 0) {
      console.log(`твой лимит: $${direct.toFixed(2)} из $${personalCap.toFixed(2)} (прямые траты)`);
    }
    console.log(`изделия: ${counts || 'нет'}`);
    return;
  }

  console.error(`gate-check: неизвестный --kind «${kind}» (spend | context)`);
  process.exit(2);
}

main().catch((e) => {
  console.error('gate-check упал:', e instanceof Error ? e.message : e);
  process.exit(2);
});
