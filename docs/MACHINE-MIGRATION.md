# Переезд студии на другую машину (лэптоп → десктоп)

> Заведено 2026-07-26 при переезде с лэптопа на десктоп.
> Правило: **всё, что в git, приедет само. Опасно только то, что мимо git.**

## ⚡ Автоматический путь (q10a, 2026-07-26) — используй его

Руками переносится ТОЛЬКО `webapp/.env.local` (секреты). Остальное — два скрипта
в корне репо (git = канал переноса; ключ проекта и пути машин вычисляют сами):

1. **Старая машина:** `.\migrate-pack.ps1` — память + session-data + `~/.claude/rules`
   + `settings.local.json` → `migration-snapshot/` → commit+push; снимает задачу HoG.
2. **Новая машина:** `git pull` → скопировать `.env.local` руками → `.\migrate-unpack.ps1`
   — раскладывает по местам (снапшот перезаписывает одноимённое, уникальное локальное
   не трогает), регистрирует задачу HoG, удаляет снапшот из git.
3. Дальше: `cd webapp; npm install` (полный) → `.\start-stack.ps1 -Build`.

Разные пути репо на машинах — ОК: хуки/лаунчеры path-agnostic (90f2133c + фикс
`hog-daily.ps1` от 2026-07-26), ключ памяти вычисляется из фактического пути.
Ручной путь ниже — запасной, если скрипты недоступны.

## Что НЕ поедет через git (перенести руками)

| Что | Где лежит | Почему нельзя в git |
|---|---|---|
| **`webapp/.env.local`** | корень webapp, ~10 КБ | СЕКРЕТЫ: `GOOGLE_*`, `YOUTUBE_REFRESH_TOKEN*`, `SUPABASE_SERVICE_ROLE_KEY`, ключи провайдеров |
| **`.claude/settings.local.json`** | корень репо, ~10 КБ | локальные правила разрешений |
| **Память сессий** (~156 файлов) | `~/.claude/projects/C--Users-Alexander-sandystudio/memory/` | вне репо, привязана к пути проекта |
| **Глобальные правила ECC** (15 файлов) | `~/.claude/rules/common/` | вне репо |
| **Задача планировщика** `SandyStudio_HoG_Daily` | Windows Task Scheduler | машинная |
| **Авторизация `gh`** | keyring Windows | машинная |
| `node_modules` | webapp | ставится заново |

## Порядок на НОВОЙ машине

### 1. Забрать код
```
git clone <origin> C:\Users\Alexander\sandystudio    # или git pull, если репо уже есть
cd C:\Users\Alexander\sandystudio\webapp
npm install                                          # ПОЛНЫЙ install, без флагов
```
> Никаких флагов. `--legacy-peer-deps` больше не нужен: неиспользуемый
> `@react-three/drei` (тянул peer `fiber@^8` и `@react-spring` с `react<=18`)
> вырезан в `3b566732`, дерево решается чисто. Если `npm install` снова упадёт
> с ERESOLVE — лечи причину в `package.json`, НЕ добавляй флаг: старый lock
> родился под флагом и недосчитывал optional-бинарники.
> Опасен ТОЧЕЧНЫЙ `npm install <один-пакет>` — он выпиливает те же optional-бинарники
> (`@esbuild/win32-x64`, `sharp`) и ломает `tsx`. Ставь только ПОЛНЫЙ install.
> См. память `npm_install_legacy_peer_prunes_optionals`.

### 2. Перенести секреты (флешка / зашифрованный канал, НЕ мессенджер)
- `webapp/.env.local`
- `.claude/settings.local.json`

⚠️ **Секреты переносятся, ПУТИ — нет.** В `.env.local` могут сидеть значения с путями
прошлой машины (2026-07-27 приехал `FFMPEG_PATH=C:\Users\Alexander\...` — мёртвый на
десктопе). После переноса проверь все path-подобные значения:
```powershell
cd webapp
Get-Content .env.local | ForEach-Object { if ($_ -match '^\s*([A-Za-z_]\w*)\s*=\s*"?([A-Za-z]:\\.*?)"?\s*$') {
  "$(if (Test-Path -LiteralPath $matches[2]) {'OK  '} else {'MISS'}) $($matches[1])" } }
```
Что нашлось `MISS` — либо поправь под эту машину, либо **удали**, если код умеет
искать сам (`FFMPEG_PATH` именно такой: `resolveFfmpegPath()` идёт PATH → winget-glob
→ unix-пути, поэтому его правильнее не задавать вовсе).

