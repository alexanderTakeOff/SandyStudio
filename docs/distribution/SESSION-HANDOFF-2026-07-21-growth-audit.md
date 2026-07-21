# SESSION HANDOFF — Head of Growth · Channel View-Spread Audit

> **Date:** 2026-07-21 · **Role:** Head of Growth (Тео) · **Mode at handoff:** `===1===` ANALYTICS
> **Branch:** `claude/head-of-growth-discussion-dt8fr7`
> Read this first in the new session, then `CLAUDE.md → NORTH_STAR.md → PLANET.md → PLAN.md (origin/master) → glossary`.

---

## 1. The task the Director set

Two things, on the **Sandy the Hourglass** YouTube channel (`@sandy_the_hourglass`, `UCc2YJlHFclO9BWLEgPlglIg`):

1. **Analyse the view spread.** Some uploads are published, some are not. Of the published
   ones, some have ~**5 views**, some have **thousands**. First deliverable = *an analysis of
   what causes that gap*, and how to fix it.
2. **Develop the `head-of-growth` skill further** off the back of what we learn.

The Director explicitly wants **DIRECT access to live channel data** for this — not a
reconstruction from memory. "нам надо иметь ПРЯМОЙ доступ для анализа."

## 2. The blocker (why a new session is needed)

This cloud container is a **fresh clone** — it has **no Google/YouTube credentials** and no
`webapp/.env.local` (it's gitignored, never pushed — correct). The live-metrics path
(`webapp/lib/agents/providers/youtube-stats.ts`) needs a token. Public scraping is dead:
YouTube returns **403 to WebFetch** (anti-scraping), and the SandyStudio Supabase project is
**not** in the MCP-connected project list, so no stored snapshots either.

**To get direct access, exactly THREE env vars are required** (confirmed against the real
code path `google-auth.ts` + `youtube-consent.ts` — the `YOUTUBE_CLIENT_ID/SECRET` names in
`.env.example` are STALE/unused; the OAuth client is shared with Drive):

```
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
YOUTUBE_REFRESH_TOKEN=…        # the Sandy Brand Account refresh token
```

The Director is providing these via **CCR environment variables** (env settings → new session
picks them up from `process.env`). Source of the values on the Director's machine:
`C:\SandyStudio\webapp\.env.local`.

## 3. FIRST ACTION in the new session

Once the three vars are set, run the ready-made **read-only** audit (already committed):

```bash
cd /home/user/SandyStudio/webapp && node scripts/yt-audit.mjs
```

It enumerates **every** upload via the owner's uploads-playlist (so unlisted/private show
too) and prints, sorted by views: `views · avgViewPercentage% · publishDate · privacyStatus ·
short|long · title`, plus channel subs/total. No writes anywhere.

If it prints `MISSING ENV` → the vars didn't land; fall back to asking the Director to paste
the three values into chat (they go into a gitignored `.env.local`, never committed).

## 4. Working hypothesis to CONFIRM or KILL with the numbers

Almost certainly this is **not** a quality problem — it's the two-algorithm split baked into
`shorts-longform-distribution`:

- **Thousands of views → the Shorts** (vertical swipe feed pushes to everyone; 0 subs is no
  barrier). Likely the 4 Vending shorts (`R5YYEoP7nrA` / `J6rp-gmUKe4` / `cZmqxhQIPeo` /
  `AHARBzM2CWw`) + Airport short (`mIew_0BCc5Y`).
- **~5 views → the long-form 16:9 episodes** (live in Home/Suggested/Search; an unknown
  0-sub channel gets ~zero impressions there → only direct-link views).
- **Some "5s" = still Unlisted** — the rollout plan was "upload unlisted → schedule Public";
  part of the catalogue likely never flipped to Public.

**What the audit must decide:** (a) which videos are `public` vs `unlisted`/`private`;
(b) for the high-view Shorts, is `avgViewPercentage` healthy (real interest) or low (empty
impressions)? completion% is the quality signal, views are only the exposure gate
(`audience-quality-sensor`). Only after that do we prescribe.

If confirmed, the fix is **funnel, not re-shoot**: flip the good episodes to Public on a
cadence, wire the Shorts→episode backlink bridge (already built:
`webapp/lib/agents/providers/short-linkage.ts`), and keep Shorts as the discovery engine.

## 5. Reference map (all known video IDs)

Full ledger: `docs/distribution/video-episode-map.md`. Long-form episodes:
`mCGE4FBcSrQ BvIHVozwdKQ LgGPVYUEzf8 iT8nwWABBqE ywNKJYsbnrE S2vIiuUCUGg 2efpY_JPYUo
rzBgn07Ucsg gU8BBvnoHu0`. Shorts: `mIew_0BCc5Y` (Airport, canonical) + Vending 4 above.
(The `yt-audit.mjs` enumeration supersedes this list — it reads whatever is actually on the
channel now.)

## 6. Key files touched / relevant

- `webapp/scripts/yt-audit.mjs` — **NEW**, the audit tool (this session).
- `.claude/skills/head-of-growth/SKILL.md` — the role skill to extend (deliverable #2).
- `.claude/skills/shorts-longform-distribution/SKILL.md` — the two-algorithm doctrine.
- `.claude/skills/audience-quality-sensor/SKILL.md` — metric roles (completion vs exposure gate).
- `docs/distribution/strategy.md` + `video-episode-map.md` — GTM plan + video↔episode ledger.

## 7. Housekeeping noted (not yet done)

- `.env.example` lines 68–69 (`YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`) are dead — code
  reads `GOOGLE_CLIENT_ID/SECRET`. Fix the example to avoid the next person setting the wrong
  vars.
- PLAN.md is **master-only** — do NOT edit it from this feature branch. If a PLAN update is
  owed, do it as a tiny commit on master.

---
*Handoff written by Head of Growth (Тео), 2026-07-21. Resume at §3.*
