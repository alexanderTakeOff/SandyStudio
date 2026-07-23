# -----------------------------------------------------------------------------
# stop-stack.ps1 - EMERGENCY STOP for the SandyStudio local stack.
#
#   Double-click  stop-stack.cmd   - or -   right-click this file -> Run with PowerShell
#   Hard reset (also parks the durable Inngest DB so a churn storm can't resume):
#       stop-stack.cmd -Wipe
#
# Companion to start-stack.ps1. Use this when the pipeline goes into CHURN - an
# event-driven storm (e.g. the E31 72-job video runaway, 2026-07-23) where jobs
# keep re-firing on their own.
#
# WHY Inngest is killed FIRST: the churn is driven by Inngest, not by the DB job
# rows. In the E31 storm, killing job ROWS took active 72 -> 0 but the in-flight
# Inngest runs kept draining and re-firing (critic-chain VANIM <-> VPREV). The
# only thing that actually breaks the loop is stopping the Inngest server. So we
# stop Inngest first, then the app.
#
# WHY -Wipe exists: our Inngest is SELF-HOSTED + DURABLE (SQLite snapshots in
# FILMS\_inngest\main.db survive a crash). That durability means a plain kill +
# later `start-stack.ps1` will RESUME the un-finished runs - the storm comes back
# to life. -Wipe parks main.db to a timestamped backup so the next start begins
# clean. It is a hard reset: ALL in-flight durable runs (not just the storm) are
# abandoned. Only use it when you accept losing in-flight work to kill the churn.
#
# This script stops SERVERS only. To also drain the stuck DB job rows, use the
# existing helpers under webapp\scripts (kill-job.ts / clear-zombie-jobs.ts).
# -----------------------------------------------------------------------------
param([switch]$Wipe)

# Path-agnostic: resolve everything relative to THIS script's folder (repo root),
# so the same launcher works on any machine / clone path.
$RepoRoot  = $PSScriptRoot
$Web       = Join-Path $RepoRoot 'webapp'
$SqliteDir = Join-Path $RepoRoot 'FILMS\_inngest'
$MainDb    = Join-Path $SqliteDir 'main.db'

Write-Host '== EMERGENCY STOP - killing Inngest FIRST (breaks the churn loop) ==' -ForegroundColor Yellow
$inn = Get-Process inngest -ErrorAction SilentlyContinue
if ($inn) { $inn | Stop-Process -Force -ErrorAction SilentlyContinue; Write-Host "  killed inngest ($($inn.Count) proc)" -ForegroundColor Green }
else      { Write-Host '  inngest not running' -ForegroundColor DarkGray }

Write-Host '== stopping App (npm run start / next start) ==' -ForegroundColor Yellow
$app = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*next*start*' }
if ($app) { $app | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Write-Host "  killed app ($($app.Count) proc)" -ForegroundColor Green }
else      { Write-Host '  app not running' -ForegroundColor DarkGray }

Start-Sleep -Seconds 2

if ($Wipe) {
  Write-Host '== -Wipe: parking durable Inngest DB so the storm cannot resume ==' -ForegroundColor Red
  if (Test-Path $MainDb) {
    $stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = Join-Path $SqliteDir "main.db.bak-churn-$stamp"
    Move-Item -LiteralPath $MainDb -Destination $backup -Force
    # also park any WAL / SHM sidecars so SQLite starts truly clean
    foreach ($side in @("$MainDb-wal","$MainDb-shm")) {
      if (Test-Path $side) { Move-Item -LiteralPath $side -Destination "$backup$([System.IO.Path]::GetExtension($side))" -Force }
    }
    Write-Host "  parked -> $backup" -ForegroundColor Green
    Write-Host '  next start-stack will begin with a FRESH Inngest state.' -ForegroundColor Green
  } else {
    Write-Host '  no main.db found - nothing to park.' -ForegroundColor DarkGray
  }
}

Write-Host '== health (expect DOWN) ==' -ForegroundColor Yellow
foreach ($u in @('http://localhost:3000/api/health','http://localhost:8288/')) {
  try { $c = (Invoke-WebRequest -UseBasicParsing $u -TimeoutSec 4).StatusCode; Write-Host "  $u  ->  STILL UP ($c)" -ForegroundColor Red }
  catch { Write-Host "  $u  ->  down" -ForegroundColor Green }
}
Write-Host ''
if ($Wipe) { Write-Host 'Stack stopped + Inngest DB parked. Restart clean with start-stack.ps1.' -ForegroundColor Cyan }
else       { Write-Host 'Stack stopped. NOTE: durable Inngest will RESUME un-finished runs on next start-stack. Use -Wipe to prevent a churn from resuming.' -ForegroundColor Cyan }
