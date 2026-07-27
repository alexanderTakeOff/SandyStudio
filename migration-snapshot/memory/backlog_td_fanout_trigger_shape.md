---
name: backlog-td-fanout-trigger-shape
description: "E09 2026-06-13 — Полина запустила per-shot EXEC-EREF-DESIGNER через generic manual-trigger без shotId → FAILED 'requires shotId'. Два пути фан-аута, выбрала неправильный."
metadata:
  node_type: memory
  type: project
  originSessionId: 933fcbb8-b0a4-4eed-b4c1-4b543c51d981
---

# TD — fan-out trigger shape: per-shot агент запускаем без shotId (E09 2026-06-13)

## Проблема
EXEC-EREF-DESIGNER — ПО-ШОТОВЫЙ агент (требует `shotId` в event payload).
У Полины два пути «фан-аута остальных шотов»:
- **generic manual-trigger** (agent-level, БЕЗ shotId) — НЕПРАВИЛЬНЫЙ;
- спец-инструмент `fanoutDesigner` (читает `designer_fanout_pending`, файрит одно
  событие на шот С shotId) — ПРАВИЛЬНЫЙ.

E09: Director сказал «да можно запускать fan out for others» → Полина взяла
generic-trigger → событие без shotId → job FAILED `EXEC-EREF-DESIGNER requires
shotId in event payload` (12:37:03). Безвредно (денег не тронул). Через ~2 мин
пошёл правильный per-shot фан-аут (12:39:15+), 20 шотов SH03–SH22 поехали штатно.

## Фикс (анти-аддитивно, пост-прогон)
1. **Убрать** per-shot агентов (EXEC-EREF-DESIGNER и подобных) из поверхности
   generic manual-trigger — чтобы их нельзя было запустить agent-level без shotId.
   Единственный путь — `fanoutDesigner`. (subtract path, не add validation.)
2. Если (1) сложно — ранний fail с подсказкой: «EXEC-EREF-DESIGNER per-shot,
   используй fanoutDesigner» вместо сырого «requires shotId».
3. Побочно: `designer_fanout_pending` (metadata) НЕ прунится по мере готовности
   шотов (остаётся 20 при готовых SH03/SH04) — stale-список. Свести с реально
   созданными планами или декрементить. Низкий приоритет.

Связь: [[backlog_td_polina_workplan_tracker]] (Полина выбирает инструмент),
[[nudge_polina_dont_act_for_her]], пост-прогонный батч обучения.
