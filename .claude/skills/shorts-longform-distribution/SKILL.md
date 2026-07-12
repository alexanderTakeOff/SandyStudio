---
name: shorts-longform-distribution
description: Distribution doctrine for running Shorts AND long-form on the SAME channel. Explains why the two live in different algorithms, the role each plays (Shorts = reach/discovery/gag-testing, long-form = depth/watch-time/monetization), the five working practices, and the one programmable bridge that actually connects the funnel — a parent backlink in each Short's description. Platform-invariant YouTube best practice; series/channel specifics are illustrative only.
status: ACTIVE
owner: EXEC-PUB (Publisher), EXEC-ANAL (Analytics)
flavor: process
applies_when:
  agent: [EXEC-PUB, EXEC-ANAL]
hard: false
created: 2026-07-12
---

# Shorts + Long-form on One Channel — Distribution Doctrine

> **flavor: process.** This captures *invariant* YouTube distribution mechanics —
> how the platform treats Shorts vs long-form, and how to bridge them. It names no
> series, no character, no provider. Channel names, video IDs, and file paths are
> illustrative examples (marked `e.g.`), never load-bearing rules. The doctrine
> holds for any channel that ships both formats.

---

## The one fact that decides everything

YouTube serves **Shorts and long-form through largely SEPARATE recommendation
systems**:

- **Shorts** — the vertical swipe feed.
- **Long-form** — Home / Suggested / Search / Subscriptions.

Two consequences follow, and they drive every other rule below:

1. **A Short does NOT funnel into long-form automatically.** A subscriber gained
   from a Short does not, on their own, become a viewer of your full videos. The
   audience overlap is smaller than intuition suggests. **The bridge must be built
   by hand** (see §"The bridge").
2. **There is no cannibalization.** A Short does not steal views from a full video —
   they live in different feeds. Ship both freely; neither starves the other.

## The two roles — never blur them

| | **Shorts** | **Long-form episode** |
|---|---|---|
| Job | Reach · discovery · **testing which gags land** | Depth · watch-time · monetization · loyalty |
| Success metric | first 1–2 seconds · completion rate · swipe-away | avg view duration (minutes) · thumbnail CTR · retention |
| Cadence | frequent (several per week) | rhythmic, less frequent |
| Thumbnail | irrelevant (first frame + text hook IS the thumbnail) | decisive — the click depends on it |

## The five practices that actually work

1. **A Short is a self-contained gag, not "a clip that only makes sense with
   context."** The gag must complete inside 15–40 seconds — setup and punchline
   both. First frame is the hook; no run-up.
   > *e.g.* a slice of an episode scene that's only funny if you watched the
   > episode is a BAD Short. Re-cut it so it lands on its own.

2. **Every Short carries a backlink to its parent long-form video** (in the
   description). This is the single **programmable** bridge — the API fully
   supports it. Do NOT rely on the native "Related video" chip: that is largely a
   Studio-only manual feature and is not exposed by the Data API. And do NOT scream
   "watch the full video!" on-screen — hard on-Short CTAs depress the Short's own
   retention, and retention is what decides whether the algorithm keeps showing it.

3. **Don't mirror — repackage.** One episode yields 3–5 *different* Shorts, each
   built around its own gag, cut to vertical 9:16, each with its own hook. The edit
   rule is "the gag finishes inside the Short," never "chop 30 seconds off the
   timecode."

4. **Use Shorts as cheap reconnaissance.** Shorts are a free A/B test of which
   gags, characters, and situations resonate. Whatever explodes as a Short →
   amplify it in the next long-form. This is a *feedback signal into the writers'
   room*, not just a distribution channel.

5. **Rhythm + playlists — keep the two formats in SEPARATE playlists.** Group
   episodes into season playlist(s) — chains lift session watch-time, which the
   algorithm rewards. But **Shorts and long-form belong in different playlists on the
   same channel**, never mixed in one: a viewer bingeing full episodes does not want a
   15-second Short interrupting the chain, and a Shorts swiper does not want a 3-minute
   video — mixing formats in one playlist hurts the viewer experience and breaks the
   session flow the playlist exists to build. Same channel (same topic), separate
   playlists. Ship Shorts more often and regularly; they keep the channel "warm"
   between episodes and feed the algorithm daily signals.

## The bridge — the invariant requirement

The funnel Shorts → long-form is only real if the link is physically present.
**Invariant rule for the publishing pipeline:**

> **Every uploaded Short MUST carry, in its description, a link to the YouTube
> video of its parent long-form.** Source the parent's video id from the canonical
> published-video record (the id stored when the parent episode was published). If
> the parent is not yet on the channel, upload the Short *without* the backlink
> rather than blocking — the bridge appears automatically once the parent is live.

Everything else (playlist membership, a DB row tying Short→parent for analytics) is
secondary and additive; the description backlink is the load-bearing bridge.

## The single-channel verdict

For a niche branded series, **keep both formats on ONE channel** — a single channel
builds the loyal core better than splitting. The conveyor:

```
Episode (core)
  → 3–5 gag-Shorts (reach)
    → each Short backlinks to its parent episode (bridge)
      → best-performing gags feed the pitch of the next episodes (feedback)
```

---

## Project-local status (not part of the invariant)

> This appendix is the ONE place concrete/project state is allowed, and it is
> explicitly outside the doctrine above. Update it as the pipeline changes.

- **As of 2026-07-12 — IMPLEMENTED (P1).** The Shorts backlink bridge (practice #2 /
  §"The bridge") is now wired into every upload path via the shared helper
  `webapp/lib/agents/providers/short-linkage.ts` (`appendParentBacklink` +
  `readParentVideoId` + `persistShortId`):
  - `webapp/app/api/assets/[id]/shorts/route.ts` (UI slicer) — reads the parent's
    `episodes.metadata.youtube_video_id`, appends `▶ Full episode: youtu.be/<id>` to
    the description, and records the reverse link `episodes.metadata.youtube_short_id`.
  - `webapp/scripts/dist-shorts.ts` (batch) — same backlink via a per-episode parent map.
  - `webapp/scripts/dist-shorts-backfill-parents.ts` — one-shot backfill of the 9 already
    uploaded orphan Shorts (`updateVideoMetadata`; needs the `youtube.force-ssl` scope).
  If the parent isn't published yet the Short uploads without the link (per this doctrine).
