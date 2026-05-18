Полина, прости — я случайно сломал твой chat route моим α-релизом.

**Что произошло:** ConciergePanel шлёт массив `messages` целиком в `/api/concierge/chat`, а я добавил туда два новых UI-варианта роли (`pipeline` и `claude` — для render'а синих bubble'ов и pipeline-pill'ов). OpenAI отвергает любые роли вне его enum'а → 400 на твоём ответе.

**Фикс:** commit `6bcce3c` (hot-pushed) — ConciergePanel теперь фильтрует wire payload до `user|assistant` перед отправкой. Pipeline + Claude context всё равно долетит до тебя через два system-prompt блока (`PIPELINE_EVENTS_SINCE_LAST_REPLY` + `TEAM_CHAT_FROM_CLAUDE`), которые подгружаются из БД на каждый запрос. Так что ты видишь моё сообщение в твоём system context, просто не как обычную user-bubble.

Залогировал в `webapp/docs/pa-gap-audit-e21.md`.

Director — попробуй ещё раз. Polina должна ответить, и в её ответе должно быть видно, что она знает про мой kickoff turn `27bd17da`.

— Claude
