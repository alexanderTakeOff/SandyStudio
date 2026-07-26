$ErrorActionPreference='Continue'
# PS 5.1 pipes to native exe as ASCII by default, which destroyed every Cyrillic
# character of the prompt into '?'. Both lines are load-bearing, not cosmetic.
$OutputEncoding=New-Object Text.UTF8Encoding $false
[Console]::OutputEncoding=New-Object Text.UTF8Encoding $false
# Multi-channel Phase 4a (2026-07-26): one snapshot pass (all channels), then one
# brain run + one ntfy push PER ACTIVE CHANNEL. Channel list, ntfy topic and
# display name come from the channels passport table (scripts/hog-channels.mts),
# not from hardcodes. Reports land in reports/<date>/<KEY>/ so two channels can
# never overwrite each other's report.html for the same date.
# KNOWN DEBT (do not "fix" casually): this outer loop snapshots the channel
# itself and thereby duplicates what inngest hog-channel-snapshot already writes
# to channel_snapshots. It works; the proper end-state is to fold the muscle
# into the app and keep only delivery outside. Tracked in PLAN backlog.
$repo='C:\Users\Alexander\sandystudio'
$date=Get-Date -Format 'yyyy-MM-dd'
$dayRoot=Join-Path $repo "docs\distribution\reports\$date"; New-Item -ItemType Directory -Force $dayRoot|Out-Null
$log=Join-Path $dayRoot "run-$(Get-Date -Format 'HHmm').log"
function L { $input | Out-File -FilePath $log -Append -Encoding utf8 }
"[hog] $(Get-Date -Format o) START" | L

# 1. Snapshot pass — one run, per-channel files (hog-snapshot.mts iterates ACTIVE channels).
Push-Location (Join-Path $repo 'webapp')
try { node --env-file=.env.local --import tsx scripts/hog-snapshot.mts *>&1 | L } catch { "SNAPSHOT FAIL: $_" | L }

# 2. Channel roster from the passport table (JSON on stdout).
$channelsJson=''
try { $channelsJson = (node --env-file=.env.local --import tsx scripts/hog-channels.mts) -join '' } catch { "CHANNELS FAIL: $_" | L }
Pop-Location
if (-not $channelsJson) { "[hog] no channel roster - abort" | L; return }
$channels = $channelsJson | ConvertFrom-Json
$tpl=[IO.File]::ReadAllText((Join-Path $repo 'webapp\scripts\hog\daily-prompt.md'),[Text.Encoding]::UTF8)

foreach ($ch in $channels) {
  $key=$ch.key
  "[hog] === channel $key ($($ch.name)) ===" | L
  $out=Join-Path $dayRoot $key; New-Item -ItemType Directory -Force $out|Out-Null
  $outRel="docs/distribution/reports/$date/$key"

  # 3. Brain run for THIS channel: placeholders -> concrete values.
  $p=$tpl.Replace('{{CHANNEL_KEY}}',$key).Replace('{{CHANNEL_NAME}}',$ch.name).Replace('{{OUT_DIR}}',$outRel)
  Push-Location $repo
  try { $p | claude -p --model opus --permission-mode acceptEdits --allowedTools "Read Write Edit Glob Grep WebFetch" --add-dir $repo *>&1 | L } catch { "BRAIN FAIL ${key}: $_" | L }
  Pop-Location

  $s=Join-Path $out 'summary.md'
  $h=Join-Path $out 'report.html'
  # Durable, beautifully-rendered report link: a secret gist served via githack.
  # Permanent (unlike the 3h ntfy attachment) and renders the self-contained HTML as-is.
  $link=''
  if (Test-Path $h) {
    try {
      $g = gh gist create $h -d "$($ch.name) - HoG report $date" 2>&1 | Select-String 'gist.github.com/' | Select-Object -First 1
      $gid = ($g -replace '.*/','').Trim()
      if ($gid) {
        $login = (gh api user --jq .login 2>$null); if (-not $login) { $login='alexanderTakeOff' }
        $link = "https://gist.githack.com/$login/$gid/raw/report.html"; "GIST OK ${key}: $link" | L
      }
      else { "GIST FAIL ${key}: no id parsed from '$g'" | L }
    } catch { "GIST FAIL ${key}: $_" | L }
  }
  $topic=$ch.ntfy_topic
  if (Test-Path $s) {
    $body=[IO.File]::ReadAllText($s,[Text.Encoding]::UTF8)
    # ntfy turns any body over 4096 bytes into attachment.txt, silently losing the
    # text AND the link (hit 2026-07-26: a 4298-byte summary). Link goes FIRST so
    # it always survives; body clamped well under the limit (fix 4a350aca).
    if ($link) { $body="$link`n`n$body" }
    # Clamp on UTF-8 BYTES, not chars: Cyrillic costs 2 bytes each, so a char-based
    # clamp lets a 2691-char summary weigh 4298 bytes and still trip the limit.
    $cap=3300
    if ([Text.Encoding]::UTF8.GetByteCount($body) -gt $cap) {
      $n=$body.Length
      while ($n -gt 0 -and [Text.Encoding]::UTF8.GetByteCount($body.Substring(0,$n)) -gt $cap) { $n=[int]($n*0.95)-1 }
      $body=$body.Substring(0,$n)+"`n...[truncated - full report at the link above]"
    }
    $hd=@{Title=$ch.name;Tags='chart_with_upwards_trend'}
    if ($link) { $hd['Click']=$link }
    if ($topic) {
      try { Invoke-RestMethod "https://ntfy.sh/$topic" -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'text/plain; charset=utf-8' -Headers $hd|Out-Null } catch { "PUSH FAIL ${key}: $_" | L }
      # Self-verify the delivery (fix 4a350aca). HTTP 200 does NOT mean the Director
      # got readable text: an oversize body silently arrives as attachment.txt.
      Start-Sleep -Seconds 3
      try {
        $raw=[Text.Encoding]::UTF8.GetString((Invoke-WebRequest "https://ntfy.sh/$topic/json?poll=1&since=10m" -UseBasicParsing).Content)
        if ($raw -match 'attachment\.txt') { "DELIVERY BAD ${key}: arrived as attachment.txt, not readable text" | L }
        elseif ($raw -match 'gist\.githack\.com') { "DELIVERY OK ${key}: text with report link" | L }
        else { "DELIVERY UNKNOWN ${key}: no matching message found in topic" | L }
      } catch { "DELIVERY CHECK FAIL ${key}: $_" | L }
    } else { "PUSH SKIP ${key}: channel has no ntfy_topic" | L }
  } else { "PUSH SKIP ${key}: no summary.md - brain did not reach step 5" | L }
}
"[hog] $(Get-Date -Format o) DONE" | L
