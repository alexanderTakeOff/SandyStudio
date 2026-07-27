---
name: provider-fetch-no-timeout-root-cause
description: "Real root of E15/E17 pipeline stalls — provider fetch without timeout hangs, holds Inngest concurrency slot forever. Corrects the \"unreliable dev-router\" theory."
metadata: 
  node_type: memory
  type: project
  originSessionId: 615916d2-60b2-414e-81fe-bb024a183f0f
---

**Найдено 2026-07-07 по логам сервера (pprof + `:8288/v1` + runTrace).** Настоящая причина
«пайплайн встаёт на стадии» (E15 дважды, E17): **ни один провайдерский `fetch` не имел таймаута/
AbortSignal.** При троттлинге/зависшем сокете `await fetch()` не возвращается никогда → Inngest-ран
не завершается → **вечно держит слот concurrency (episode-keyed)** → стадия стоит. Симптомы: критик-
стой (gemini-text), сироты-артисты SH09-12 (openai-edits-multi). pprof показал 5 goroutine в
`exechttp.DoRequest` висящими 75-90 мин + сокет CloseWait.

**Это ОТМЕНЯЕТ теорию** [[inngest_dev_router_unreliable_no_selfheal]] — «ненадёжный dev-роутер» был
СИМПТОМОМ, не причиной. Роутер невиновен; виноват fetch без таймаута.

**Fix (в master):** `webapp/lib/agents/providers/fetch-with-timeout.ts` (helper
`fetchWithTimeout` + `FETCH_TIMEOUTS` + `FetchTimeoutError` retryable) + q8-фиксы (критики на платный
Anthropic через `CHECKERS_FREE_TIER=false`; `timeouts.finish=10m` на критик-функциях; pin
inngest-cli 1.33.0). **СВАП ЗАВЕРШЁН 2026-07-08 (master `71cafd3`, PR #31):** все 27 голых `fetch(` в
13 провайдерах переведены на `fetchWithTimeout` (3 коммита: критпуть артист+видео+критик / картинки+
auth+drive-чокпоинт / остальные fal+veo-чокпоинты). Poll-loop fetches получили `POLL_MS < MAX_WAIT`,
чинит «Idiom-A defeat» (залипший опрос обходил бюджет). tsc чист, 1149/1149. План
`~/.claude/plans/crystalline-orbiting-dijkstra.md` — исполнен полностью.

**Побочно (PR #32, master `52eb72b`):** починен сломанный master — коммит `5cfc64d` вшил `import
{ listThemes }` в concierge-реестр, но забыл реализацию → tsc TS2305 + 6 красных тестов. Дописан
read-only `listThemes` в `themes.ts` (GET существующего themes-роута; Полина теперь умеет и
предлагать, и листать темы).

**How to apply:** любой новый провайдерский сетевой вызов ОБЯЗАН идти через `fetchWithTimeout`, не
голый `fetch`. Комплемент — reconciler ([[autonomous_factory_architecture_doctrine]], флаг
`MECHANICS_AUTO_ADVANCE`) переигрывает события, потерянные пока ран был заклинен. Диагностика затыка:
СНАЧАЛА лог сервера (`%LOCALAPPDATA%\Temp\e17-inngest*.log`, `:8288/v1/events/{id}/runs`, pprof),
ПОТОМ теории — в этой сессии 3 теории отвергнуты данными до нахождения корня.
