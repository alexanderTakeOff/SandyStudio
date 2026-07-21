# SandyStudio - daily YouTube snapshot (native, runs on the host with real internet)
# Produces docs/distribution/snapshots/<YYYY-MM-DD>.md from a READ-ONLY channel audit.
# Secrets are read locally from webapp/.env.local and NEVER leave this machine.
#
# Registered as scheduled task "SandyStudio_YT_Snapshot" (daily 08:00).

$ErrorActionPreference = 'Stop'
$root = 'C:\SandyStudio'
Set-Location $root

$d   = Get-Date -Format 'yyyy-MM-dd'
$dir = Join-Path $root 'docs\distribution\snapshots'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$out = Join-Path $dir "$d.md"
$err = Join-Path $dir "$d.err.txt"

# READ-ONLY audit. --env-file loads secrets into the process env only; nothing is printed or copied.
# Redirect via cmd so node's raw UTF-8 stdout is written verbatim
# (PowerShell '>' would re-encode to UTF-16 and mangle emoji in titles).
cmd /c "cd /d `"$root`" && node --env-file=webapp/.env.local webapp/scripts/yt-audit.mjs > `"$out`" 2> `"$err`""

# keep an error file only if something actually went wrong
if ((Test-Path $err) -and ((Get-Item $err).Length -eq 0)) { Remove-Item $err }
if ((Test-Path $err)) { Write-Error "yt-audit failed - see $err" }
