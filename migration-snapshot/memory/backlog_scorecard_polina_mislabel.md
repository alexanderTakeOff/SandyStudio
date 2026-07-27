---
name: backlog_scorecard_polina_mislabel
description: "TD — scorecard считает диспатчи Полины как «человека» (она логируется под UUID Директора), завышая human-касания и занижая автономность."
metadata: 
  node_type: memory
  type: project
  originSessionId: a8c31a58-72d6-4338-919c-f0477be38204
---

# TD — scorecard врёт: диспатчи Полины считаются «рукой Директора»

**Симптом (E28):** `codeableTouchesHuman = 59`, но из 54 manual-триггеров **48 запустила Полина** (Prod Assistant), а не Директор. Своей рукой Директор — ~4. Значит «59 human touches» и вся human/AI-EP-разбивка scorecard **завышают ручной труд и занижают автоматизацию**.

**Корень:** `webapp/lib/agents/scorecard/compute-scorecard.ts` через `actorKind` (`lib/api/agent-names.ts`) мапит actor. Полина (EXEC-CONC) логирует `manual_trigger` в `activity_events` с **actor = UUID Директора** (она действует «от его имени»), а признак «это Полина» лежит только в `metadata.reason` (префикс `[Prod Assistant]`). `actorKind(UUID)` → `director` → считается человеком. Только actor `exec-dir-ai` попадает в AI-EP; Полина-под-UUID — нет.

**Fix (когда дойдут руки):** ввести третий класс актора — распознавать `metadata.reason` с префиксом `[Prod Assistant]` (или отдельный actor-тег для Полины) и считать такие manual_trigger как `prod-assistant`, отдельно от `human` и `ai-ep`. Тогда KPI-2 / автономность перестанут врать. Затронуть: `compute-scorecard.ts` (ветка `manual_trigger`), возможно `actorKind`.

**Почему важно:** это системная слепота метрики — на ВСЕХ эпизодах, где Полина диспетчеризует, автономность недооценена. Разбор E28 наступил на это; следующий наступит снова, если не починить.

Связано: [[session_2026-07-13_e28-gold-autonomy-diagnosis]] · [[nudge_polina_dont_act_for_her]] · [[backlog_td_polina_nudge_readonly_execution_gap]]
