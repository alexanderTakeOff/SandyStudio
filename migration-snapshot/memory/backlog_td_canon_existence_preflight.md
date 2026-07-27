---
name: backlog-td-canon-existence-preflight
description: "TODO (Director-flagged, важно) — пайплайн пропускает фантомные локации/каноны. Нужен canon-existence preflight на стадии brief/script + HALT-ask-Director у Полины."
metadata: 
  node_type: memory
  type: project
  originSessionId: 933fcbb8-b0a4-4eed-b4c1-4b543c51d981
---

# TODO — canon-existence preflight + Polina HALT-ask-Director (Director-flagged 2026-06-13, ВАЖНО)

## Симптом (живой, E09)
Бриф/скрипт E09 «Sandy and Elevator» требует лифтовых локаций. В каноне SS-S15
их НЕТ (единственная LOCKED-локация = `sandy_bedroom_continuity`). Поведение
пайплайна:
- Writer v01 откатился на `sandy_bedroom_continuity` (реальный, но семантически
  НЕВЕРНЫЙ slug) и честно флагнул в assumptions «нужен ART-WB добавить локацию».
- Полина отправила REVISE: «заменить bedroom на elevator_corridor/elevator_cab».
- Writer v02 подставил `elevator_corridor` + `elevator_cab` — **фантомные slug'и,
  не заведённые ни одним SBL-ассетом**.
- Story Editor дал PASS (он проверяет соответствие БРИФУ текстово, НЕ существование
  в каноне) → ревью в REVIEW → следующий approval запустит Storyboard Artist.

Итог: REVISE сделал дыру ХУЖE — v01 ссылался на реальный-но-неверный канон, v02
ссылается на несуществующий. Реальная canon-проверка (EXEC-WCHK CHK-W01: location
∈ LOCKED SBL-location) стоит ПОСЛЕ сториборда — слишком поздно, уже потрачен
сториборд, а EREF остался бы без референса локации.

## Корневой логический косяк (формулировка Director)
Полина должна была на стадии брифа ОСТАНОВИТЬСЯ и сказать Директору: эпизоду нужны
локации, которых нет в каноне — **разреши сгенерить каноны для эпизода**, либо
**укажи, какие существующие каноны (включая главного героя) использовать**. Вместо
этого — молчаливый фолбэк / пропуск фантомных slug'ов.

## Фикс (слоями)
1. **Canon-existence preflight на стадии brief/script** (НЕ только в WCHK после
   сториборда): diff требуемых брифом/скриптом локаций+персонажей против Series
   Bible canon (LOCKED/APPROVED). Любой отсутствующий slug → HALT + эскалация
   Директору со списком недостающих сущностей и ДВУМЯ опциями: (а) сгенерить канон
   для эпизода, (б) указать существующие slug'и. Семья q21-readiness-preflight
   ([[backlog_observability_failures_not_surfaced]] + q21), но сдвинуто ВВЕРХ к брифу.
2. **Поведение Полины (concierge skill):** на старте эпизода прогонять этот diff и
   НЕ двигать конвейер при недостающем каноне — ровно как сказал Director. Train в
   agents/exec/concierge.md.
3. **Story Editor:** REVISE-инструкция не должна предлагать «выдумай новые slug'и» —
   она должна предлагать «заведи канон или возьми существующий». Сейчас REVISE
   фактически попросил Writer выдумать локации.

## Триггер реализации
Вместе с пулом pre-/post-эпизодных TD ([[backlog_td_brief_authoring_training]] —
после E09 final cut; [[backlog_td_partial_animatic_and_provider_caps]]). НО операционно
блокирует E09 ПРЯМО СЕЙЧАС: до approve Story Editor review нужно завести 2 лифтовые
локации в канон S15 (sandy_hourglass уже LOCKED — покрыт). Бриф уже задал геометрию
кабины (4 вида) — спека для генерации локации готова.
