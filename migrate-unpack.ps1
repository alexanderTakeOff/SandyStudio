# ------------------------------------------------------------------------------
# migrate-unpack.ps1 -- run ONCE on the NEW machine (desktop) after `git pull`.
#
# Unpacks migration-snapshot/ (created by migrate-pack.ps1 on the old machine)
# into the right places FOR THIS machine's repo path, registers the HoG daily
# scheduler task, then deletes the snapshot from the repo (commit + push).
#
# Merge policy: snapshot files OVERWRITE same-named local files (the old
# machine is newer); files that exist only on this machine are kept.
# ASCII only, PowerShell 5.1 compatible. See docs/MACHINE-MIGRATION.md.
# ------------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'

$repo = $PSScriptRoot
$key  = $repo.Replace(':', '-').Replace('\', '-')
$snap = Join-Path $repo 'migration-snapshot'

Write-Host "repo:        $repo"
Write-Host "project key: $key"
if (-not (Test-Path $snap)) { throw "No migration-snapshot/ here. Run 'git pull' first (and migrate-pack.ps1 on the old machine before that)." }

# 1. Memory -- into THIS machine's project-key folder (path-derived, so the
#    desktop's C:\SandyStudio maps to C--SandyStudio automatically).
$memTarget = Join-Path $HOME ".claude\projects\$key\memory"
New-Item -ItemType Directory -Force $memTarget | Out-Null
Copy-Item -Recurse -Force (Join-Path $snap 'memory\*') $memTarget
Write-Host "memory  -> $memTarget ($((Get-ChildItem -Recurse $memTarget -File).Count) files now)"

# 2. Session-data + global rules (shared across projects).
if (Test-Path (Join-Path $snap 'session-data')) {
  $t = Join-Path $HOME '.claude\session-data'
  New-Item -ItemType Directory -Force $t | Out-Null
  Copy-Item -Recurse -Force (Join-Path $snap 'session-data\*') $t
  Write-Host "session-data -> $t"
}
if (Test-Path (Join-Path $snap 'rules')) {
  $t = Join-Path $HOME '.claude\rules'
  New-Item -ItemType Directory -Force $t | Out-Null
  Copy-Item -Recurse -Force (Join-Path $snap 'rules\*') $t
  Write-Host "rules -> $t"
}

# 3. Repo-local permission settings.
if (Test-Path (Join-Path $snap 'settings.local.json')) {
  Copy-Item -Force (Join-Path $snap 'settings.local.json') (Join-Path $repo '.claude\settings.local.json')
  Write-Host 'settings.local.json -> .claude\'
}

# 4. HoG daily scheduler task (launcher derives the repo path itself).
$launcher = Join-Path $repo 'webapp\scripts\hog-daily.ps1'
if (Test-Path $launcher) {
  $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$launcher`""
  $s = New-ScheduledTaskSettingsSet -StartWhenAvailable
  Register-ScheduledTask -TaskName 'SandyStudio_HoG_Daily' -TaskPath '\SandyStudio\' -Action $a `
    -Trigger (New-ScheduledTaskTrigger -Daily -At '09:00') -Settings $s `
    -Description 'Head of Growth daily channel report' -Force | Out-Null
  Write-Host 'HoG scheduler task registered (daily 09:00).'
}

# 5. Remove the snapshot from the repo so it does not linger in git.
git -C $repo rm -r -q migration-snapshot
git -C $repo commit -m 'chore(migration): snapshot unpacked on desktop, removed' -- migration-snapshot
git -C $repo push

# 6. Reminders for the remaining manual steps.
Write-Host ''
if (-not (Test-Path (Join-Path $repo 'webapp\.env.local'))) {
  Write-Host '!! webapp\.env.local is MISSING -- copy it from the old machine by hand.'
}
Write-Host 'Next: cd webapp; npm install   (FULL install, no --legacy-peer-deps)'
Write-Host 'Then: .\start-stack.ps1 -Build'
