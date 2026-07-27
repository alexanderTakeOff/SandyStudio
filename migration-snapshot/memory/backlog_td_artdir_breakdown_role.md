---
name: backlog-td-artdir-breakdown-role
description: "TD — отсутствующая ступень «Art Director / Production Designer + script breakdown» между Story Editor PASS и Storyboard. Решено q8a/q9a 2026-06-13. Воплотить как рантайм ART-AD, проектировать в пост-прогонном синтезе."
metadata: 
  node_type: memory
  type: project
  originSessionId: 933fcbb8-b0a4-4eed-b4c1-4b543c51d981
---

# TD — Art Director / Production Designer + Asset Breakdown как ступень пайплайна

Director-наблюдение 2026-06-13 (во время E09 canon-hardening): он РУКАМИ закрывает
целую отсутствующую ступень — решает, что нужна локация, бьёт её на
камеро-направления (view-split), решает какие пропы «играющие» (canon-объекты) vs
фон, задаёт look-constraints, и делает script→asset breakdown. Такого сотрудника
в пайплайне нет.

## Что это за работа (реальная студия)
- **Production Designer / Art Director** — что за сеты/пропы существуют, как выглядят (creative).
- **Layout / Set Designer** — разбивка локации на камеро-виды (technical design).
- **Script Breakdown / Asset Supervisor** — скрипт → asset-manifest, diff vs сток, маршрутизация, трекинг (coordination).
На нашем масштабе — одна слитная роль «арт-департамент эпизода».

## Что есть/нет у нас
Есть РОЛИ на бумаге: ART-AD (Art Director, L2), ART-WB (World Bible). Есть
ИСПОЛНИТЕЛЬ EXEC-BIBLE-AUTHOR (генерит канон-картинки — это руки, не голова).
НЕТ ступени, которая между **Story Editor PASS → Storyboard** делает breakdown +
дизайн-решения и рулит генерацией канона. ART-* не бегают как pipeline-функции
(только EXEC-* исполняются на Inngest). = дыра, которую Director закрывает руками.

## Решение (q8a / q9a, 2026-06-13)
- **q8a (housing):** воплотить как **рантайм ART-AD** (reuse роли из конституции,
  не плодить нового агента — anti-additivity). Идентичность роли = ART-AD; рантайм-
  воплощение = EXEC-ступень (раб. имя EXEC-ARTDIR/EXEC-PD), которая ДУМАЕТ и рулит
  EXEC-BIBLE-AUTHOR (руки). Честно: т.к. ART-* сейчас не исполняемы, «добавить
  рантайм» по объёму ≈ создать EXEC-агента; разница — в идентичности (держим ART-AD).
- **q9a (timing):** проектировать и вшивать в **пост-прогонном синтезе** (после
  E09 final cut, по sequencing Директора). Это новая ступень пайплайна — тянет на
  TD-спринт, не skill-правку. E09 сейчас Director доводит руками.

## Что эта ступень поглощает (3-в-1)
1. **[[backlog_td_canon_existence_preflight]]** — canon-diff/preflight становится её гейтом.
2. **Slug-reconciliation** скрипт↔финальный канон (E09: `elevator_corridor`/`cab` ↔
   LOCKED `*_clean`/`*_plain_wall` — несшито).
3. Дизайн-решения Директора (view-split, prop-vs-background, look-constraints).
Контракт ступени: после Story Editor PASS → asset breakdown → canon-gap diff →
дизайн-спека + заказ генерации (EXEC-BIBLE-AUTHOR) → сшивка slug'ов → гейт «не в
Storyboard, пока канон не готов и slug'и не сшиты».

Соседние пост-прогонные TD: [[backlog_td_brief_authoring_training]],
[[backlog_td_polina_workplan_tracker]], [[backlog_td_partial_animatic_and_provider_caps]].
Лог наблюдения: `C:\SandyStudio\docs\e09-supervision-log.md`.
