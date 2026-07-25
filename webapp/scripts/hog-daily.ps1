$ErrorActionPreference='Continue'
# PS 5.1 pipes to native exe as ASCII by default, which destroyed every Cyrillic
# character of the prompt into '?'. Both lines are load-bearing, not cosmetic.
$OutputEncoding=New-Object Text.UTF8Encoding $false
[Console]::OutputEncoding=New-Object Text.UTF8Encoding $false
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
$p=[IO.File]::ReadAllText((Join-Path $repo 'webapp\scripts\hog\daily-prompt.md'),[Text.Encoding]::UTF8)
Push-Location $repo
try { $p | claude -p --model opus --permission-mode acceptEdits --allowedTools "Read Write Edit Glob Grep WebFetch" --add-dir $repo *>&1 | L } catch { "BRAIN FAIL: $_" | L }
Pop-Location
$s=Join-Path $out 'summary.md'
$h=Join-Path $out 'report.html'
# Durable, beautifully-rendered report link: a secret gist served via githack.
# Permanent (unlike the 3h ntfy attachment) and renders the self-contained HTML as-is.
$link=''
if (Test-Path $h) {
  try {
    $g = gh gist create $h -d "Sandy the Hourglass - HoG report $date" 2>&1 | Select-String 'gist.github.com/' | Select-Object -First 1
    $gid = ($g -replace '.*/','').Trim()
    if ($gid) { $link = "https://gist.githack.com/alexanderTakeOff/$gid/raw/report.html"; "GIST OK: $link" | L }
    else { "GIST FAIL: no id parsed from '$g'" | L }
  } catch { "GIST FAIL: $_" | L }
}
if (Test-Path $s) {
  $body=[IO.File]::ReadAllText($s,[Text.Encoding]::UTF8)
  if ($link) { $body="$body`n`n$link" }
  $hd=@{Title='Sandy kanal';Tags='hourglass'}
  if ($link) { $hd['Click']=$link }
  try { Invoke-RestMethod "https://ntfy.sh/$ntfy" -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'text/plain; charset=utf-8' -Headers $hd|Out-Null } catch { "PUSH FAIL: $_" | L }
} else { "PUSH SKIP: no summary.md - brain did not reach step 5" | L }
"[hog] $(Get-Date -Format o) DONE" | L

