
---

## Cycle 4 — 2026-06-13 ~08:40 UTC

**Канон лифта ПОЛНОСТЬЮ ЗАЛОЧЕН:** 4 стены LOCKED (`elevator_corridor_door_wall`,
`elevator_cab_plain_wall`, `elevator_cab_door_wall_clean`,
`elevator_cab_side_wall_clean`) + 2 объекта LOCKED (`elevator_call_button`,
`elevator_button_cluster`, 08:37). Canon-hardening лифта завершён.

**E09 эпизод:** без движения — script v2 / REV v2 REVIEW, $0.34. Готов двигаться,
Story Editor review v2 не аппрувлен. Полина дисциплину держит.

**Мы у ГЕЙТА сшивки.** Канон финальный, но скрипт по-прежнему ссылается на
`elevator_corridor`/`elevator_cab` ∉ canon. Approve→Storyboard сейчас = раскадровка
на несшитых slug'ах.

**Рекомендованный маппинг сцена → канон-стена + объекты (для сшивки):**
- A1-SC01 call button → `elevator_corridor_door_wall` + obj `elevator_call_button`
- A1-SC02 doors → `elevator_corridor_door_wall`
- A1-SC03, A2-SC04/05/07, A3-SC09 панель → `elevator_cab_plain_wall` + obj `elevator_button_cluster`
- A2-SC06 doors interrupt → `elevator_cab_door_wall_clean`
- A2-SC08 near-miss ride (indicator) → `elevator_cab_door_wall_clean`
- A3-SC10 destination doors → `elevator_corridor_door_wall`

**🚩 НОВАЯ дыра канона:** скрипт активно использует `indicator display above doors`
(SC05/08/09) — его НЕТ в залоченном наборе объектов (есть только call_button +
button_cluster). Нужно решение: запечь индикатор в `cab_door_wall_clean` канон ИЛИ
завести объектом `elevator_floor_indicator`. Иначе индикаторные гэги (4→4.5) негде
рендерить консистентно.

**Watch next:** сделают ли сшивку перед approve; решат ли indicator-дыру; стартует
ли Storyboard.
