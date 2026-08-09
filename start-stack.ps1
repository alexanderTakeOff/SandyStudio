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
Set-Location $Web

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
Get-CimInstance Win32_Process -Filter "Name='inngest.exe'" |
  Where-Object { $_.CommandLine -like "*$SqliteDir*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

if ($Build) {
  Write-Host '== rebuilding app (clean) ==' -ForegroundColor Cyan
  if (Test-Path .next) { Remove-Item -Recurse -Force .next }
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
$PolinaClone = 'C:\SandyStudio-polina'
if (Test-Path (Join-Path $PolinaClone 'webapp\roles\polina.md')) {
  Write-Host '== starting mind-bridge (Polina harness) ==' -ForegroundColor Cyan
  Start-LogRotation "$Web\bridge.log"
  Write-BootBanner "$Web\bridge.log"
  Start-Process powershell -ArgumentList '-NoProfile','-Command',
    "Set-Location $Web; npx tsx scripts/mind-bridge.ts *>> `"$Web\bridge.log`"" -WindowStyle Minimized
} else {
  Write-Host "== mind-bridge SKIPPED: клона Полины нет ($PolinaClone) ==" -ForegroundColor Yellow
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
Write-Host "Stack up. App :$Port | Inngest :$InngestPort (durable). Root: $RepoRoot" -ForegroundColor Cyan
Read-Host 'Enter to close this launcher window (the app/inngest keep running)'
