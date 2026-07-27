---
name: backlog-skill-abstraction-audit
description: "TD — раскачать абстракцию скиллов; концретные локации/вещи утекли в process-скиллы (надо спустить в Bible/Brief, не удалять)"
metadata: 
  node_type: memory
  type: project
  originSessionId: ad5ae835-a203-4176-9504-c4932fd22958
---

Director-директива 2026-06-15: **«в наших скилах не должно быть конкретики, связанной с вещами или конкретными локациями (лифты/кухни/спальни) — надо повысить уровень абстракции»** (его же `skill-creation.md`). Зафиксировано как backlog по q16в (сейчас не свипаем — ждём рендер E10, чистим потом «на касании, аккуратно»).

**Уже сделано (2026-06-15):** `agents/exec/episode_reference_designer.md` LAYOUT LOCK блок вычищен начисто — был захардкоженный СПАЛЬНЫЙ пример («mirror, carpets, bed, bookshelf MUST appear»), который Designer-LLM копировал дословно в КАЖДЫЙ план → gpt-image рисовал мебель в лифте (корень E10 SH01/SH26 furniture-бага). Теперь role-based: `scene_master` / `location Bible` / `<object_bible_slug>`. Плюс смягчено ANTI-INVENTION правило — Director отметил, что перегнул: скрипт-добавления (transient props по action_prose) ДОЛЖНЫ быть разрешены, бан только на ВЫДУМАННЫЕ стоячие объекты локации.

**Остаточные leaks (аудит grep, по тяжести):**
1. 🔴 `.claude/skills/eref-shot-composition/SKILL.md` — целый раздел «Elevator episode minimum canon set» (`elevator_corridor_call_wall`, `elevator_cab_button_wall`, `elevator_cab_door_wall`…). Контент E10 в ОБЩЕМ скилле композиции (git-modified, недавно добавлен). **Нюанс: не удалять — спустить конкретный лифт-набор в project Bible E10, а скилл сделать абстрактным («сгенерь минимальный набор локейшн-плашек per location Bible перед шотами»).**
2. 🟠 `agents/exec/animator.md` — worked-example целиком на «trumeau mirror vanity» + Sandy/Anvil/мебель (объекты конкретны; пример учит — абстрагировать объект, сохранив структуру).
3. 🟠 `agents/artistic/art_director.md` — «vanity mirror in all 40 anchors», «anvil/vanity».
4. 🟠 `.claude/skills/library-style-first-visual-generation-protocol/SKILL.md:85` — «use 'trumeau vanity / dresser with mirror', not 'mirror'» (ирония: это «эталонный process-скилл»).
5. 🟡 `.claude/skills/storyboarder-situational-comedy/SKILL.md` — «22 shots in ONE bedroom (SS-S15-E03)», «bed ↔ vanity ↔ under-bed» (provenance-заметка, низкий вред).

**Принцип чистки (доктрина):** концретику не УДАЛЯТЬ, а ПЕРЕНОСИТЬ вниз по слоям Skill→Bible→Brief. Скилл хранит ИНВАРИАНТ процесса; конкретные локации/объекты/стиль — в Bible/Brief. Тесты: opposite-genre + fresh-agent. См. [[anti_additivity_principle]].

Связано: критик-канон-проверка (EPREV/CREAD должны ловить объекты вне канона локации) и surgical-revision (re-author сохраняет правки, не регенит с нуля) — оба всплыли в том же E10 furniture-разборе.
