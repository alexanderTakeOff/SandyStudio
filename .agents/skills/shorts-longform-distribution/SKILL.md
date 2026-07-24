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

## Playlist attribution — the second invariant upload step

> **Every upload MUST be attached, at publish time, to its format's canonical playlist:
> a Short → the channel's Shorts playlist; a long-form video → the channel's Full-Episodes
> playlist. Never leave an upload playlist-less, and never mix the two formats in one
> playlist.** Resolve the two playlist ids from channel config (they already exist on the
> channel) — do NOT hardcode ids here: a skill names the playlist by ROLE, the id lives in
> channel/brief config. Separate playlists lift session watch-time (Practice 5 above);
> attaching *on upload* is what makes that real instead of aspirational — a manual
> after-the-fact add gets skipped and the funnel silently rots.

The description backlink AND the playlist attachment are the two load-bearing, non-optional
steps of every publish. A DB row tying Short→parent for analytics is secondary and additive;
the backlink and the playlist are not.

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

## Cadence — daily beats sparse, but never burst

On a new channel, **daily beats every-few-days**: there is no frequency penalty; the
limiter is retention, not a cooldown. But do NOT dump several Shorts in a few hours:

- Two Shorts posted close together **split their own traffic-test** — the platform's
  fresh-audience test for the second pulls reach from the first; both can stall. (This is
  Short-vs-Short in the SAME feed — distinct from §"one fact": a Short never cannibalizes a
  *long-form* video, which lives in a different feed.)
- On a channel whose purpose is a clean **retention read** per gag, a burst also **muddies
  the signal** — you cannot tell which beat worked if they compete.
- **Default: one Short per day, fixed slot, in a deliberate order.** A multi-part arc from
  one episode (setup → escalation → payoff) posted one-per-day doubles as a serialized hook
  that pulls the return-viewer. Ceiling: 2/day only if ≥6–8h apart.

## Posting time — barely a lever below ~1K subs

Under ~1,000 subscribers the initial test pool is too small for post-time to move the
needle — **content and consistency dominate; do not over-optimize time.** Still, pick a sane
slot and hold it:

- For a **globally-scoped** product (no language gate), target the slot where the two
  largest watch-time regions' peaks OVERLAP (typically the primary market's afternoon = the
  secondary market's evening), so one post catches both. Express the slot by audience-region
  role, never a hardcoded local clock — the operator's own timezone is irrelevant when
  scheduling.
- Keep the SAME time every day so the algorithm and audience learn the rhythm.
- The real answer arrives from data: once ~2–4 weeks of history exist, read the platform's
  "when your viewers are online" panel and retune. Until then the global-overlap default is
  a placeholder, not a decision.

## Vertical reframe craft (repackaging horizontal → 9:16)

Extends practice #3. Cutting a horizontal scene into a vertical Short has hard rules:

1. **Long enough to READ.** A few seconds of flashing is not a gag — the self-contained beat
   needs its natural setup→punch length (≈15–40s). A sub-5s blip reads as noise.
2. **Full-bleed, not letterbox.** Fill the 9:16 frame. Letterboxing (blurred bars, the scene
   shrunk to a center band) makes the action tiny → depresses retention, the exact metric
   that decides whether the feed keeps showing it. Letterbox is a last resort for a genuinely
   wide gag, never the default.
3. **Follow the subject.** When the subject moves across the horizontal frame (common in
   two-shot interactions), a STATIC centre-crop clips it. Reposition the crop per beat
   (follow-crop / subject-tracking) so the subject stays full-frame throughout.
4. **QA before publish.** LOOK at sampled frames of the reframed cut and confirm the subject
   is held in every beat. Never ship a reframe unverified — a crop that drops the character
   mid-gag is worse than not posting.

## Completeness + schedule audit (the publish "definition of done")

A published/scheduled asset is DONE only when every field is filled. The invariant checklist
(run as a routine — see the Head-of-Growth "lead-by-hand" stance in [[head-of-growth]]):

- **Per asset:** real title (never a raw filename or "DRAFT"); description present; **Short →
  parent-episode backlink** (§"The bridge"); subscribe link; tags; thumbnail (long-form;
  Shorts use the first frame); correct category; not-made-for-kids; visibility not stuck in
  Draft/Unlisted when it should be scheduled; correct playlist membership.
- **Across the schedule:** one asset per intended slot with no gaps; the deliberate order
  held; nothing sitting Unlisted that was meant to ship.
- **Publish-gate:** never upload a source that is not APPROVED, and title from the metadata
  record, never from the raw filename (an "…branded-v02-DRAFT" title on the channel is the
  fingerprint of an unapproved file leaking through the gate).

Any failing field = surface to the operator (do not silently ship a half-filled asset).

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
