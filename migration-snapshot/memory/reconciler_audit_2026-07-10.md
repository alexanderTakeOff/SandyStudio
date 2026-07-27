---
name: reconciler_audit_2026-07-10
description: "Reconciler audit — as-built it's a mode-blind fire hose that blindly auto-approves creative video/image gates; contradicts gate-decision taxonomy. OPEN: is it needed at all / in what form."
metadata: 
  node_type: memory
  type: project
  originSessionId: 0c669fa8-4de1-4bb4-8498-cbc2c625d955
---

# Reconciler — expectation vs implementation audit (2026-07-10)

Director's instinct: реконсайлер НЕ должен быть пожарным шлангом. Ожидание:
- **Reconciler = mechanical PUSHER, never the approver of creative gates.**
- **Mode 1/2:** только толкать по factory chain; аппрув = Директор (M1) / Директор+scope·EXEC-DIR-AI (M2).
- **Mode 3:** аппрув = критики в пределах ретраев → **Полина/AI-EP после лимита ретраев**; НЕ реконсайлер.
- Hard limits (Publish/LOCKED/Budget/Mode) = всегда Директор.

## Реализация НЕ соответствует. 5 расхождений (файлы:строки)
1. **Нет режимной осведомлённости.** `factory.ts:989` шлёт `reconcile/episode` после ЛЮБОГО агента, гейт — только `mechanicsAutoAdvanceEnabled()`; `reconcile-execute.ts:78` — то же; НИКТО не читает `governance_mode`. Mode 1/2/3/4 ведут себя одинаково при флаге ON.
2. **Флаг ГЛОБАЛЬНЫЙ env** — `production-plan.ts:96` (`process.env.MECHANICS_AUTO_ADVANCE`), не per-episode. Per-episode предохранитель только `reservedShots`(пилоты)+in-plan.
3. **Слепой аппрув creative** — `reconcile.ts:165-173`: `ref_image`+`video` = `STAGE_HAS_CRITIC=false` → auto-approve без критика/Полины/Директора. Видео = деньги.
4. **Само-противоречие кода.** `gate-decision.ts:34` классифицирует `EXEC-VGEN`/`EXEC-EREF` = **creative** («не авто-пасс»), `decideGate`: Mode 1/2/3 = require_human, только Mode4 = autonomous — но это «recorded, not enforced», реконсайлер его ОБХОДИТ. Две несовместимые модели автономии: таксономия (правильная, инертна) vs реконсайлер (фаершоз, живой).
5. **Нет слоя «Полина после лимита».** `reconcile.ts:142-148`: критик REVISE ≥ cap → HALT+эскалация ДИРЕКТОРУ, не Полине.

Правильно реализовано: критик-гейтовые планы (`ref_plan`/`shot_plan`) аппрувятся только на PASS критика (`reconcile.ts:130-139`); `reservedShots` исключены.

## OPEN DECISION (обсудить на свежую голову)
**Нужен ли реконсайлер вообще и в каком виде?** Варианты для обсуждения:
- убрать реконсайлер, оставить только `computeNextEvents`-каскад + ручные/критик-гейты;
- оставить, но привести к модели: (A) читать `governance_mode`; (B) Mode 1/2 = push-only (толкать механику/триггерить след. агента, НЕ аппрувить creative); (C) уважать `gate-decision.ts` таксономию (video/image через критика или Полину, не слепо); (D) слой «Полина после лимита ретраев» для Mode 3; (E) per-episode вместо глобального флага.

**Why:** слепой auto-approve видео в любом режиме = каскад в платную генерацию + реальный YouTube-паблиш, ограничен лишь `budget_ceiling`. Дистрибуция теперь НАСТОЯЩАЯ (EXEC-PUB real), так что фаершоз-смоук дошёл бы до реальной публикации.
**How to apply:** первый смоук с настоящей дистрибуцией гнать с `MECHANICS_AUTO_ADVANCE=OFF` (Mode 1/2, ручные гейты). Реконсайлер-развилку решать отдельной сессией ПЕРЕД тем как что-то менять. См. [[backlog_enable_mechanics_auto_advance_smoke]] [[autonomous_factory_architecture_doctrine]].
