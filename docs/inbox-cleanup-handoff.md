# Разовая чистка Director Inbox — хендофф в локальную сессию

**Создан:** 2026-07-25 · **Автор:** cloud-сессия · **Кому:** локальная сессия Claude Code на машине Директора

Облачная сессия не имеет доступа к боевой БД: в свежем клоне нет `webapp/.env.local`,
стек не поднят, а подключённый Supabase-аккаунт не видит проект `akstennzrnkvexjgzhxv`.
Поэтому саму чистку выполняет локальная сессия — там есть и ключи, и стек.

**Как использовать:** скопировать блок ниже целиком и вставить в локальную сессию Claude Code
в корне `C:\SandyStudio`. Блок самодостаточен.

---

## Промпт — копировать отсюда

```text
===5===

Задача: разово вычистить Director Inbox от старого хлама и убедиться, что он больше не
набивается сам. master уже содержит нужные эндпоинты (PR #42 + follow-up). Если локальная
копия старее — сначала `git pull origin master`, затем `start-stack.ps1 -Build`.

КОНТЕКСТ — почему инбокс забит (уже выяснено, не переисследуй):
  1. Inbox склеен из двух источников (webapp/app/api/director/inbox/route.ts):
     ассеты в status=REVIEW и события activity_events с resolved_at IS NULL.
  2. Ассеты самоочищаются при любом решении. События — нет: до PR #42 единственным
     писателем resolved_at был разбор Bible-расширений, поэтому decision_requested /
     input_requested / blocker_raised / budget_threshold_reached лежали вечно.
  3. Главное: до follow-up фикса Inbox ВООБЩЕ не смотрел на статус эпизода — ассеты и
     события из ARCHIVED и COMPLETE эпизодов висели в триаже навсегда. Это и есть
     «старый хлам, которого вообще не должно быть видно».

ПЛАН — по шагам, после каждого показывай числа Директору.

ШАГ 1 — инвентаризация (только чтение, ничего не меняем).
  Через Supabase MCP (или psql) на проекте akstennzrnkvexjgzhxv собери и покажи таблицей:
    a) сколько ассетов в status='REVIEW' — всего и в разбивке по эпизоду (episode_code)
       и file_type;
    b) сколько из них принадлежит эпизодам со статусом ARCHIVED или COMPLETE;
    c) сколько незакрытых событий (resolved_at IS NULL) по event_type из набора:
       decision_requested, input_requested, blocker_raised, budget_threshold_reached,
       canon_extension_proposed, rule_proposal — всего и по эпизодам;
    d) сколько из них привязано к ARCHIVED/COMPLETE эпизодам и сколько с episode_id IS NULL;
    e) какие эпизоды вообще есть: episode_code, status, created_at — отсортируй по коду.
  НИЧЕГО не пиши. Это снимок «до».

ШАГ 2 — спроси Директора, где граница живого.
  Покажи список эпизодов из 1(e) и спроси нумерованными вопросами:
    q1: какие эпизоды считаем законченными/мусорными и переводим в ARCHIVED?
        Опора: CLAUDE.md §6 — при studio_version < 1.0 эпизоды E01–E12 это тренировочные
        эксперименты, НЕ продакшн-каталог, обратной совместимости не заслуживают.
        Директор называл границу «до E31 включительно». Предложи конкретный список и жди
        подтверждения.
    q2: события без привязки к эпизоду (episode_id IS NULL) — тоже чистим?
  НЕ угадывай за Директора. Границу подтверждает он.

ШАГ 3 — архивировать подтверждённые эпизоды.
  Для каждого подтверждённого в q1: перевести episodes.status в 'ARCHIVED' и заполнить
  metadata.archival по схеме миграции 0029: {state, completed_shots, total_shots, reason,
  final_cut_asset_id, final_cut_path, archived_at, archived_by:'Director'}.
  reason — короткая честная причина («тренировочный эксперимент, studio_version<1.0»).
  Предпочти существующий UI/API эпизода, если он это умеет; иначе SQL.
  Это главный шаг: после него Inbox сам перестанет показывать их ассеты и события,
  потому что GET /api/director/inbox теперь исключает ARCHIVED и COMPLETE.
  После шага перезагрузи /inbox и покажи, сколько осталось.

ШАГ 4 — добить остаток через API (не прямым SQL, чтобы записался аудит).
  Стек поднят. Токен — EXEC_DIR_AI_TOKEN из webapp/.env.local.
    curl -s -X POST http://localhost:3000/api/director/inbox/clear ^
      -H "Authorization: Bearer %EXEC_DIR_AI_TOKEN%" ^
      -H "content-type: application/json" ^
      -d "{\"filter\":\"all\",\"include_assets\":true}"
  (В PowerShell — $env:EXEC_DIR_AI_TOKEN и обычные кавычки.)
  Вернёт {cleared, assets_hidden}. Покажи числа.
  Что этот вызов НЕ делает, и это намеренно:
    - не утверждает и не отклоняет ни один ассет — status остаётся REVIEW, ни одно
      событие DAG не стреляет;
    - не трогает canon_extension_proposed (предложения канона лежат внутри события)
      и rule_proposal (правки Skill Editor — указание Директора 2026-07-25).
  Спрятанные ассеты обратимы: фильтр `hidden` на /inbox → «Restore all», либо тот же
  эндпоинт с {"restore":true}.

ШАГ 5 — что осталось разобрать руками.
  После шага 4 останутся только canon_extension_proposed и rule_proposal. Покажи их
  списком (заголовок, эпизод, дата) и спроси Директора: разбирать сейчас или оставить.
  Сам не решай — это стоящие решения, а не шум.

ШАГ 6 — проверка и фиксация.
  - Сними снимок «после» тем же запросом из шага 1 и покажи рядом со «до».
  - Проверь, что бейдж в левом рейле показал новое число (поллит /api/director/inbox раз
    в 8 секунд).
  - Ritual 3: npx tsc --noEmit · npm test -- --run · npm run replay-pilot — опубликуй числа.
    На Windows все тесты должны быть зелёные. Тест
    __tests__/api/storage-probe.test.ts «rejects traversal even when normalised» падает
    только на Linux (проверяет Windows-путь C:\foo\..\bar) — у тебя он должен пройти.
  - Ritual 1: обнови PLAN.md ## CURRENT STATE (PLAN.md правится ТОЛЬКО на master, §12).
  - Ritual 4: заметка session_YYYY-MM-DD_inbox_cleanup.md в память + ссылка из MEMORY.md.

ГРАНИЦЫ — чего не делать ни при каком раскладе:
  - не делать массовый APPROVE ассетов — это утверждение творческих гейтов пачкой без
    просмотра;
  - не делать массовый REJECT/REVISION — агенты уйдут перегенерировать, это деньги и время
    за то, что Директор просто хотел убрать с глаз;
  - не удалять строки из assets или activity_events. Чистка — это скрытие из триажа,
    а не удаление истории;
  - не трогать LOCKED-ассеты;
  - не перезапускать стек посреди живого прогона (CLAUDE.md §7/§12).
```

---

## Чем это опирается на код

| Что | Где |
|---|---|
| Источники инбокса + исключение ARCHIVED/COMPLETE | `webapp/app/api/director/inbox/route.ts` |
| Эндпоинт чистки (`include_assets`, `restore`) | `webapp/app/api/director/inbox/clear/route.ts` |
| Что чистится, а что нет | `webapp/lib/api/inbox-clear.ts` |
| Схема архивации эпизода | `webapp/supabase/migrations/0029_episodes_archive.sql` |
| Правила UX инбокса | `specs/system/director_inbox.md §8.3` |
| Легаси-эпизоды не заслуживают back-compat | `CLAUDE.md §6` (Studio Version & Compatibility Gate) |
