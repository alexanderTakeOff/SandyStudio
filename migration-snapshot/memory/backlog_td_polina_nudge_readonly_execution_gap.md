---
name: backlog-td-polina-nudge-readonly-execution-gap
description: "E09 2026-06-13 — нудж Тео прилетает Полине как AUTO-REACT, а он hardwired read-only → она НЕ исполняет мутации из нуджа, какой бы authority-токен ни передан. Блокер Mode-3 оркестрации «Тео нуджит → Полина исполняет»."
metadata:
  node_type: memory
  type: project
  originSessionId: 933fcbb8-b0a4-4eed-b4c1-4b543c51d981
---

# TD — нудж Полины = auto-react = read-only → execution не идёт (Mode-3 блокер)

## Находка (E09 2026-06-13, дважды подтверждена)
Тео постит нудж в team-chat с **EXEC_DIR_AI_TOKEN** (authorized_principal=true,
q3/commit ba84c13) → fires `pa/notify-needed` → Полина реагирует через
`exec-pa-react` → `/api/concierge/chat-internal`. Но этот путь **auto-react
hardwired read-only** — Полина дословно: «в этом авто-триггере мне явно запрещены
мутации, поэтому approveAsset сейчас не вызываю». Она анализирует, соглашается,
рекомендует — но НЕ мутирует.

authorized_principal-токен даёт ПРАВО на approval (Category-B), но не снимает
read-only самого auto-react пути. Право и путь — разные оси: токен открыл authority,
но execution-path всё равно немой.

## Следствие
Доктрина [[nudge_polina_dont_act_for_her]] («Тео нуджит → Полина исполняет +
учится → Mode 3») в текущей архитектуре **не работает на execution**. Нудж даёт
максимум анализ/рекомендацию. Реальные мутации Полина делает ТОЛЬКО из **прямого
интерактивного** сообщения Директора в панели (не из auto-react). E09: пришлось
бэкстопить — Тео сам апрувнул 18 ref-планов токеном (Director ОДОБРЯЮ).

Подтверждения той же стены: lock индикатора (Полина read-only, не смогла),
fan-out (она дёрнула не тот триггер), теперь batch-approve (read-only отказ).

## Фикс (пост-прогон, для Mode-3)
Нужен **execution-капабельный нудж-путь**: чтобы authorized_principal claude_message
(или спец-команда от Тео) разрешал Полине вызвать мутацию-инструменты ИЗ auto-react,
под теми же гейтами (Category-B да, hard-limits — нет). Варианты:
1. В `chat-internal` авто-реакт-ветке: если триггер = claude_message с
   authorized_principal → снять mutation-ban (разрешить approveAsset/triggerAgent),
   оставив hard-limits человеку.
2. Либо отдельный «delegated-action» канал Тео→Полина, который исполняет
   детерминированно (не через LLM auto-react), а Полина пост-фактум учится по логу.
Без этого «Тео-дирижёр + Полина-исполнитель» нереализуем — оркестратор вынужден
бэкстопить сам, что противоречит train-Polina-doctrine.

Связь: [[nudge_polina_dont_act_for_her]], [[orchestrator_master_session_paradigm]],
[[backlog_td_polina_workplan_tracker]], [[train_personnel_doctrine]]. Пост-прогон.
