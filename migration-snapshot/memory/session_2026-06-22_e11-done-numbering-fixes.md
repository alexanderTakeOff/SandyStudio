---
name: session_2026-06-22_e11-done-numbering-fixes
description: "Session 2026-06-22 PM — E11 PRODUCTION DONE (first 4-act episode); 4 fixes merged to master (shotId normalize, storyboarder act-count, deleted-shot stitch exclusion); next session starts in claude/aiep worktree."
metadata: 
  node_type: memory
  type: project
  originSessionId: 88492956-d55a-4667-b9c1-7d635930c41e
---

# Session 2026-06-22 PM → 06-23 — E11 done + numbering/stitch fix-sprint

## Что закрыто
- **E11 «Мощный вентилятор» PRODUCTION DONE** — stitch отработал, финальный cut собран
  (Director подтвердил 04:31 Dubai 06-23). Первый 4-актный эпизод за историю студии.
- **3 корневых фикса + PLAN, смержены в master, запушены** (`70b6d07..ffdd212`):
  - `9b936e5` fix(trigger): `normalizeShotId` на единой trigger-двери — короткий ключ
    `A2-SC25-SH01`→canonical `SS-S15-E11-…`. Был корень 18/20 падений «not found in STB».
    Идемпотентно; `getStoryboardShotById` остался строгим (опечатки падают громко).
  - `9e14c12` fix(storyboarder): число актов из СЦЕНАРИЯ (`countScriptActs`), не хардкод «3».
    E11 — первый 4-актный → дрейф (3 act-объекта, но shot_id A4 под act:3). Тройной инвариант
    `act-объекты == max(A#) в shot_id == scriptActs` → HALT на генерации.
  - `fddaed7` fix(stitch): удалённый ≤0.5с-шот исключён из completeness-гейта (автостарт) И из
    missing-проверки STITCH. Общий `isDeletedShot` + `DELETED_SHOT_MAX_SECONDS`. Был баг: гейт
    ждал аппрува удалённого кадра (STITCH не стартовал) + ручной STITCH падал на missing —
    Director обходил «читом» (утвердить удалённый кадр).
  - `ffdd212` docs(plan): CURRENT STATE refresh.

## Verify
tsc·0 · **926/926** тестов · replay-pilot·**30/30**. Live: shotId-фикс подтверждён живьём
(падения в 15:08 несли уже полный id vs короткий в 14:23).

## Дыры → лог зачатия AI EP
`memory/ai_ep_conception_gaps.md`: gap #10 (canonical shot_id — closed) + **gap #12** (Storyboarder
hardcode «3 акта», closed) дописаны с разбором. Скан всех 13 эпизодов: E01–E10 все 3-актные —
оттого нумерация «никогда не ломалась», E11 первый 4-актный вскрыл латентный баг.

## Гигиена
- Снёс **119** `tmp-*` диагностических файлов из дерева. Оставлены: 4 backup-патча в `.claude/`,
  `media_cache/`, конфиг-локали.
- **Worktree `claude/aiep` развёрнут** от master в `C:\SandyStudio\.claude\worktrees\aiep`
  (конвенция Director — worktrees живут там, НЕ в сиблинг-папке), env.local скопирован
  (6034б/32 ключа). Следующая сессия стартует ТАМ — master остаётся стабильной веткой, против
  которой крутятся серверы/Полина. master чист и запушен, переносить нечего.

## Открытые хвосты / NEXT
- **q13a — AI EP blueprint (рекомендация Тео):** синтез лога зачатия (12 боевых дыр) в дизайн
  автономного ИП. Это была ЦЕЛЬ всего прогона E11. Делать в `claude/aiep`.
- **q8b — правка борда E11** (Акт4 из `act:3` в `act:4`, shot_id не трогать) — теперь due (финал прошёл).
  [[backlog_td_e11_board_act_grouping]].
- **2-я половина 0.5-флага** — НЕ генерировать удалённый кадр [[backlog_td_05s_delete_flag]] (сделана только сборка-сторона).
- **PLAN.md >200 строк** — долг на архив-трим.
- **3 мёртвых harness-worktree** (`angry-tesla-fed2ed`, `exciting-easley-23cb75`, `exciting-khorana-1e513e`)
  нарушают cap «2+main» (CLAUDE.md §12) — удалить после апрува Director.

## Рабочая раскладка (новая дисциплина — Director 06-23)
master = интеграция + живые серверы, НЕ хан-эдитить в горячке. Код-работа → worktree `claude/*` → мерж в master.
Оркестратор НА master — это правильно (дирижёр/merge-owner), анти-паттерн был именно прямой правкой кода на master.
Env: `===5===` оставлен открытым в PLAN.md (Director рулит); следующей сессии вернуть в `===1===` если не правим.
