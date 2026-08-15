// Гейт-проверки для хуков клона Полины (Ф3 миграции). НЕ defineTool — это
// инфраструктура харнеса, не рука Полины: в реестр TOOLS.md и в карту маршрута
// не попадает.
//
//   npx tsx scripts/gate-check.ts --kind context  → 5-8 строк состояния эпизода в stdout
//
// `--kind spend` удалён 13.08 вместе с PreToolUse-хуком Полины: он дублировал
// `assertEpisodeReadyToSpend`, а потолок эпизода переехал туда же. Деньги считает и
// лимит держит КОД инструмента — одинаково для обеих рук, а не решётка над одной.
//
// Эпизод — ТОЛЬКО из RUN_EPISODE_ID (его выставляет мост на ход): хук не
// принимает эпизод аргументом, чтобы его нельзя было подменить из промпта.
import { sb } from './run/_env';
import { splitLedger, type BudgetSplit, type LedgerRow } from '../lib/budget-split';

// Деньги эпизода — ДВЕ РАЗНЫЕ ВЕЛИЧИНЫ; правило разделения общее с шапкой
// эпизода, чтобы Директор и гейт не считали по-разному (см. lib/budget-split).
async function spentUsd(episodeId: string): Promise<BudgetSplit> {
  const { data } = await sb
    .from('budget_log')
    .select('cost_usd,model_or_tier')
    .eq('episode_id', episodeId);
  return splitLedger((data ?? []) as LedgerRow[]);
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

    // НАСТРОЙКИ ЭПИЗОДА — в каждый ход (Директор, 10.08: «поменял настройки, а она
    // работала по умолчанию»). Событие `episode_settings_changed` уже будило ум, но
    // разбудить ≠ сообщить: в ходе он видел деньги и статус, а настроек не видел
    // никогда. Печатаем ЗНАЧЕНИЯ, а не «есть/НЕТ» — иначе строка не отвечает на
    // вопрос «чем я сейчас генерирую».
    const meta = (ep.metadata ?? {}) as Record<string, unknown>;
    const gen = (meta.generation_config ?? {}) as Record<string, Record<string, unknown>>;
    const v = gen.video ?? {};
    const i = gen.image ?? {};
    const videoLine = [v.provider_id, v.aspect_ratio, v.resolution, v.quality_tier]
      .filter(Boolean)
      .join(' · ');
    const imageLine = [i.provider_id, i.quality].filter(Boolean).join(' · ');
    console.log(`настройки видео: ${videoLine || 'НЕ ЗАДАНЫ — инструмент возьмёт умолчание'}`);
    console.log(`настройки кадра: ${imageLine || 'НЕ ЗАДАНЫ — инструмент возьмёт умолчание'}`);
    const modes = [
      meta.pipeline_mode ? `режим ${meta.pipeline_mode}` : null,
      meta.on_model_strictness ? `on-model ${meta.on_model_strictness}` : null,
      meta.prompt_revision_cap ? `правок промпта ≤${meta.prompt_revision_cap}` : null,
      meta.reference_regen_cap ? `перегенераций рефа ≤${meta.reference_regen_cap}` : null,
      meta.video_regen_cap ? `перегенераций клипа ≤${meta.video_regen_cap}` : null,
      Array.isArray(meta.delivery_targets) && meta.delivery_targets.length
        ? `доставка ${(meta.delivery_targets as string[]).join(',')}`
        : null,
    ].filter(Boolean);
    if (modes.length) console.log(`режимы и потолки: ${modes.join(' · ')}`);
    return;
  }

  console.error(`gate-check: неизвестный --kind «${kind}» (spend | context)`);
  process.exit(2);
}

main().catch((e) => {
  console.error('gate-check упал:', e instanceof Error ? e.message : e);
  process.exit(2);
});
