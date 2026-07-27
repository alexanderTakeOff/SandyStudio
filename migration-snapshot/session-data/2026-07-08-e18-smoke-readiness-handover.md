# HANDOVER → E18 FULL SMOKE (свежая сессия, старт с master + worktree)

**Дата:** 2026-07-08 (вечер) · **Автор:** Тео · **Проект:** SandyStudio (C:\SandyStudio)
**Для:** новой сессии, чистая голова, цель дня — E18 полный смоук.

---

## TL;DR (прочитай это первым)

master **зелёный и укреплён** (`32d201b`): системный fetch-timeout влит (E17-firefight закрыт),
сломанный master починен (listThemes), PLAN.md обновлён. Смоук-код готов.
**НО E18 как эпизода ещё НЕТ** — его надо создать, и есть 2 решения Директора про автономию
(деньги/риск), которые надо принять ДО запуска. Они ниже в блоке «⛔ РЕШЕНИЯ».

---

## ШАГ 0 — старт сессии (ритуал §9 + рабочее место)

1. Прочитать `CLAUDE.md` → `PLAN.md` (свежий, `Date: 2026-07-08`) → `specs/glossary.md`.
2. Режим стартует `===1===`. Для правок/запуска Директор даёт `===5===`.
3. **Рабочее место — ПЕРЕИСПОЛЬЗОВАТЬ готовый worktree** (не плодить, лимит 2+main):
   `C:\SandyStudio\.claude\worktrees\fetch-timeout-swaps` — уже на ветке `master` @ `32d201b`,
   `node_modules` через junction на главную копию (deps готовы, tsc/vitest работают).
   - Свежая ветка под E18: `cd .claude/worktrees/fetch-timeout-swaps && git fetch origin &&
     git checkout -B teo/e18-smoke origin/master`
   - ⚠️ `.claude/worktrees/e18smoke` и `festive-spence-a7ff79` — **пустышки-стабы** (не
     зарегистрированные worktree, git из них всплывает в главный .git). НЕ работать в них.

---

## СОСТОЯНИЕ (проверено сегодня)

| Пункт | Статус |
|---|---|
| master | `32d201b` — tsc·0, vitest 1149/1149 |
| fetch-timeout свап | ✅ ЗАВЕРШЁН (27 fetch в 13 провайдерах → `fetchWithTimeout`, PR #31) |
| listThemes / красный master | ✅ ПОЧИНЕНО (PR #32) |
| inngest-cli pin | ✅ `1.33.0` (в `npm run inngest:dev`) |
| CHECKERS_FREE_TIER | ✅ выставлен (критики на платный Anthropic, не free-gemini) |
| CONCIERGE_PROVIDER | выставлен (Полина) — проверить какой перед смоуком |
| **MECHANICS_AUTO_ADVANCE** | ❌ OFF/не выставлен (это и есть тест дня — см. решения) |
| **E18 эпизод** | ❌ НЕ существует (нет `e18` в FILMS). Тема-кандидат «The Vending Machine» (draft в Themes, q4 2026-06-30) |

---

## ⛔ РЕШЕНИЯ ДИРЕКТОРА (принять ДО запуска — деньги/риск, НЕ Тео)

**q1 — тема/эпизод E18.** Создать E18. Кандидат «The Vending Machine» (draft-тема в Themes) —
или другая из `FILMS/Sandy/episode_ideas.md`. Нужен бриф → каст → и т.д. (полный пайплайн).

**q2 — включаем MECHANICS_AUTO_ADVANCE (главный смысл смоука)?** Флаг построен на автоспринте
2026-07-04, НИ РАЗУ не смоук-тестился (E16 пропустил — шёл ручным путём). Включать ТОЛЬКО:
  - **с НАЧАЛА чистого эпизода** (не в середине — иначе авто-аппрув REVIEW-рефов → каскад в
    платное видео);
  - **с зарезервированными пилотами** `episodes.metadata.eref_pilot_shot_ids` (визуальный гейт
    Директора держится — reconciler их не авто-аппрувит);
  - на **стабильном сервере** (`inngest start` + `next build && next start`, НЕ dev-churn —
    dev-роутер роняет хвост пачки, память `inngest_dev_router_unreliable`).

**q3 — известная бага reconciler-триажа (риск денег).** `reconcile.ts:166-172` ВСЁ ЕЩЁ слепо
авто-аппрувит critic-less артефакты (ref_image/video) для не-reserved шотов («no gating critic →
approve»). Смягчается ТОЛЬКО резервом пилотов (q2). Полный фикс (светофор 🟢GREEN=код оптом /
🟠REVISE=Полина поштучно / 🔴FAIL=Директор; картинки — не слепой штамп) — НЕ сделан.
  - Вариант A: жить с багой, но **надёжно зарезервировать пилоты** → визуальный гейт держит.
  - Вариант B: сначала починить триаж (отдельный PR, ~полдня), потом смоук.
  Детали: память `backlog_enable_mechanics_auto_advance_smoke` + `docs/analysis/E16-run-defects.md`.

---

## ГОТОВ / НЕ ТРЕБУЕТ ДЕЙСТВИЙ

- Провайдеры больше не виснут (fetch-timeout) — стадия не встанет на зависшем сокете.
- Casting-фикс A+C влиты (Writer гейтится на approved-каст; каст рождается REVIEW, не DRAFT).
  Открыто (не блокер): B — readiness-preflight должен ворнить «каст есть, но не APPROVED»
  вместо молчаливого all-canon fallback (`backlog_td_casting_draft_deadend`).

## ПОДУЧИТЬ ПОЛИНУ (перед/во время смоука — память)

- НЕ звать дизайнеров вместо критиков; НЕ аппрувить в обход гейта в bold Mode 3
  (`nudge_polina_dont_act_for_her`, память про bold-approve override).
- ВЕСТИ≠ЧИНИТЬ: Полина ведёт эпизод; Тео-инженер только правит код фабрики
  (`autonomous_factory_architecture_doctrine`).

## ПЕРВЫЕ ДЕЙСТВИЯ СМОУКА (после решений q1-q3)

1. Свежая ветка `teo/e18-smoke` от `origin/master` в готовом worktree (ШАГ 0).
2. Создать E18 (тема из q1) → бриф.
3. Записать `eref_pilot_shot_ids` (пилоты) [если q2=включаем].
4. `MECHANICS_AUTO_ADVANCE=true` [если q2] → поднять СТАБИЛЬНЫЙ сервер (не dev).
5. Полина: fanout → наблюдать `reconcile/auto-approved` + `reconcile/halt`.
6. Первый ЧЕСТНЫЙ замер автономии (E17 был грязный — не эталон).
7. Диагностика затыка: СНАЧАЛА лог сервера (`%LOCALAPPDATA%\Temp\*inngest*.log`, `:8288/v1`,
   pprof `:8288/debug/pprof/goroutine`), ПОТОМ теории.

## ССЫЛКИ

- PR #31 (fetch-timeout) · PR #32 (listThemes) — оба merged.
- Память: `backlog_enable_mechanics_auto_advance_smoke` (PINNED), `provider_fetch_no_timeout_root_cause`
  (обновлена — свап done), `inngest_dev_router_unreliable`, `autonomous_factory_architecture_doctrine`,
  `backlog_td_casting_draft_deadend`.
- Прошлый E17-конспект: `~/.claude/session-data/2026-07-07-fetch-timeout-rootcause-session.tmp`.
