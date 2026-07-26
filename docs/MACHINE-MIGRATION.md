# Переезд студии на другую машину (лэптоп → десктоп)

> Заведено 2026-07-26 при переезде с лэптопа на десктоп.
> Правило: **всё, что в git, приедет само. Опасно только то, что мимо git.**

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
npm install                                          # ПОЛНЫЙ install, без --legacy-peer-deps
```
> `--legacy-peer-deps` выпиливает optional-зависимости — см. память `npm_install_legacy_peer_prunes_optionals`.

### 2. Перенести секреты (флешка / зашифрованный канал, НЕ мессенджер)
- `webapp/.env.local`
- `.claude/settings.local.json`

### 3. Перенести память и правила
- `~/.claude/projects/C--Users-Alexander-sandystudio/memory/` → в тот же путь
- `~/.claude/rules/` → в тот же путь

⚠️ **Ключ проекта = путь репо.** Папка памяти названа по пути (`C--Users-Alexander-sandystudio`).
Если на новой машине репо ляжет в ДРУГОЕ место (например `C:\SandyStudio`), Claude Code
создаст **новую пустую** папку памяти, и вся история будет «потеряна» (лежит рядом, но не
читается). Это уже случалось при прошлом переезде.
**Вывод: держи путь репо ОДИНАКОВЫМ на обеих машинах** — `C:\Users\Alexander\sandystudio`.

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
Успех = в `docs/distribution/reports/<сегодня>/<KEY>/` лежат `report.html` + `summary.md`,
в логе есть `GIST OK` и `DELIVERY OK`, на телефон пришёл текст со ссылкой.

## Локальный стек (если нужен)
`start-stack.ps1` поднимает app + self-hosted Inngest. Ключи берёт из `webapp/.env.local`.
Durable-база Inngest (`FILMS/_inngest/main.db`) — машинная, переносить НЕ надо, создастся заново.

## Что можно НЕ переносить
- `node_modules`, `.next` — ставятся/собираются заново
- `FILMS/_media_cache` — кэш медиа, перекачается из Drive по мере надобности
- `inngest.log`, `prod.log` — логи прогонов
- Ворктри `.claude/worktrees/*` — временные; незакоммиченную работу в них перед переездом
  либо закоммитить, либо потерять (проверь `git -C <worktree> status` в каждом!)
