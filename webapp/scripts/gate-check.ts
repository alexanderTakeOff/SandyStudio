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

async function spentUsd(episodeId: string): Promise<number> {
  const { data } = await sb.from('budget_log').select('cost_usd').eq('episode_id', episodeId);
  return (data ?? []).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
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
    const spent = await spentUsd(episodeId);
    const ceiling = Number(ep.budget_ceiling ?? 0);
    if (ceiling > 0 && spent >= ceiling) {
      console.error(
        `${ep.episode_code}: потолок исчерпан — потрачено $${spent.toFixed(2)} из $${ceiling.toFixed(2)}. ` +
          'Поднять потолок может только Директор (Episode Settings).',
      );
      process.exit(2);
    }
    console.log(`gate ok · $${spent.toFixed(2)} из $${ceiling.toFixed(2)}`);
    return;
  }

  if (kind === 'context') {
    // Динамика для UserPromptSubmit — замена dynamic-части старого prompt.ts:
    // состояние СВЕЖЕЕ на каждый ход, а не на момент резюма сессии.
    const spent = await spentUsd(episodeId);
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
        ? `деньги: потрачено $${spent.toFixed(2)}, потолок НЕ ЗАДАН — до первой траты получи его у Директора`
        : `деньги: $${spent.toFixed(2)} из $${ceiling.toFixed(2)} (журнал budget_log — истина)`,
    );
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
