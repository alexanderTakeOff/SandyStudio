// ──────────────────────────────────────────────────────────────────────────────
// lib/budget-split.ts
//
// ОДНА правда о том, что в леджере деньги, а что — оценка (Директор, 10.08).
//
// ПРЯМЫЕ — счета провайдеров: fal (клипы), openai (кадры), anthropic по API
// (агенты конвейера, включая тех, кого позвал ум через Agent/Task). Только они
// упираются в потолок эпизода и только они показываются Директору как расход.
//
// КОСВЕННЫЕ — ходы ума на подписке: мост пишет их тиром «subscription-estimate».
// Это мера нагрузки по прайсу API; с подписки такие доллары не списываются.
//
// Модуль общий нарочно: до него разделение жило бы в двух местах (гейт хука и
// шапка эпизода), и первая же правка в одном месте развела бы цифры — Директор
// увидел бы одно, а Полину остановило бы другое.
// ──────────────────────────────────────────────────────────────────────────────

/** Метка тира, которой мост помечает собственные ходы ума. */
export const SUBSCRIPTION_TIER_MARK = 'subscription-estimate';

export interface LedgerRow {
  cost_usd: number | null;
  model_or_tier: string | null;
}

export interface BudgetSplit {
  /** Реальные счета провайдеров — упираются в потолок. */
  direct: number;
  /** Подписочная оценка ходов ума — деньгами не является. */
  indirect: number;
}

export function splitLedger(rows: readonly LedgerRow[]): BudgetSplit {
  let direct = 0;
  let indirect = 0;
  for (const r of rows) {
    const usd = Number(r.cost_usd) || 0;
    if (String(r.model_or_tier ?? '').includes(SUBSCRIPTION_TIER_MARK)) indirect += usd;
    else direct += usd;
  }
  return { direct, indirect };
}
