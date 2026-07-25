$ErrorActionPreference='Continue'
$repo='C:\Users\Alexander\sandystudio'
$ntfy='sandystudio-hog-a7f3k9'
$date=Get-Date -Format 'yyyy-MM-dd'
$out=Join-Path $repo "docs\distribution\reports\$date"; New-Item -ItemType Directory -Force $out|Out-Null
$log=Join-Path $out "run-$(Get-Date -Format 'HHmm').log"
function L { $input | Out-File -FilePath $log -Append -Encoding utf8 }
"[hog] $(Get-Date -Format o) START" | L
Push-Location (Join-Path $repo 'webapp')
try { node --env-file=.env.local --import tsx scripts/hog-snapshot.mts *>&1 | L } catch { "SNAPSHOT FAIL: $_" | L }
Pop-Location
$p=Get-Content -Raw (Join-Path $repo 'webapp\scripts\hog\daily-prompt.md')
Push-Location $repo
try { $p | claude -p --permission-mode acceptEdits --allowedTools "Read Write Edit Glob Grep WebFetch" --add-dir $repo *>&1 | L } catch { "BRAIN FAIL: $_" | L }
Pop-Location
$s=Join-Path $out 'summary.md'
if (Test-Path $s) {
  try { Invoke-RestMethod "https://ntfy.sh/$ntfy" -Method Post -Body ([Text.Encoding]::UTF8.GetBytes((Get-Content -Raw $s))) -ContentType 'text/plain; charset=utf-8' -Headers @{Title='Sandy kanal';Tags='hourglass'}|Out-Null } catch { "PUSH FAIL: $_" | L }
} else { "PUSH SKIP: no summary.md - brain did not reach step 5" | L }
"[hog] $(Get-Date -Format o) DONE" | L
