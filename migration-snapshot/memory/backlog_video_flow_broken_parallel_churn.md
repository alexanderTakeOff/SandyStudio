---
name: backlog_video_flow_broken_parallel_churn
description: "Видео-поток «так и не починили» (Директор E31 2026-07-23). «Старт видео» веером фаерит ВСЕ шоты разом (нет sequential, нет concurrency-cap); критик-churn без revision-cap (SH04=11, SH09=12 версий плана); invalidated-план → VGEN хардфейлит вместо latest APPROVED; провайдер периодически out of funds. Итог — шторм из 72 zombie-джоб, жёг деньги."
metadata: 
  node_type: memory
  type: project
  originSessionId: 3a3a92ed-4dc1-4559-a22e-802ae01c200e
  modified: 2026-07-23T08:03:44.188Z
---

# Сломанный видео-поток: parallel + churn + invalidated-plan (E31 2026-07-23)

Директор E31: «стоп, останавливай, разбирайся с видео потоком. мы его так и не починили!»
Он нажал «старт видео» → веером запустились ВСЕ 27 шотов, начался шторм.

## Что произошло (runtime-verified)
- **72 zombie RUNNING джобы** E31 (VANIM:63, VGEN:8, VPREV:1). Погашены хирургически по
  agent_id (ref-джобы EXEC-EREF* НЕ тронуты; ref был DONE — 0 активных ref-джоб).
- Killing job-строк НЕ останавливает шторм сразу — он **event-driven через Inngest**
  (критик-цепочка VANIM↔VPREV re-fire); строки убил, in-flight раны дренировались ~5 мин.

## Четыре структурных дефекта видео-потока
1. **Parallel-batch без cap.** «Старт видео» фаерит VANIM-планирование ВСЕХ шотов разом.
   Нет выбора sequential/parallel (в `generation_config.video` поля режима НЕТ), нет
   concurrency-лимита. 27 шотов + churn = шторм.
2. **Критик-churn без revision-cap.** VPREV REVISE → VANIM переплан → REVISE → … SH04=11
   версий плана, SH09=12, SH26 REVISE-луп. Доктрина cap 2-3× потом HALT ([[critic_revision_cap_doctrine]])
   на VANIM/VPREV **НЕ применена**. Планирование = Anthropic $ → жжёт деньги в петле.
3. **Invalidated-план → VGEN хардфейл.** Когда план черн→новая версия, старый planAssetId
   становится INVALIDATED. VGEN был диспатчен со СТАРЫМ id → «planAssetId INVALIDATED,
   expected APPROVED. Refusing silent storyboard fallback» вместо того чтобы взять
   latest APPROVED план шота. Ложная ошибка при живом видео.
4. **Провайдер out of funds** (fal.ai/Seedance) — часть VGEN падала «⛔ out of funds»
   (часть SH08 всё же завершилась → funds периодические/частичные). Пополнить перед видео.

## РЕЗОЛВ 2026-07-23 (сессия storm-fix, коммиты e8716d2f + 28d497fd)

Диагноз уточнён двойным трейсом ref-vs-video: **капы глубины УЖЕ работали**
(`534ddbf4`: critic revision cap 2 + plan-version cap 5) — шторм был **ШИРИНОЙ**
(веер 27 шотов, VANIM:63 ≈ 2.3 прохода/шот, каждый ПОД капом). Фикс = зеркало
работающего реф-потока:
- ✅ **Video Pilot Pass** — Start Video фаерит 2 пилота, остальные в
  `metadata.video_fanout_pending`; кнопка «Fan Out (N)» рядом со Старт видео
  (роут `video/fanout`, зеркало eref/approve-pilots без его стейт-машины).
  Закрывает и пункт «режим sequential|parallel» — у рефов режима тоже нет,
  ширину держит pilot-gate + concurrency (vanim 3 / vprev 5 / vgen-shot 2).
- ✅ **VGEN stale plan-id самолечится** → ЕДИНСТВЕННЫЙ APPROVED план шота
  (инвариант Директора: на шот ровно один APPROVED; >1 = громкий warn);
  0 APPROVED → прежний fail-loud. `runner.ts` через canonical resolveShotId.
- ✅ **Аварийный стоп** — `stop-stack.ps1 -Wipe` (Inngest ПЕРВЫМ + парковка
  durable SQLite, иначе рестарт воскрешает шторм — проверено живьём 11:26) +
  UI кнопки STOP/Restart servers → `/api/system/servers` (detached spawn).
- ✅ Провайдер пополнен (Директор).
- Остаток: [[backlog-cap-reset-after-halt]] — счётчики не сбрасываются после
  HALT-резолва (гипотеза Директора, ядро подтверждено).

Живой смоук пилот-пасса на E31 — следующий шаг после rebuild.

Всплыло в E31-сессии (runtime_target + pipeline-view fixes). Директор нажал старт видео сам —
не баг старта, а сломанный поток под ним.
