---
name: hog_daily_report_loop
description: "Дневной авто-отчёт Head of Growth: мускул (hog-snapshot.mts → JSON) + мозг (headless claude по daily-prompt.md → артефакт+пуш); лаунчер+таск = гейт Директора; бьёт в ГЛАВНЫЙ репо"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0c605939-745e-4da8-a7fa-98429760feb1
  modified: 2026-07-25T10:13:06.705Z
---

# Дневной авто-отчёт Head of Growth (07-25, локальная фаза «а»)

Директор попросил: каждый день автоматически готовить такой же отчёт, как 25 июля.
Модель-поправка: **сессию НЕ держим живой** — каждое утро поднимается свежая headless-сессия,
делает отчёт и гаснет (надёжнее долгой). Архитектура = мускул + мозг (доктрина фабрики).

## Что легло на master (`7523a0fd`)
- `webapp/scripts/hog-snapshot.mts` — **мускул**, read-only. Реюзает провайдеры
  (`youtube-stats`, `youtube-reporting`, `youtube`) через ДИНАМИЧЕСКИЙ import (tsx
  ломает статические именованные импорты .ts). Пишет `docs/distribution/snapshots/<date>.json`.
  Запуск: `cd webapp && node --env-file=.env.local --import tsx scripts/hog-snapshot.mts`.
- `webapp/scripts/hog/daily-prompt.md` — **мозг**, железные инструкции (лестница роста,
  лаг метрик, только реальные числа из JSON).
- `webapp/scripts/hog/report-reference.html` — эталон дизайна (песочные часы = воронка).
- `docs/distribution/reports/2026-07-25/report.html` — сид-отчёт.

## КРИТИЧНО: бьёт в ГЛАВНЫЙ репо, не в ворктри
Дневная задача обязана работать из `C:\Users\Alexander\sandystudio` — там `node_modules`,
`.env.local`, tsx. В ворктри их нет; ворктри удаляют. Потому файлы коммичены прямо на master.

## Первый автономный прогон 07-25 13:36 (`c2f3befd`)
- **Мускул не снимал удержание** — центральную метрику доктрины. Починено: `hog-snapshot.mts`
  тянет `avgViewPercentage` + `avgViewDuration` через существующий `getVideoAnalytics`,
  гвард `isCompletionReadable` (0..100], сырое значение хранится рядом. Сид-отчёт 12:52 брал
  эти числа отдельным живым запросом — в JSON их не было, т.е. луп бы ослеп на второй день.
- **PushNotification есть, но не доставляется**: «Mobile push not sent (Remote Control inactive)».
  Значит native-пуш ≠ телефон, пока Remote Control выключен → ntfy-фолбэк остаётся нужным.
- Сравнение по-видео со снапшотом 07-21 (`.md`) **невозможно** — другой инструмент, метрика
  окна CSV; сопоставимы только канальные тоталы. Первый настоящий day-over-day будет 07-26.

## Луп поставлен на рельсы 07-25 (`ba8087d8`) — 4 дефекта пойманы РАНТАЙМОМ

Лаунчер `webapp/scripts/hog-daily.ps1` в git; задача `\SandyStudio\SandyStudio_HoG_Daily`
Ready, Daily 09:00 (Дубай). Ни одного из этих дефектов чтение кода не дало бы — все четыре
видны только в живом прогоне и в самом ntfy-топике:

1. **ntfy отдавал вложение вместо текста.** `-Body ([Text.Encoding]::UTF8.GetBytes(...))` без
   `-ContentType` → PowerShell шлёт `application/octet-stream` → ntfy кладёт файлом, на телефон
   приходит «You received a file: attachment.txt», текста НЕТ. При HTTP 200 и чистом логе —
   `PUSH FAIL` не пишется. Проверять доставку надо **опросом топика**
   (`GET https://ntfy.sh/<topic>/json?poll=1&since=12h`), а не по логу. Фикс: `-ContentType
   'text/plain; charset=utf-8'`.
2. **`run.log` был single-writer.** Два прогона в одну минуту → второй умирает ЦЕЛИКОМ на первой
   строке: PowerShell открывает файл редиректа ДО выполнения команды, поэтому ни `node`, ни
   `claude` вообще не стартуют (это же свойство спасло от двух мозгов разом). Фикс: `run-<HHmm>.log`.
3. **Лог писался UTF-16** (`>` в PS 5.1) → grep/Select-String по нему кривые. Фикс: один хелпер
   `Out-File -Encoding utf8 -Append` вместо шести инлайн-редиректов; `*>&1 | L` ловит и stderr.
4. **`Write(webapp/**)` в `.claude/settings.local.json` не матчится** файловыми проверками —
   работают только `Edit(...)`-правила (они покрывают все пишущие инструменты). `Edit(webapp/**)`
   там уже был → лишнее правило удалено. Файл в gitignore, правка только локальная.

## 🔴 ГЛАВНОЕ: PS 5.1 СТИРАЛ КИРИЛЛИЦУ ПРОМПТА В `?` (`c4b1240d`)

