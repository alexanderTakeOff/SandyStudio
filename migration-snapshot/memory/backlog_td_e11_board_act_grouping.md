---
name: backlog_td_e11_board_act_grouping
description: "E11 storyboard JSON has 3 act-objects but the approved script has 4 acts — Act 4 shots are filed under act:3. Cosmetic for render, fix act grouping AFTER E11 finale (Director q8b 2026-06-22)."
metadata: 
  node_type: memory
  type: project
  originSessionId: 88492956-d55a-4667-b9c1-7d635930c41e
---

# TD — E11 борд: 4 акта в shot_id, 3 объекта-акта в JSON

**Найдено 2026-06-22** (Director спросил «у нас точно 4 акта?»). Решение Director: **q8b — чинить ПОСЛЕ финала эпизода.**

## Факт
Сценарий `SS-S15-E11-SCR-script-v06-APPROVED.md` задаёт **4 акта**:
Act 1 Завязка · Act 2 Развитие · Act 3 Кульминация · Act 4 Развязка (Сборка).

Сториборд `b5497563-b2d9-48c2-8a6c-777658780e71` имеет **3 объекта-акта**. Шоты Акта 4
свалены в объект `act:3`:
```
act:3 объект →  A3-SC01-SH01   (Акт 3 — верно)
                A4-SC01-SH01   ┐
                A4-SC02-SH01   ├ Акт 4, но под act:3
                A4-SC02-SH02   ┘
```

## Оценка
- **shot_id `A1/A2/A3/A4` КОРРЕКТНЫ** — совпадают с 4-актным сценарием. НЕ перенумеровывать
  (A4-видео уже APPROVED, перенумерация осиротит ассеты).
- Неверно только поле `act` на группировке: 3 шота Акта 4 лежат под `act:3`.
- **Рендеру не мешает** — shot_id уникальны, резолвятся; 5 недостающих видео идут как есть.
- Ломает: группировку по актам (аниматик-дисплей), путает оператора (каша «A3/A4»).

## Фикс (после финала)
Разнести объект `act:3` на `act:3` (A3-шоты) + `act:4` (A4-шоты). Только поле `act`/
группировка, **shot_id не трогать**. Правка APPROVED-борда → surgical, анти-регресс
(см. [[backlog_td_surgical_revision_after_critique]]).

## Корень (для авто-EP / Storyboarder)
Storyboarder сгенерил shot_id с A4-префиксом, но не создал 4-й act-объект → группировка
рассинхронилась с нумерацией shot_id. Семейство [[ai_ep_conception_gaps]] gap #1
(целостность нумерации). Нужен пост-генерационный инвариант: «число act-объектов ==
max(A#) в shot_id», иначе HALT.
