# -----------------------------------------------------------------------------
# start-stack.ps1 - bring up the SandyStudio local stack (durable, self-hosted).
#
#   Double-click  start-stack.cmd   - or -   right-click this file -> Run with PowerShell
#   Rebuild the app first (after code changes):  pwsh -File start-stack.ps1 -Build
#
# Starts, both in their own minimized windows with logs to file:
#   * App        -> npm run start        on :3000   (prod.log)
#   * Inngest    -> inngest start        on :8288   (inngest.log)  <- SELF-HOSTED,
#     durable (SQLite snapshots survive a crash). NOT `inngest dev` - that was
#     ephemeral and zombied jobs on a silent crash (E27 Tier-0 fix, 2026-07-11).
# Then syncs functions (PUT /api/inngest) and prints health.
# Keys are read from webapp/.env.local - never hardcoded here (this file is in git).
# -----------------------------------------------------------------------------
# 2026-08-06 — порты стали параметрами, потому что деревьев теперь ДВА: master в
# C:\SandyStudio и новая парадигма в C:\SandyStudio-nx. До этой правки скрипт был
# прибит к :3000/:8288 И УБИВАЛ ЛЮБОЙ `next start` — то есть запуск второго дерева
# гасил первое. Дефолты прежние, так что старый вызов работает как работал.
# D65 (2026-08-07): у Inngest ДВА порта, а параметризовали один. `--port` двигает только
# API/UI; connect-gateway висит на своём собственном (дефолт 8289) и НЕ следует за ним.
# Поэтому второе дерево, поднятое на 8289, падало с `listen tcp :8289: bind: Only one usage
# of each socket address` — молча, в свой лог, оставляя приложение живым и без Inngest.
# Дефолт гейтвея выводим из порта: InngestPort + 1, как у самой Inngest.
param(
  [switch]$Build,
  [int]$Port = 3000,
  [int]$InngestPort = 8288,
  [int]$InngestGatewayPort = 0
)
if ($InngestGatewayPort -eq 0) { $InngestGatewayPort = $InngestPort + 1 }

# Path-agnostic: resolve everything relative to THIS script's folder (the repo
# root), so the same launcher works on any machine / clone path (desktop
# C:\SandyStudio and laptop C:\Users\Alexander\sandystudio alike).
$RepoRoot  = $PSScriptRoot
$Web       = Join-Path $RepoRoot 'webapp'
$SqliteDir = Join-Path $RepoRoot 'FILMS\_inngest'
$InngestCli = 'inngest-cli@1.33.0'
# Клон Полины (2026-08-09): её рабочая поверхность И адресат моста ниже. Одна константа
# на обе роли — второго списка «где живёт клон» не заводим.
$PolinaClone = 'C:\SandyStudio-polina'

