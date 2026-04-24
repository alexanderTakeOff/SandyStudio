# SandyStudio — Analytics Spec
## specs/distribution/analytics.md | v0.1 | DRAFT

> Defines what metrics are collected, when, and how they feed back into production.
> Collected by: EXEC-ANAL
> Interpreted by: BOARD-MKT
> Closes the feedback loop: Distribution → Company Strategy

---

## PURPOSE

Analytics are not vanity metrics. Every data point collected must connect to
a production or strategy decision. If a metric doesn't influence anything, don't collect it.

The feedback loop:
```
Publish → collect data → BOARD-MKT interprets → Director decides → production adjusts
```

Without this loop, each episode is made in a vacuum. With it, each episode learns
from the previous one.

---

## COLLECTION SCHEDULE

| Collection point | Timing | Why |
|-----------------|--------|-----|
| T+1h | 1 hour after publish | Catch early viral signals or issues |
| T+24h | 24 hours after publish | First full day — most reliable early indicator |
| T+7d | 7 days after publish | Week performance — YouTube's main distribution window |
| T+30d | 30 days after publish | Long-tail performance |

EXEC-ANAL runs a collection job at each time point.
Each collection produces one analytics report (see report format below).

---

## METRICS TO COLLECT

### Performance Metrics (primary)

| Metric | YouTube API field | Why it matters |
|--------|-----------------|----------------|
| Views | `statistics.viewCount` | Raw reach |
| Watch time (minutes) | `analytics: estimatedMinutesWatched` | Engagement depth |
| Average view duration | `analytics: averageViewDuration` | How far into video people watch |
| Average view % | `analytics: averageViewPercentage` | % of video watched on average |
| Impressions | `analytics: impressions` | How many times thumbnail shown |
| Impression CTR | `analytics: impressionClickThroughRate` | % who clicked after seeing thumbnail |
| Subscribers gained | `analytics: subscribersGained` | Direct channel growth |
| Likes | `statistics.likeCount` | Positive signal |
| Comments | `statistics.commentCount` | Engagement signal |

### Traffic Source Metrics

| Metric | Why |
|--------|-----|
| % from YouTube search | Is SEO working? |
| % from suggested videos | Is algorithm distributing? |
| % from direct/external | Are we getting shared? |
| % from notifications | Are subscribers watching? |

### Retention Curve

| Metric | Why |
|--------|-----|
| Audience retention curve | Where do viewers drop off? Identifies weak spots in episodes |
| Key drop-off moments | Maps back to storyboard — what scenes lose audience |

---

## ANALYTICS REPORT FORMAT

EXEC-ANAL writes one report per collection point:

```
SS-S[NN]-E[NN]-REV-analytics_T[+Xh/d]-v01-DRAFT.md → reviews/

Schema:
  report_id: string
  episode_id: string
  collection_point: string    # "T+1h" | "T+24h" | "T+7d" | "T+30d"
  collection_timestamp: string
  youtube_video_id: string

  metrics:
    views: integer
    watch_time_minutes: number
    avg_view_duration_seconds: number
    avg_view_percentage: number
    impressions: integer
    impression_ctr: number     # as decimal e.g. 0.045 = 4.5%
    subscribers_gained: integer
    likes: integer
    comments: integer

  traffic_sources:
    search_pct: number
    suggested_pct: number
    direct_pct: number
    notification_pct: number
    other_pct: number

  retention:
    drop_off_points:           # top 3 drop-off moments
      - timestamp_seconds: number
        retention_at_point: number  # % still watching
        storyboard_reference: string  # which scene/shot this maps to

  flags:                       # EXEC-ANAL highlights notable signals
    - flag_type: string        # "STRONG" | "WARNING" | "NOTE"
      metric: string
      value: string
      context: string

  raw_data_file: string        # path to full CSV export from YouTube Studio
```

---

## BENCHMARK TARGETS

These are initial targets. BOARD-MKT updates them after first 3 episodes.

| Metric | Target (T+7d) | Warning threshold |
|--------|--------------|-------------------|
| Average view % | ≥ 50% | < 35% |
| Impression CTR | ≥ 4% | < 2% |
| Likes / Views ratio | ≥ 3% | < 1% |
| Subscribers per 1000 views | ≥ 5 | < 2 |

If any metric hits Warning threshold: EXEC-ANAL flags for BOARD-MKT immediate review.

---

## FEEDBACK → PRODUCTION LOOP

### After T+7d report: BOARD-MKT analysis

BOARD-MKT reads the T+7d report and produces:
```
SS-S[NN]-E[NN]-REV-analytics_interpretation-v01-DRAFT.md

Contains:
  - What worked (reinforce in next episode)
  - What didn't work (avoid or improve)
  - Specific recommendations for next episode brief
  - Recommendation for strategy (if significant signal)
```

### Signal types and responses

| Signal | BOARD-MKT recommendation | Director action |
|--------|-------------------------|----------------|
| Low avg view % + known drop-off point | Shorter scenes at that act | Brief adjustment for next episode |
| Low CTR | Thumbnail style change | New thumbnail approach |
| High CTR, low avg view % | Hook working, content weaker | Script quality focus |
| Strong performance on specific gag type | More of that comedy style | Brief directive |
| Subscriber spike | Series resonating | Consider accelerating release cadence |

### Annual strategy review

Every 10 episodes: BOARD-MKT + BOARD-FIN produce a season performance report.
Director reviews and adjusts series direction if needed.
This is the full Company Cycle feedback loop.

---

## PRIVACY AND DATA RULES

- Analytics data belongs to SandyStudio (Director/CEO)
- No viewer personal data is stored (YouTube Analytics is aggregated)
- Raw CSV exports stored in: `H:\My Drive\SandyStudio_Media\raw\` under `analytics/` subfolder
- Retained for duration of the series + 2 years

---

*SandyStudio analytics.md | v0.1 | Status: DRAFT*
