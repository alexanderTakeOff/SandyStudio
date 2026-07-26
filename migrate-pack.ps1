# ------------------------------------------------------------------------------
# migrate-pack.ps1 -- run ONCE on the OLD machine (laptop) before switching.
#
# Packs everything that lives OUTSIDE git into migration-snapshot/ inside the
# repo, commits and pushes it, and removes the HoG scheduler task from this
# machine (so two machines never fight over one ntfy topic).
#
# What goes in:            memory files, session-data, ~/.claude/rules,
#                          .claude/settings.local.json
# What NEVER goes in:      webapp/.env.local (SECRETS -- carry it by hand!)
#
# Counterpart: migrate-unpack.ps1 (run on the NEW machine after git pull).
# ASCII only, PowerShell 5.1 compatible. See docs/MACHINE-MIGRATION.md.
# ------------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'

$repo = $PSScriptRoot
# Claude Code keys the per-project folder by repo path: ':' and '\' become '-'.
$key  = $repo.Replace(':', '-').Replace('\', '-')
$mem  = Join-Path $HOME ".claude\projects\$key\memory"
$sess = Join-Path $HOME '.claude\session-data'
$rules = Join-Path $HOME '.claude\rules'
$localSettings = Join-Path $repo '.claude\settings.local.json'
$snap = Join-Path $repo 'migration-snapshot'

Write-Host "repo:        $repo"
Write-Host "project key: $key"
if (-not (Test-Path $mem)) { throw "Memory folder not found: $mem -- wrong machine or wrong repo path?" }

# Fresh snapshot dir
if (Test-Path $snap) { Remove-Item -Recurse -Force $snap }
New-Item -ItemType Directory -Force $snap | Out-Null

Copy-Item -Recurse -Force $mem  (Join-Path $snap 'memory')
if (Test-Path $sess)  { Copy-Item -Recurse -Force $sess  (Join-Path $snap 'session-data') }
if (Test-Path $rules) { Copy-Item -Recurse -Force $rules (Join-Path $snap 'rules') }
if (Test-Path $localSettings) { Copy-Item -Force $localSettings (Join-Path $snap 'settings.local.json') }

# Safety net: refuse to commit if anything that looks like a secret slipped in.
$leaks = Get-ChildItem -Recurse $snap -Include '.env*','*.pem','*.key' -File
if ($leaks) { $leaks | ForEach-Object { Write-Host "LEAK: $($_.FullName)" }; throw 'Secret-looking files in snapshot -- aborting.' }

$counts = @(
  "packed at: $(Get-Date -Format s) on $env:COMPUTERNAME"
  "memory:       $((Get-ChildItem -Recurse (Join-Path $snap 'memory') -File).Count) files"
  "session-data: $((Get-ChildItem -Recurse (Join-Path $snap 'session-data') -File -ErrorAction SilentlyContinue).Count) files"
  "rules:        $((Get-ChildItem -Recurse (Join-Path $snap 'rules') -File -ErrorAction SilentlyContinue).Count) files"
)
$counts | Set-Content (Join-Path $snap 'manifest.txt') -Encoding ASCII
$counts | ForEach-Object { Write-Host $_ }

# Remove the HoG daily task from THIS machine (the new machine registers its own).
try {
  Unregister-ScheduledTask -TaskName 'SandyStudio_HoG_Daily' -TaskPath '\SandyStudio\' -Confirm:$false -ErrorAction Stop
  Write-Host 'HoG scheduler task removed from this machine.'
} catch {
  Write-Host 'HoG scheduler task not found here -- nothing to remove.'
}

# Commit ONLY the snapshot (pathspec keeps unrelated working-tree changes out).
git -C $repo add migration-snapshot
git -C $repo commit -m 'chore(migration): laptop snapshot (memory/session-data/rules/settings.local)' -- migration-snapshot
git -C $repo push
Write-Host ''
Write-Host 'DONE. On the new machine: git pull, copy webapp\.env.local by hand,'
Write-Host 'then run migrate-unpack.ps1 there.'