### 3. Перенести память и правила
- `~/.claude/projects/C--Users-Alexander-sandystudio/memory/` → в тот же путь
- `~/.claude/rules/` → в тот же путь

ℹ️ **Ключ проекта = путь репо — но `migrate-unpack.ps1` это уже учитывает.** Папка памяти
названа по пути (`C:\SandyStudio` → `C--SandyStudio`), поэтому при переносе «как файлы»
разные пути на машинах = потерянная память. Скрипт считает ключ из ФАКТИЧЕСКОГО пути
(`migrate-unpack.ps1:15`) и кладёт память куда надо: переезд 2026-07-27
`C:\Users\Alexander\sandystudio` (лэптоп) → `C:\SandyStudio` (десктоп) прошёл штатно,
159 файлов на месте. **Одинаковый путь больше не требование — требование пользоваться
скриптом**, а не копировать `~/.claude/projects/*` руками.

### 4. Авторизации
```
gh auth login          # нужен scope 'gist' — иначе дневной отчёт не опубликует ссылку
gh auth status
```
YouTube/Drive/Supabase авторизации живут в `.env.local` (шаг 2), заново получать не надо.

### 5. Дневной отчёт Head of Growth
Проверить путь внутри лаунчера `webapp/scripts/hog-daily.ps1` (переменная `$repo`) — он
ДОЛЖЕН совпадать с реальным расположением репо. Затем зарегистрировать задачу:

```powershell
$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\Users\Alexander\sandystudio\webapp\scripts\hog-daily.ps1"'
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable
Register-ScheduledTask -TaskName 'SandyStudio_HoG_Daily' -TaskPath '\SandyStudio\' -Action $a -Trigger (New-ScheduledTaskTrigger -Daily -At '09:00') -Settings $s -Description 'Head of Growth daily channel report' -Force
```
> Регистрация в КОРНЕ планировщика и триггер `-AtLogOn` требуют админа — поэтому подпапка
> `\SandyStudio\` + `-StartWhenAvailable` (сам догоняет пропущенный запуск).
> Планировщик зовёт `powershell.exe` = **PS 5.1**, поэтому лаунчер обязан оставаться
> чистым ASCII (PS 5.1 читает UTF-8 без BOM как ANSI).

**На СТАРОЙ машине задачу удалить**, иначе два прогона будут драться за один ntfy-топик и
плодить дубли гистов:
```powershell
Unregister-ScheduledTask -TaskName 'SandyStudio_HoG_Daily' -TaskPath '\SandyStudio\' -Confirm:$false
```

### 6. Проверка, что переехали без потерь
```
cd C:\Users\Alexander\sandystudio
git log --oneline -3                 # последние коммиты на месте
git status                           # чисто
cd webapp && npx tsc --noEmit        # типы
node --env-file=.env.local --import tsx scripts/hog-channels.mts   # видит паспорта каналов
```
Затем разовый прогон лупа (займёт ~10 мин, потратит токены):
```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Alexander\sandystudio\webapp\scripts\hog-daily.ps1"
```
Успех = в `FILMS/_distribution/reports/<сегодня>/<KEY>/` лежат `report.html` + `summary.md`
(переехало 15.08 из `docs/`, чтобы отчёты не множились по веткам; путь переопределяется
`$env:DIST_REPORTS_DIR`), в логе есть `GIST OK` и `DELIVERY OK`, на телефон пришёл текст
со ссылкой. Снимки при этом ложатся в `docs/distribution/snapshots/` и коммитятся —
там поля, которых в БД нет: показы, CTR, средний процент досмотра.

## Локальный стек (если нужен)
`start-stack.ps1` поднимает app + self-hosted Inngest. Ключи берёт из `webapp/.env.local`.
Durable-база Inngest (`FILMS/_inngest/main.db`) — машинная, переносить НЕ надо, создастся заново.

## Что можно НЕ переносить
- `node_modules`, `.next` — ставятся/собираются заново
- `FILMS/_media_cache` — кэш медиа, перекачается из Drive по мере надобности
- `inngest.log`, `prod.log` — логи прогонов
- Ворктри `.claude/worktrees/*` — временные; незакоммиченную работу в них перед переездом
  либо закоммитить, либо потерять (проверь `git -C <worktree> status` в каждом!)
