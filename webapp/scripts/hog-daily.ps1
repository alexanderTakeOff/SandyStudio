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
  # ntfy turns any body over 4096 bytes into attachment.txt, silently losing the text
  # AND the link (hit 2026-07-26: a 4298-byte summary). Link goes FIRST so it always
  # survives; body clamped well under the limit.
  if ($link) { $body="$link`n`n$body" }
  # Clamp on UTF-8 BYTES, not chars: Cyrillic costs 2 bytes each, so a char-based
  # clamp lets a 2691-char summary weigh 4298 bytes and still trip the limit.
  $cap=3300
  if ([Text.Encoding]::UTF8.GetByteCount($body) -gt $cap) {
    $n=$body.Length
    while ($n -gt 0 -and [Text.Encoding]::UTF8.GetByteCount($body.Substring(0,$n)) -gt $cap) { $n=[int]($n*0.95)-1 }
    $body=$body.Substring(0,$n)+"`n...[truncated - full report at the link above]"
  }
  $hd=@{Title='Sandy kanal';Tags='hourglass'}
  if ($link) { $hd['Click']=$link }
  try { Invoke-RestMethod "https://ntfy.sh/$ntfy" -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'text/plain; charset=utf-8' -Headers $hd|Out-Null } catch { "PUSH FAIL: $_" | L }
} else { "PUSH SKIP: no summary.md - brain did not reach step 5" | L }
# Self-verify the delivery. HTTP 200 does NOT mean the Director got readable text:
# an oversize body silently arrives as attachment.txt. Poll the topic and say so.
Start-Sleep -Seconds 3
try {
  $raw=[Text.Encoding]::UTF8.GetString((Invoke-WebRequest "https://ntfy.sh/$ntfy/json?poll=1&since=10m" -UseBasicParsing).Content)
  if ($raw -match 'attachment\.txt') { "DELIVERY BAD: arrived as attachment.txt, not readable text" | L }
  elseif ($raw -match 'gist\.githack\.com') { "DELIVERY OK: text with report link" | L }
  else { "DELIVERY UNKNOWN: no matching message found in topic" | L }
} catch { "DELIVERY CHECK FAIL: $_" | L }
"[hog] $(Get-Date -Format o) DONE" | L

