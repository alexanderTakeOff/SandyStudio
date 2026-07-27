---
name: backlog_td_05s_delete_flag
description: "TD — honor the 0.5s \"deleted shot\" flag in CODE on the generation side + stitch missing-check (currently only stitch-exclusion honors it)."
metadata: 
  node_type: memory
  type: project
  originSessionId: 3d8ced24-88af-40e0-9815-b140b90a447b
---

# TD — 0.5s = «удалён» флаг: соблюдать в коде (генерация + stitch-missing)

> ✅ **RESOLVED 2026-07-03 (commit `aa52384`).** Директор поднял до явного статуса:
> новый SSOT `episodes.metadata.excluded_shot_ids[]` (стадия-независимо, кебаб-тумблер),
> `isDeletedShot(shot,overrides,excludedIds?)` = флаг ИЛИ ≤0.5 (legacy back-compat).
> Generation-skip закрыт (next-events грани + $0-пояс в exec-vgen). listShots отдаёт
> `excluded`-бакет (не «missing»). Route `POST /api/episodes/[id]/shot-exclusion`.
> ≤0.5-хак остаётся honored, но тумблер — канонический путь вперёд.

**Директор 2026-06-22:** `duration_seconds == 0.5` в animatic `director_overrides[shot_id]`
= флаг «шот удалён» → исключается из просмотра и финальной сборки, **и в генерацию его
запускать НЕ нужно в принципе**. Директор: «лучше в код — в TD» (не рантайм-правило Тео).

## Текущее состояние кода
- ✅ **STITCH уже исключает** шоты с `playable ≤ 0.5s` из склейки
  (`lib/agents/runner.ts:2572`, `excludedShots`). SC13 (override 0.5) выпадет из финал-cut.
- ❌ **Генерация НЕ скипает** 0.5-флагнутые: VGEN/драйвер/Полина попытаются сгенерить
  флагнутый шот = трата денег. (Сейчас флагнут только SC13, и он уже отрендерен — не горит,
  но конвенция не железная.)
- ❌ **STITCH «missing»-дыра:** исключение ≤0.5 срабатывает только если у шота ЕСТЬ видео.
  Флагнутый шот, который НИКОГДА не генерили, попадёт в `missing` → STITCH бросит
  «missing APPROVED VID-shot» (`runner.ts:2592`). Т.е. ≤0.5 надо скипать ДО missing-check.

## Scope (что сделать в коде)
1. **Generation-skip:** перед платным рендером резолвить `effectiveDurationSeconds(shot,
   director_overrides)`; если `≤ 0.5` → НЕ генерить (complete как excluded, $0), по аналогии
   с re-gen guard в `exec-vgen.ts`. Чокпоинт — там же, где раннер резолвит
   `resolvedDurationSeconds` (`runner.ts:~1857`), либо в exec-vgen перед вызовом провайдера.
2. **STITCH missing-check:** применять ≤0.5-исключение ДО проверки `missing` (`runner.ts:2592`),
   чтобы флагнутый-несгенерённый шот не ронял сборку.
3. (Опц.) Показывать excluded-шоты в UI/feed, чтобы Директор видел, что выпало.

## Источник истины
`director_overrides[shot_id].duration_seconds ≤ 0.5` = удалён. Порог 0.5 уже используется в
`animatic-shotlist.ts:260` и `runner.ts:2572` — переиспользовать ту же константу, не плодить.

**Тайминг:** после E11 (не ломать текущий прогон). Пока Тео исключает 0.5-шоты из списка
«осталось сгенерить» рантаймом. Связано с [[ai_ep_conception_gaps]].