# ГОВОРЯЩИЙ ОТКАЗ — самой первой строкой, до Set-Location и до любого Stop-Process
# (2026-08-09, Директор). Клон Полины — рабочая поверхность headless-сессии, не станок:
# лаунчеры приехали туда клоном репозитория и прибиты к дефолтам :3000/:8288, то есть к
# портам МАСТЕРА. Приложение и Inngest на занятых портах молча не встанут (отказ уйдёт в
# лог, на экране будет «Stack up»), а блок моста ниже стартует БЕЗУСЛОВНО. Итог двойного
# клика здесь: серверов ноль, мостов два — а два моста читают одну строку Директора и оба
# спавнят ход (двойной ответ, двойные деньги, гонка за один session_id). Стоп-фаза их не
# разведёт: она гасит процессы со СВОИМ корнем в командной строке, а мост из клона несёт
# чужой, и переживает любое число рестартов.
# ВЕСЬ ТЕКСТ НИЖЕ — ASCII, и это не стилистика. `powershell.exe` 5.1 читает .ps1 без BOM
# как ANSI: кириллица в КОММЕНТАРИЯХ безвредна (парсер их пропускает — потому файл жил с
# ней всегда), а кириллица в СТРОКОВОМ ЛИТЕРАЛЕ рвёт парсер, и скрипт падает
# ParserError'ом вместо того, чтобы отказать. Проверено живьём 09.08: отказ, написанный
# по-русски, не отказал. Сообщение, которое обязано сработать, не имеет права зависеть от
# кодировки файла.
if ($RepoRoot.TrimEnd('\') -ieq $PolinaClone.TrimEnd('\')) {
  Write-Host ''
  Write-Host '  ==============================================================' -ForegroundColor Red
  Write-Host '   STOP. This is POLINA CLONE - the stack is NOT started here.' -ForegroundColor Red
  Write-Host '  ==============================================================' -ForegroundColor Red
  Write-Host ''
  Write-Host "  Tree:    $RepoRoot" -ForegroundColor Yellow
  Write-Host '  Role:    working surface of Polina headless session (the bridge spawns her HERE).' -ForegroundColor Yellow
  Write-Host '  Why not: launchers here default to :3000/:8288 - the MASTER ports. App and' -ForegroundColor Yellow
  Write-Host '           Inngest would silently fail on busy ports, but the BRIDGE would start' -ForegroundColor Yellow
  Write-Host '           and become the SECOND one. Two bridges double every Polina turn:' -ForegroundColor Yellow
  Write-Host '           double answer, double money, race for one session_id.' -ForegroundColor Yellow
  Write-Host ''
  Write-Host '  The stack lives in the WORK tree:  C:\SandyStudio-nx  ->  start-stack-nx.cmd' -ForegroundColor Cyan
  Write-Host '  (Polina bridge comes up from there by itself - no separate action needed)' -ForegroundColor Cyan
  Write-Host ''
  Read-Host 'Enter to close'
  exit 1
}

Set-Location $Web

# Где мы и на каких портах — В НАЧАЛЕ, а не только в конце: деревьев несколько, и окно
# читают в момент запуска, а не через 20 секунд. Литералы — ASCII по причине выше.
$TreeName = if ($RepoRoot -match 'SandyStudio-nx$') { 'WORK TREE (nx) - new paradigm' }
            elseif ($RepoRoot -match 'SandyStudio$')  { 'MASTER' }
            else { 'other' }
# PORT MUST MATCH THE TREE (audit 2026-08-27). The launchers and `next start` carry
# MASTER defaults (3000/8288) because they were written before the second tree
# existed. In a work tree such a default silently does the wrong job: it either
# collides with master's live stack, or - worse, when master is down - quietly takes
# its port, and everything pointing at 3000 (OAuth redirect_uri, launch.json) starts
# hitting the wrong app. A default belongs to whoever SET it, not to whoever happens
# to run it - so we refuse instead of guessing.
$ExpectedPort = if ($RepoRoot -match 'SandyStudio-nx$') { 3001 }
                elseif ($RepoRoot -match 'SandyStudio$') { 3000 }
                else { 0 }
if ($ExpectedPort -ne 0 -and $Port -ne $ExpectedPort) {
  Write-Host ''
  Write-Host '  == REFUSING: that port does not belong to this tree ==' -ForegroundColor Red
  Write-Host "     tree: $RepoRoot" -ForegroundColor Yellow
  Write-Host "     asked for :$Port, this tree runs on :$ExpectedPort" -ForegroundColor Yellow
  Write-Host '     Here: start-stack-nx.cmd (3001/8388).  In master: start-stack.cmd (3000/8288).' -ForegroundColor Yellow
  Write-Host ''
  exit 1
}
if ($ExpectedPort -eq 0) {
  # Unknown tree: nothing to check against, so say it out loud rather than invent an
  # expectation. The Polina clone is already refused earlier, by name.
  Write-Host "  == UNKNOWN TREE ($RepoRoot): port :$Port taken on trust ==" -ForegroundColor Yellow
}

Write-Host ''
Write-Host "  == STARTING STACK IN: $TreeName ==" -ForegroundColor Green
Write-Host "     $RepoRoot   ->   App :$Port | Inngest :$InngestPort (gateway :$InngestGatewayPort)" -ForegroundColor Green
Write-Host ''

# Гасим ТОЛЬКО своё дерево и свой порт. Раньше здесь падал любой `next start` и
# любой inngest на машине — с двумя деревьями это означало, что второй запуск
# убивает первый.
Write-Host "== stopping app on :$Port and inngest on :$InngestPort ==" -ForegroundColor Cyan
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*next*start*' -and $_.CommandLine -like "*$RepoRoot*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
# Мост Полины гасим тоже — иначе рестарт стека плодит ВТОРОЙ мост и ходы двоятся.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*mind-bridge*' -and $_.CommandLine -like "*$RepoRoot*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
# Пульт в телеграме — по той же причине: второй бот на одном токене означает, что
# getUpdates отдаёт сообщение то одному, то другому, и половина ходов теряется.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*telegram-bot*' -and $_.CommandLine -like "*$RepoRoot*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "Name='inngest.exe'" |
  Where-Object { $_.CommandLine -like "*$SqliteDir*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

if ($Build) {
  Write-Host '== rebuilding app (clean) ==' -ForegroundColor Cyan
  if (Test-Path .next) { Remove-Item -Recurse -Force .next }
  # МЕТКА СБОРКИ (13.08). Контрольное слово Директора «это точно новый билд?»
  # должно отвечаться фактом, а не памятью ума: sha снимается ЗДЕСЬ, в момент
  # сборки, вшивается в бандл и отдаётся `/api/health`. Ум может лишь прочитать
  # его вслух — соврать о нём он не может.
  $env:NEXT_PUBLIC_BUILD_SHA = (git -C $RepoRoot rev-parse --short HEAD)
  $env:NEXT_PUBLIC_BUILD_AT = (Get-Date -Format 'yyyy-MM-dd HH:mm')
  Write-Host "   build sha: $env:NEXT_PUBLIC_BUILD_SHA  ($env:NEXT_PUBLIC_BUILD_AT)" -ForegroundColor Yellow
  npm run build
  if ($LASTEXITCODE -ne 0) { Write-Host 'BUILD FAILED - aborting.' -ForegroundColor Red; Read-Host 'Enter to exit'; exit 1 }
}

# Read the inngest keys from .env.local (secrets stay out of this committed script).
$envMap = @{}
foreach ($line in Get-Content "$Web\.env.local") {
  if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') { $envMap[$Matches[1]] = $Matches[2].Trim('"').Trim("'") }
}
$ek = $envMap['INNGEST_EVENT_KEY']; $sk = $envMap['INNGEST_SIGNING_KEY']
if ([string]::IsNullOrWhiteSpace($ek) -or [string]::IsNullOrWhiteSpace($sk)) {
  Write-Host 'INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY missing in webapp\.env.local - cannot start self-host.' -ForegroundColor Red
  Read-Host 'Enter to exit'; exit 1
}
New-Item -ItemType Directory -Force -Path $SqliteDir | Out-Null

# Logs APPEND across restarts (2026-07-29). They used to be deleted here and written
# with `*>`, so every restart destroyed the evidence of the crash that caused it: a
# stuck EXEC-EREF job that morning became undiagnosable for exactly this reason —
# the stack was wiping the forensic trail of the failure it was being restarted for.
# Growth is bounded by ONE rotation at 50 MB; nothing is discarded without first
# becoming the .1 file.
function Start-LogRotation([string]$Path) {
  if ((Test-Path $Path) -and ((Get-Item $Path).Length -gt 50MB)) {
    Move-Item $Path "$Path.1" -Force
  }
}
function Write-BootBanner([string]$Path) {
  # In an appended file a restart is invisible without a marker to grep for.
  Add-Content -Path $Path -Value "`n===== STACK START $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ====="
}

Write-Host '== starting Inngest (self-host, durable SQLite) ==' -ForegroundColor Cyan
Start-LogRotation "$Web\inngest.log"
Write-BootBanner "$Web\inngest.log"
# NO -NoExit (2026-08-08, Director: окна копились гирляндами в трее). Вывод и так
# уходит ТОЛЬКО в лог-файл (*>>) — окно никогда не читается глазами, только логом.
# Без -NoExit powershell САМ закрывается, как только умирает обёрнутый процесс —
# то есть ровно в момент, когда stop-stack/пересборка убивают node.exe/inngest.exe,
# а не остаётся пустой оболочкой до следующей перезагрузки машины.
Start-Process powershell -ArgumentList '-NoProfile','-Command',
  "Set-Location $Web; npx $InngestCli start --port $InngestPort --connect-gateway-port $InngestGatewayPort --event-key $ek --signing-key $sk --sdk-url http://localhost:$Port/api/inngest --sqlite-dir `"$SqliteDir`" *>> `"$Web\inngest.log`"" -WindowStyle Minimized

Write-Host "== starting App (npm run start on :$Port) ==" -ForegroundColor Cyan
Start-LogRotation "$Web\prod.log"
Write-BootBanner "$Web\prod.log"
Start-Process powershell -ArgumentList '-NoProfile','-Command',
  "Set-Location $Web; npm run start -- -p $Port *>> `"$Web\prod.log`"" -WindowStyle Minimized

# Ф2 миграции «Полина в харнес» (2026-08-09): МОСТ — канал панель↔headless-сессия
# Полины. Живёт и умирает со стеком; отдельных действий Директора нет. Гасится
# выше вместе с node-процессами дерева (командная строка содержит $RepoRoot).
if (Test-Path (Join-Path $PolinaClone 'webapp\roles\polina.md')) {
  Write-Host '== starting mind-bridge (Polina harness) ==' -ForegroundColor Cyan
  Start-LogRotation "$Web\bridge.log"
  Write-BootBanner "$Web\bridge.log"
  Start-Process powershell -ArgumentList '-NoProfile','-Command',
    "Set-Location $Web; npx tsx scripts/mind-bridge.ts *>> `"$Web\bridge.log`"" -WindowStyle Minimized
} else {
  Write-Host "== mind-bridge SKIPPED: Polina clone not found ($PolinaClone) ==" -ForegroundColor Yellow
}

# Пульт в телеграме (2026-08-12): второй вход к Полине и второе окно в студию —
# смотреть и отвечать с телефона. Связь ИСХОДЯЩАЯ (long polling), портов наружу не
# открывает. Живёт и умирает со стеком, как мост.
if (-not [string]::IsNullOrWhiteSpace($envMap['TELEGRAM_BOT_TOKEN'])) {
  Write-Host '== starting telegram-bot ==' -ForegroundColor Cyan
  Start-LogRotation "$Web\telegram.log"
  Write-BootBanner "$Web\telegram.log"
  Start-Process powershell -ArgumentList '-NoProfile','-Command',
    "Set-Location $Web; npx tsx scripts/telegram-bot.ts *>> `"$Web\telegram.log`"" -WindowStyle Minimized
} else {
  Write-Host '== telegram-bot SKIPPED: TELEGRAM_BOT_TOKEN empty ==' -ForegroundColor Yellow
}

Write-Host '== waiting for boot (18s) ==' -ForegroundColor Cyan
Start-Sleep -Seconds 18

$SyncUri = "http://localhost:$Port/api/inngest"
Write-Host "== syncing functions (PUT $SyncUri) ==" -ForegroundColor Cyan
try { (Invoke-RestMethod -Method Put -Uri $SyncUri -TimeoutSec 10) | Out-Host }
catch { Write-Host "  sync failed (retry once): $($_.Exception.Message)" -ForegroundColor Yellow; Start-Sleep 4;
        try { (Invoke-RestMethod -Method Put -Uri $SyncUri -TimeoutSec 10) | Out-Host } catch { Write-Host "  sync still failing - check prod.log" -ForegroundColor Red } }

Write-Host '== health ==' -ForegroundColor Cyan
foreach ($u in @("http://localhost:$Port/api/health","http://localhost:$Port/api/inngest","http://localhost:$InngestPort/")) {
  try { $c = (Invoke-WebRequest -UseBasicParsing $u -TimeoutSec 5).StatusCode; Write-Host "  $u  ->  $c" -ForegroundColor Green }
  catch { Write-Host "  $u  ->  DOWN" -ForegroundColor Red }
}
Write-Host ''
Write-Host "Stack up [$TreeName]. App :$Port | Inngest :$InngestPort (durable). Root: $RepoRoot" -ForegroundColor Cyan
Read-Host 'Enter to close this launcher window (the app/inngest keep running)'
