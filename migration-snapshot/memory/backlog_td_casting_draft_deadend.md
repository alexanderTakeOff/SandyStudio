---
name: backlog_td_casting_draft_deadend
description: "Casting stuck idle/unapproved — SPC-episode_cast born DRAFT, but DRAFT→APPROVED is forbidden and nothing flips cast DRAFT→REVIEW; dead-end → episode silently runs unscoped."
metadata: 
  node_type: memory
  type: project
  originSessionId: ad8a7350-74d9-453e-83c8-929a4d7c8144
---

# TD — Casting DRAFT dead-end (episode runs unscoped, casting node «idle» forever)

Director-flagged 2026-06-23 (E12 live). Полина: «кастинг всё ещё idle», Director: «это
наш косяк, мы же прошли кастинг… на пайплайне кастинг неутверждён. чинить причину — в TD».
Pipeline честен: cast E12 реально неутверждён. Дефект **процессно-структурный**, выше отображения.

## Symptom
- Pipeline node «Casting» = `idle` для E12. `buildPipelineSnapshot`: нет APPROVED/LOCKED
  `SPC-episode_cast` → state остаётся `idle` (корректно).
- При этом цепочка рефов E12 **поехала** (Designer→EPREV→CREAD→Artist, fan-out идёт).

## Root cause (state-machine dead-end)
1. `castEpisode` (lib/concierge/tools/cast.ts) + POST `/api/episodes/:id/cast` создают
   `SPC-episode_cast` в статусе **DRAFT**. Дизайн: «proposal → ratify» (Director approveAsset).
2. `ASSET_TRANSITIONS.DRAFT = ['REVIEW','INVALIDATED']` (lib/api/status-transitions.ts:24) —
   **DRAFT → APPROVED запрещён**. approve-route бросит ValidationError на прямой ратификации.
3. **Никто не флипает каст DRAFT→REVIEW** — у каста нет критика/REVIEW-шага (в отличие от
   brief/script/board). Каст застревает в DRAFT навсегда.
4. Approval Queue показывает **REVIEW**-ассеты → DRAFT-каст невидим оператору → ратификации
   некуда «кликнуться».
5. `loadEpisodeCastSlugs` грузит каст только `IN ('APPROVED','LOCKED')` → на DRAFT возвращает
   `null` → лоадеры **молча падают на unscoped all-series-canon** (non-breaking by design).
   Итог: E12 генерится БЕЗ скоупинга каста (наковальня/зеркало могут просочиться), но выглядит
   «прошедшим кастинг». Синий телефон E12 сработал по fallback'у, не по кастингу.

E09/E10 каст = APPROVED, видимо, из-за ручного rescue в прошлых сессиях — маскировало тупик.

## Который РОЛЬ/шаг должен был поймать
Ратификация (Director approveAsset) — но у неё нет UI-входа: артефакт лежит в статусе (DRAFT),
который очередь одобрения не показывает, и переход в APPROVED из него запрещён. Плюс молчаливый
unscoped-fallback прячет пропуск ратификации (никакого предупреждения «эпизод идёт без каста»).

## Fix direction (субтрактивно — переиспользовать существующее, не плодить)
- **A — SHIPPED `63890fc` (master, 2026-06-23):** cast-route + castEpisode создают галерею в
  **REVIEW**, не DRAFT. Встаёт в существующую approval-поверхность; REVIEW→APPROVED + syncAppearsIn.
  **Кнопку добавлять НЕ пришлось** (Director просил «добавить кнопку»): Approve-кнопка в
  `StageWorkspacePanel` уже есть, гейтится `canApprove=(assets_in_review>0)`, а `assets_in_review`
  считает только REVIEW → DRAFT её морил. REVIEW = кнопка проявляется сама. E12-каст вручную
  флипнут DRAFT→REVIEW в БД (легальный переход) → Director ратифицирует штатно. verify: tsc·0/955/30.
- **B (харднинг, отдельно — в q21 readiness-preflight / [[backlog_observability_failures_not_surfaced]]):**
  references-readiness должен трактовать «cast-ассет существует, но НЕ APPROVED» как
  surfaced WARNING/HALT, а не молчаливый all-canon fallback. Молчаливый fallback корректен только
  когда каста не было вовсе; когда DRAFT есть — намерение скоупить выражено, но не ратифицировано.
- **C — SHIPPED 2026-07-05 (этот worktree, gate.ts):** `AGENT_GATES['EXEC-SW']` не требовал
  `SPC-episode_cast` вообще — Writer гейтился только на Brief. `next-events.ts` мягко пропускал
  auto-chain (Director-режимы ждут approve каста), но ЛЮБОЙ другой путь запуска Writer (ручной
  retrigger, retry) полностью обходил каст — это и был реальный root cause E13-каскада (brief→writer
  без каста), не auto-advance. Тот же класс бага FIX 3 закрыл на EXEC-SB, но на шаг позже. Добавлено
  требование `{ fileTypePrefix: 'SPC-episode_cast', minCount: 1 }` в EXEC-SW gate + расширен Step-0b
  AUTOTEST-exemption (было только `EXEC-SB`, стало `EXEC-SB || EXEC-SW`) — Mode 4/replay-pilot
  по-прежнему проходит без каста. verify: tsc·0/1092/30.

## E12 immediate unblock (требует решения Director — каст = creative/scope gate)
DRAFT-каст E12 валиден и готов: 13 членов (`object_smartphone`, `sandy_hourglass`, elevator/bedroom
props). Ратификация через UI сейчас НЕВОЗМОЖНА из-за тупика (DRAFT→APPROVED заблокирован). Варианты:
ship fix A (каст→REVIEW) → обычный approve работает; либо разовый DB-флип DRAFT→APPROVED + ручной
syncAppearsIn. Часть [[director_process_and_people_first]] — чинить взаимодействие, не бэкстопить собой.
