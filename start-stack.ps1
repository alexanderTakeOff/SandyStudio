# ─────────────────────────────────────────────────────────────────────────────
# start-stack.ps1 — bring up the SandyStudio local stack (durable, self-hosted).
#
#   Double-click  start-stack.cmd   — or —   right-click this file → Run with PowerShell
#   Rebuild the app first (after code changes):  pwsh -File start-stack.ps1 -Build
#
# Starts, both in their own minimized windows with logs to file:
#   • App        → npm run start        on :3000   (prod.log)
#   • Inngest    → inngest start        on :8288   (inngest.log)  ← SELF-HOSTED,
#     durable (SQLite snapshots survive a crash). NOT `inngest dev` — that was
#     ephemeral and zombied jobs on a silent crash (E27 Tier-0 fix, 2026-07-11).
# Then syncs functions (PUT /api/inngest) and prints health.
# Keys are read from webapp/.env.local — never hardcoded here (this file is in git).
# ─────────────────────────────────────────────────────────────────────────────
param([switch]$Build)

# Path-agnostic: resolve everything relative to THIS script's folder (the repo
# root), so the same launcher works on any machine / clone path (desktop
# C:\SandyStudio and laptop C:\Users\Alexander\sandystudio alike).
$RepoRoot  = $PSScriptRoot
$Web       = Join-Path $RepoRoot 'webapp'
$SqliteDir = Join-Path $RepoRoot 'FILMS\_inngest'
$InngestCli = 'inngest-cli@1.33.0'
Set-Location $Web

Write-Host '== stopping any running app / inngest ==' -ForegroundColor Cyan
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*next*start*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-Process inngest -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

if ($Build) {
  Write-Host '== rebuilding app (clean) ==' -ForegroundColor Cyan
  if (Test-Path .next) { Remove-Item -Recurse -Force .next }
  npm run build
  if ($LASTEXITCODE -ne 0) { Write-Host 'BUILD FAILED — aborting.' -ForegroundColor Red; Read-Host 'Enter to exit'; exit 1 }
}

# Read the inngest keys from .env.local (secrets stay out of this committed script).
$envMap = @{}
foreach ($line in Get-Content "$Web\.env.local") {
  if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') { $envMap[$Matches[1]] = $Matches[2].Trim('"').Trim("'") }
}
$ek = $envMap['INNGEST_EVENT_KEY']; $sk = $envMap['INNGEST_SIGNING_KEY']
if ([string]::IsNullOrWhiteSpace($ek) -or [string]::IsNullOrWhiteSpace($sk)) {
  Write-Host 'INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY missing in webapp\.env.local — cannot start self-host.' -ForegroundColor Red
  Read-Host 'Enter to exit'; exit 1
}
New-Item -ItemType Directory -Force -Path $SqliteDir | Out-Null

Write-Host '== starting Inngest (self-host, durable SQLite) ==' -ForegroundColor Cyan
if (Test-Path "$Web\inngest.log") { Remove-Item "$Web\inngest.log" -Force }
Start-Process powershell -ArgumentList '-NoProfile','-NoExit','-Command',
  "Set-Location $Web; npx $InngestCli start --event-key $ek --signing-key $sk --sdk-url http://localhost:3000/api/inngest --sqlite-dir `"$SqliteDir`" *> `"$Web\inngest.log`"" -WindowStyle Minimized

Write-Host '== starting App (npm run start) ==' -ForegroundColor Cyan
if (Test-Path "$Web\prod.log") { Remove-Item "$Web\prod.log" -Force }
Start-Process powershell -ArgumentList '-NoProfile','-NoExit','-Command',
  "Set-Location $Web; npm run start *> `"$Web\prod.log`"" -WindowStyle Minimized

Write-Host '== waiting for boot (18s) ==' -ForegroundColor Cyan
Start-Sleep -Seconds 18

Write-Host '== syncing functions (PUT /api/inngest) ==' -ForegroundColor Cyan
try { (Invoke-RestMethod -Method Put -Uri 'http://localhost:3000/api/inngest' -TimeoutSec 10) | Out-Host }
catch { Write-Host "  sync failed (retry once): $($_.Exception.Message)" -ForegroundColor Yellow; Start-Sleep 4;
        try { (Invoke-RestMethod -Method Put -Uri 'http://localhost:3000/api/inngest' -TimeoutSec 10) | Out-Host } catch { Write-Host "  sync still failing — check prod.log" -ForegroundColor Red } }

Write-Host '== health ==' -ForegroundColor Cyan
foreach ($u in @('http://localhost:3000/api/health','http://localhost:3000/api/inngest','http://localhost:8288/')) {
  try { $c = (Invoke-WebRequest -UseBasicParsing $u -TimeoutSec 5).StatusCode; Write-Host "  $u  ->  $c" -ForegroundColor Green }
  catch { Write-Host "  $u  ->  DOWN" -ForegroundColor Red }
}
Write-Host ''
Write-Host 'Stack up. App :3000 · Inngest :8288 (durable). Logs: webapp\prod.log · webapp\inngest.log' -ForegroundColor Cyan
Read-Host 'Enter to close this launcher window (the app/inngest keep running)'
