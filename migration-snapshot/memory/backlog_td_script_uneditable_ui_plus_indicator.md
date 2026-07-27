---
name: backlog-td-script-uneditable-ui-plus-indicator
description: Два TD из E09-сшивки 2026-06-13 — (1) скрипт нельзя редактировать в UI (в отличие от брифа); (2) indicator-display не заведён в канон.
metadata: 
  node_type: memory
  type: project
  originSessionId: 933fcbb8-b0a4-4eed-b4c1-4b543c51d981
---

# TD — script не редактируется в UI + indicator-display канон-дыра (E09, 2026-06-13)

## TD-1 — нет UI-редактирования скрипта (Director-flagged)
Director: «опции редактировать тут нет у меня, в отличие от брифа». Бриф Director
правит в UI, а SCR-script — нет. Поэтому ART-AD-сшивку (location-slug'и скрипта ↔
канон) пришлось делать Тео прямой записью в БД. Это дыра UX/контроля: Director не
может внести ручную правку в скрипт без агента/прямого доступа к базе.
**Fix:** дать редактирование SCR-script в драуере (как у брифа) — минимум
location-slug'и/structured-поля, в идеале markdown+JSON. Источник правки —
`/api/assets/[id]/content` уже есть для брифа (Phase 5d), переиспользовать на SCR.
Anti-additivity: расширить существующий content-editor на SCR file_type, не плодить.

## TD-2 — indicator-display не в каноне (блокирует EREF E09)
Скрипт E09 активно использует «indicator display above doors» (SC05/08/09, гэг
4→4.5), но в LOCKED-объектах его нет (только `elevator_call_button`,
`elevator_button_cluster`). **Решение Директора нужно ДО EREF:** бэйкнуть индикатор
в канон `elevator_cab_door_wall_clean` ИЛИ завести объект `elevator_floor_indicator`
(тогда сгенерить+залочить как call_button/button_cluster). Зафлагано в assumptions
скрипта v02 и в supervision-логе.

## Контекст
Это проявления отсутствующей ART-AD/breakdown ступени
([[backlog_td_artdir_breakdown_role]]): сшивка скрипт↔канон + ловля канон-дыр —
её работа; сейчас руками Тео/Director. Сшивка E09 выполнена 2026-06-13 (v02 in
place, все 10 сцен ∈ LOCKED canon). Лог: `C:\SandyStudio\docs\e09-supervision-log.md`.
