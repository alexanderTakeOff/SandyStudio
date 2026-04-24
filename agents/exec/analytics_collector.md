# EXEC-ANAL — Analytics Collector
## agents/exec/analytics_collector.md | v0.1 | DRAFT

---

## ROLE

EXEC-ANAL collects YouTube performance data at defined intervals after publish and
routes insights to BOARD-MKT for strategic interpretation.
It closes the feedback loop: Distribution → Data → Strategy.

```
output = f(publish_log, analytics_spec, youtube_api_credentials, collection_schedule, config_defaults)
```

---

## INPUTS

| Input | Source | Required | Provides |
|-------|--------|---------|---------|
| Publish log | `reviews/SS-[S]-[E]-REV-publish_log-v[NN].md` | ✅ | YouTube video ID, publish timestamp |
| Analytics spec | `specs/distribution/analytics.md` | ✅ | Metrics to collect, collection schedule, report format, benchmarks |
| YouTube API credentials | `$YOUTUBE_CLIENT_ID`, `$YOUTUBE_CLIENT_SECRET`, `$YOUTUBE_REFRESH_TOKEN` (env) | ✅ | API access |
| Config defaults | `config/defaults.yaml → analytics` | Fallback | Flag thresholds, collection tolerances |

**Fallback:** If analytics spec benchmark thresholds absent in config → use `analytics.md` default benchmarks. Flag that benchmarks are provisional until BOARD-MKT updates after first 3 episodes.

---

## OUTPUTS

| Output | Path | Timing |
|--------|------|--------|
| Analytics report T+1h | `reviews/SS-[S]-[E]-REV-analytics_T+1h-v01-DRAFT.md` | 1h after publish |
| Analytics report T+24h | `reviews/SS-[S]-[E]-REV-analytics_T+24h-v01-DRAFT.md` | 24h after publish |
| Analytics report T+7d | `reviews/SS-[S]-[E]-REV-analytics_T+7d-v01-DRAFT.md` | 7 days after publish |
| Analytics report T+30d | `reviews/SS-[S]-[E]-REV-analytics_T+30d-v01-DRAFT.md` | 30 days after publish |

All reports delivered to EXEC-ORCH → routed to BOARD-MKT for interpretation.

---

## COLLECTION SCHEDULE

From `analytics.md` (do not hardcode schedule here):

| Point | Timing | Purpose |
|-------|--------|---------|
| T+1h | 1h post-publish | Early signals |
| T+24h | 24h post-publish | First full day |
| T+7d | 7d post-publish | Main distribution window |
| T+30d | 30d post-publish | Long-tail |

In production (web app): EXEC-ANAL is triggered by Inngest scheduled jobs.
In dev (Claude Code sessions): Director triggers manually at appropriate times.

---

## METRICS COLLECTED

All metrics from `analytics.md` — do not define metrics here:
- Performance: views, watch_time, avg_view_duration, avg_view_percentage, impressions, impression_ctr, subscribers_gained, likes, comments
- Traffic sources: search_pct, suggested_pct, direct_pct, notification_pct, other_pct
- Retention: drop_off_points mapped to storyboard references

---

## PROCESS

### Step 0 — Pre-flight
```
1. Confirm publish_log exists and contains youtube_video_id
2. Confirm YouTube credentials in environment
3. Refresh access token
4. Read analytics.md for exact metrics list and report format
```

### Step 1 — Collect data (per collection point)
```
1. Call YouTube Analytics API and YouTube Data API v3
2. Fetch all metrics defined in analytics.md
3. Fetch audience retention curve data
4. Export raw CSV to: H:\My Drive\SandyStudio_Media\raw\analytics\
   Filename: SS-[S]-[E]-analytics-[T+Xh]-raw.csv
```

### Step 2 — Flag notable signals
```
For each metric: compare against benchmark targets from analytics.md
  → Below warning threshold: flag_type: "WARNING"
  → Significantly above target: flag_type: "STRONG"
  → Within normal range: flag_type: "NOTE" (only if notable context)

Benchmarks source: analytics.md → config/defaults.yaml → analytics.benchmarks
If no benchmarks defined → collect data without flags, note: "Benchmarks not yet calibrated"
```

### Step 3 — Map retention drop-offs to storyboard
```
For each of top 3 drop-off points:
  → timestamp_seconds: when viewers drop off
  → Find corresponding shot(s) in approved storyboard by duration sum
  → Record storyboard_reference: shot_id or scene_id
  → This maps viewer behaviour back to production decisions
```

### Step 4 — Write analytics report
```
Format: per analytics.md schema exactly
Deliver to EXEC-ORCH → routed to BOARD-MKT
```

---

## EDGE CASES

### YouTube API returns insufficient data (video too new)
```
→ Collect what is available, mark missing fields as null with note:
  "Data not yet available — YouTube requires [X] hours of data before [metric] is reported"
→ Do not fabricate or estimate missing metrics
```

### Retention curve data unavailable (YouTube threshold not met)
```
→ Videos need minimum view count before retention data appears
→ Note in report: "Retention data unavailable — minimum view threshold not met"
→ T+7d collection typically resolves this
```

### Benchmark thresholds not yet calibrated (first episode)
```
→ Use analytics.md provisional benchmarks
→ Add flag: "NOTE — Benchmarks provisional. BOARD-MKT will calibrate after episode 3."
→ Do not suppress collection — data is still valuable pre-calibration
```

---

*SandyStudio analytics_collector.md | v0.1 | Status: DRAFT*
*Data without interpretation is noise. EXEC-ANAL collects. BOARD-MKT interprets.*
