---
name: backlog-td-polina-workplan-tracker
description: "TD — Полинин work plan ведётся как пассивная память, а не активный трекер. Director-flagged 2026-06-13. Fold в пост-прогонное обучение."
metadata: 
  node_type: memory
  type: project
  originSessionId: 933fcbb8-b0a4-4eed-b4c1-4b543c51d981
---

# TD — Polina work-plan = живой трекер исполнения (Director-flagged 2026-06-13)

Director: «мы оставляли задачу, чтобы Полина писала план и СЛЕДИЛА за выполнением —
отмечала/УДАЛЯЛА выполненное (лучше удалять, чтоб не разрастался), не теряла,
проверяла что реально запустилось. А она собирается → не получается → молчит».

## Диагноз (evidence)
Механизм ПОЛНЫЙ: `STA-work_plan` STATE-asset + `updateWorkPlan` tool +
`[WORK_PLAN]` блок рендерится каждый ход (system-prompt-builder.ts:316-336,
Unit A 2026-06-03). Поведение НЕДОСТРОЕНО: блок инструктирует план как ПАССИВНУЮ
память решений Директора («читай каждый ход; обновляй, когда DIRECTOR меняет
решение; не переспрашивай»), НЕ как активный трекер её собственного исполнения.

Факт по E09: план хороший (`SS-S15-E09-STA-work_plan-v01` — standing decisions +
canon split + pipeline hold), но write-once: created 07:42 / updated 07:58 /
дальше мёртв, пока стиль ушёл v2→v3 и локации снесены-пересозданы. Silent-fail
скан 60 ходов: tool-сбоев 0 — значит «молчит о провале» = не падающие
инструменты, а НЕЗАМКНУТЫЙ план (пункты делаются ad-hoc, завершение/провал не
сверяются → пропуск тих).

## Fix — 3 правила в `[WORK_PLAN]` блок + concierge.md
1. **Mark-done + DELETE:** выполнил свой пункт → отметь и УДАЛИ из плана (Director:
   держать план коротким, не разрастаться). Незавершённые — остаются.
2. **Per-turn reconcile план↔реальность:** для каждого «в работе/намеченного»
   пункта проверь, появился ли его артефакт (created_at позже попытки) ПРЕЖДЕ чем
   считать сделанным. Не появился — пункт не закрывается.
3. **Несработавший шаг → СТОП + доклад**, не «молча дальше». (work-plan-версия
   F5/silent-failure доктрины 8a-8c.)

PROJECT-контент (system-prompt-builder.ts + concierge.md) → нужен ===5===. По
sequencing Директора — в пост-прогонное обучение персонала, рядом с
[[backlog_td_brief_authoring_training]] и [[backlog_td_canon_existence_preflight]].
Опц. сейчас: nudge Полине обновить план (live-тест способности).
Полный лог: `C:\SandyStudio\docs\e09-supervision-log.md` (commit ba8c2c0).
