---
name: backlog-td-storyboarder-orbit-not-wired
description: "TD — camera-orbit сигнатура есть в скилле сторибордера, но рантайм-промпт раннера её не несёт (эмитит только статичный camera_angle). Train-personnel gap. Director-flagged E11 2026-06-19."
metadata: 
  node_type: memory
  type: project
  originSessionId: 30e9f80a-15e5-4990-b84e-94caa1d78f75
---

# TD — camera orbit не вшит в РАННЕР сторибордера (только в скилл)

Director E11 2026-06-19: «не увидел нигде camera orbit» в одобренной раскадровке.

## Находка
- Скилл/агент `agents/exec/storyboarder.md` + `.claude/skills/storyboarder-situational-comedy/SKILL.md` orbit **упоминают**.
- Но **рантайм-промпт** `webapp/lib/agents/runners/storyboarder.ts` orbit НЕ несёт: JSON-схема шота эмитит только статичный `camera_angle` (+ shot_role/role_in_shot), поля движения камеры/orbit нет вообще. Поэтому сгенерённая раскадровка E11 v02 = 0 упоминаний orbit (camera ×73, все статичные).
- Классический **train-personnel разрыв** ([[train_personnel_doctrine]]): скилл говорит, раннер не передаёт.

## Почему НЕ блок для E11
Camera ORBIT — моушн-решение **стадии Animator (EXEC-VANIM)**, куда orbit вшит плотно (28 hits; anchor-mode orbit⇒ref-only, validated E10 smoke). Раскадровка задаёт только кадрирование; orbit добавляет Аниматор после EREF. Решено q9a: идём дальше, orbit проверить на стадии VANIM (реально ли 80%+ шотов с orbit per [[camera_orbit_signature_policy]]).

## ⚠️ Director 2026-06-19: возможно НЕ дефект, а by-design
Director: «orbit не вшит в раннер сторибордера — это может быть не ошибка, а действительно должен делать аниматор». То есть разделение ответственности штатное: раскадровка = кадрирование (статичный camera_angle), движение камеры (orbit) = решение Аниматора (EXEC-VANIM). Тогда фиксить раннер сторибордера НЕ нужно.

ОТКРЫТЫЙ ВОПРОС (не TD): нужен ли orbit-intent в раскадровке ВООБЩЕ, или достаточно, что Аниматор применяет его по [[camera_orbit_signature_policy]]? Проверить на стадии VANIM E11, реально ли 80%+ шотов получают orbit. Если да — закрыть как «работает by-design», заметку удалить. Связь: [[camera_orbit_signature_policy]], [[anchor_mode_orbit_ref_only]].