A/B-проба в реальный `claude -p`: мозг получал `??????? ???????? ?????? … 42` — headless-сессия
сама написала «сообщение пришло битым». Все прогоны до 07-25 14:20 отчёт делался на английских
словах + структуре + файлах репо, БЕЗ русских инструкций. Два независимых слоя одной порчи:

1. **`$OutputEncoding` в PS 5.1 = ASCII** → пайп в нативный exe заменяет кириллицу на `?`.
   Правильного чтения файла НЕДОСТАТОЧНО (проверено: вариант «только -Encoding UTF8» тоже даёт `??`).
   Нужны ОБА: `$OutputEncoding` и `[Console]::OutputEncoding` = `New-Object Text.UTF8Encoding $false`.
2. **`Get-Content -Raw` под 5.1 читает UTF-8-БЕЗ-BOM как ANSI** → `Ð¢Ñ‹ â€”`. И `daily-prompt.md`,
   и `summary.md` без BOM. Лечится `[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8)`.

**Урок про верификацию:** фикс `-ContentType` я «проверил» литеральной строкой в pwsh — и он прошёл,
скрыв, что реальный путь (файл + PS 5.1) всё равно отдаёт мохибак. **Проверять надо тем же
интерпретатором и тем же источником данных, что в проде**, иначе тест зелёный, а прод битый.

**Доставка (q17a):** выжимка `text/plain` + `report.html` вложением (`-Method Put -InFile`,
заголовок `Filename`, `-ContentType text/html` → телефон рендерит, а не скачивает). **Вложение
живёт 3 ЧАСА** (`attachment.expires`), текст 12ч, отчёт — в git. Значит пуш в 9:00 → тап-ссылка
мертва после 12:00. `daily-prompt.md` шаги 4–6 переписаны: Artifact убран, html обязан быть
САМОДОСТАТОЧНЫМ (из вложения внешние CSS/шрифты не подтянутся), доставка снята с мозга.

**Планировщик зовёт `powershell.exe` = PS 5.1** (`pwsh` 7.6.4 — это интерактив Директора). PS 5.1
читает UTF-8 **без BOM как ANSI**, поэтому лаунчер держим **чистым ASCII** (проверено: nonASCII=0).
Регистрация в КОРНЕ планировщика и триггер `-AtLogOn` требуют админа → задача в подпапке, вместо
logon-триггера `-StartWhenAvailable` (догоняет пропущенный запуск сам).

## `Artifact` В HEADLESS НЕ СУЩЕСТВУЕТ (проверено списком инструментов)

`claude -p` отдаёт: Agent, Bash, Edit, Glob, Grep, PowerShell, Read, ReportFindings,
ScheduleWakeup, Skill, ToolSearch, Workflow, Write, Cron*, DesignSync, Enter/ExitWorktree,
Monitor, NotebookEdit, **PushNotification**, RemoteTrigger, SendMessage, Task*, WebFetch,
WebSearch. **`Artifact` отсутствует** — он только в интерактивной сессии. Следствия: шаг 4
`daily-prompt.md` («опубликуй инструментом Artifact») невыполним в принципе, `Artifact` в
`--allowedTools` был мёртвым весом (убран), и **ссылки на отчёт в пуше быть не может** пока не
выбран другой механизм. Живые варианты: ntfy-вложение `report.html` (тап открывает в браузере,
живёт ~12ч) либо push в origin + заголовок `Click` на GitHub (там HTML не рендерится, нужен Pages).
`PushNotification` в headless ЕСТЬ, но требует спаренного мобильного («Remote Control inactive»).

## Открыто (гейт Директора — НЕ обходить)
- **`Start-ScheduledTask` блокирует auto-классификатор** — задача поднимает `claude -p` с
  pre-granted правами (acceptEdits+allowedTools) неприсмотренно. Запускать вручную должен
  Директор (`! powershell -NoProfile -ExecutionPolicy Bypass -File …\hog-daily.ps1`).
- Прогон **26 июл 09:00** — ПЕРВЫЙ, где мозг получит инструкции целиком. Сверить его отчёт с
  отчётом 07-25: тот сделан на «слепом» промпте, т.е. качество может заметно вырасти.
- Вложение живёт 3ч — если Директор читает пуш днём, тап-ссылка мертва. Постоянная ссылка
  требует GitHub Pages (репо приватный, raw без авторизации не отдаётся) — не строили.
- **Пуш на телефон:** зависит от наличия PushNotification в headless. Фолбэк = файл+артефакт
  всегда сохраняются. Робастная альтернатива если native-пуша нет: ntfy.sh (приватный топик).
- Старой задачи `SandyStudio_YT_Snapshot` на ЭТОЙ машине НЕТ (была на десктопе) — причина
  «4 дней тишины» снапшотов. Новый луп её замещает.
- Фаза «b» (машинно-независимо в облаке) — отложена: облаку нужны локальные ключи, отдельный разговор.

Связано: [[backlog_shorts_reach_no_sub_conversion_seriality]] · [[autonomous_factory_architecture_doctrine]] ·
[[experiment_carwash_first6s_retention_cut]].
