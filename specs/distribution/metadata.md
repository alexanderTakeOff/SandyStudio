# SandyStudio — Metadata Spec
## specs/distribution/metadata.md | v0.2 | DRAFT

> Defines the format and rules for episode title, description, and tags.
> Produced by: EXEC-COPY · Consumed by: EXEC-PUB (YouTube upload), EXEC-THUMB (context).
> **v0.2 (2026-06-26):** angle flipped from festival-blurb-for-fans → cold-viewer / search-first.
> Root cause of weak copy (E12 "Sandy's Infinite Scroll") was the character-first title formula
> and a literary description template that assumed the viewer already knew the character.

---

## PURPOSE

Title, description, and tags are the **last mile** of the studio's product: they decide whether a
**cold stranger** scrolling YouTube/search — who has never heard of our character — clicks. They are
not a festival catalogue blurb for existing fans. EXEC-COPY writes them; Director approves them.

## THE GOLDEN RULE — write for the cold viewer

Every field is written for a person who **does not know the protagonist and does not know it is a
cartoon**. If the copy only makes sense to someone who already watches the series, it has failed.
Onboard the stranger in the title and the first line of the description — that same sentence is also
the SEO sentence. They are one sentence; that is the whole trick.

## DISCOVERY HIERARCHY (2026 — what actually moves views)

1. **Thumbnail + title** → win the click. (Title is EXEC-COPY; thumbnail is EXEC-THUMB — coordinate.)
2. **First ~100–150 chars of description + watch-time/satisfaction** → tell the algorithm the topic.
3. **3–5 hashtags** → ~+28% impressions in the first 48h.
4. **Legacy tags** → near-zero weight. Fill a few correct ones, do not over-invest.

## 5 CORE PRINCIPLES (hard rules)

1. **Lead with the universal SITUATION, not the character.** Cold viewers don't know the protagonist;
   everyone knows the relatable pain (phone addiction, jealousy, hunger…). The hook is the pain/POV;
   the protagonist name rides in the descriptor **tail**.
2. **First description line = snippet = onboarding = SEO sentence — all one.** Put the **primary keyword
   in the first ~40 chars** (before mobile truncation) and a "what is this (who + format + topic)" in
   the first ~150 chars. Kill literary prose — it serves neither the viewer nor the algorithm.
3. **Always stamp the FORMAT.** Title and first line must signal **"Animated / Cartoon"** and
   **"No Words / Silent"**. Silent = a global discovery ASSET (no language barrier) — say it out loud,
   never hide it.
4. **Title + thumbnail win the click; everything else is hygiene.** Curiosity gap, relatable promise,
   ≤60 displayed chars of meaning. Tags barely matter; 3–5 hashtags give the only metadata bump.
5. **Turn the protagonist's premise into the hook engine.** Use the one-line "who is X" from the Bible
   as the relatable metaphor (e.g. "a man made of sand whose time literally drains while he scrolls").

## LANGUAGE

**All metadata — title, description, tags, hashtags — is written in ENGLISH** (audience is global;
the series is wordless, so English is the lingua-franca of the copy). `language: "en"`.

---

## FILE NAMING

```
SS-[SEASON]-[EPISODE]-SPC-metadata-v[NN]-[STATUS].md
Example: SS-S15-E12-SPC-metadata-v01-DRAFT.md
```

---

## SCHEMA

```yaml
metadata_id: string           # REQUIRED — filename without extension
episode_id: string            # REQUIRED
title: string                 # REQUIRED — ≤100 chars hard, ≤60 chars of MEANING shown
                              # Leads with the relatable situation, NOT the character name.
                              # Carries a format stamp (Animated/Cartoon · No Words). English.
description: string           # REQUIRED — ≤5000 chars. First ~150 chars = the snippet (see template).
tags:                         # REQUIRED — 8–12 tags, ≤500 chars total. Low weight; fill once.
  - string
playlist: string              # REQUIRED
category: string              # REQUIRED — "Film & Animation"
language: string              # REQUIRED — "en"
hashtags:                     # REQUIRED — 3–5, English; #Shorts FIRST on short-form
  - string
end_screen_elements: []       # OPTIONAL
cards: []                     # OPTIONAL
version: string               # REQUIRED
status: string                # REQUIRED — DRAFT | REVIEW | APPROVED | LOCKED
created_by: string            # REQUIRED — "EXEC-COPY"
date: string                  # REQUIRED — ISO
approved_by: string           # REQUIRED when APPROVED
```

---

## TITLE FORMULA

```
[Relatable situation / POV / curiosity hook] + [emoji] | [Protagonist] | [Format stamp]
```

- **Lead with the universal hook**, e.g. `When you open your phone "for 5 minutes"`, `POV: …`,
  `He couldn't stop scrolling…`. The protagonist name is NOT first.
- **Format stamp in the tail:** `Funny Cartoon`, `Animated Comedy`, `Silent Animation`, `No Words`.
- ≤60 chars of meaning shown in search (hard limit 100). Emoji pair tied to the theme helps.
- English. Accurate to the episode — no clickbait. Provide 2–3 variants; Director chooses.

**Examples (E12 — a sand-man falls into infinite scroll):**
- `When You Open Your Phone "For 5 Minutes" 📱 | Sandy | Animated Comedy`
- `His Time Runs Out While Scrolling ⏳📱 | Sandy Cartoon (No Words)`
- `Doomscrolling Be Like… 📱😵 | Silent Sandy | Funny Animation`

> ❌ Anti-pattern (what v0.1 produced): `Sandy's Infinite Scroll` — character-first, no format signal,
> not searchable, no relatable hook. A cold viewer has no reason to click.

---

## DESCRIPTION TEMPLATE

```
[LINE 1 — the snippet, <150 chars: PRIMARY KEYWORD in first ~40 chars + who + format + topic + a hook.]

[2–3 sentences: the relatable summary, secondary keywords woven in, the "this is you" turn.]

Meet [Protagonist one-liner from the Bible] — a wordless [medium] anyone can watch (no dialogue, no
language barrier).

▶ New [silent/animated] episodes every [cadence]. Subscribe so you don't miss one.

#Hashtag1 #Hashtag2 #Hashtag3
```

Rules: first ~40 chars carry the primary keyword; first ~150 chars onboard the cold viewer AND signal
format; protagonist introduced via the Bible one-liner; 3–5 English hashtags; CTA present.

---

## TAGS / HASHTAGS STRATEGY

- **Hashtags (do the work):** 3–5, English, in the visible zone. Short-form leads with `#Shorts`.
  Mix series + format + topic, e.g. `#FunnyCartoon #Animation #PhoneAddiction`.
- **Legacy tags (fill once, low weight):** series name, "animated comedy / cartoon / silent comedy /
  no dialogue cartoon", protagonist name, episode theme, key prop/location. 8–12 total, ≤500 chars.
- Do NOT over-invest in tags — they are a categorisation anchor, not a discovery lever.

---

## QA CHECKLIST (EXEC-SREV or Director reviews)

| Check | Pass criteria |
|-------|--------------|
| Cold-viewer test | A stranger who doesn't know the character understands + has a reason to click |
| Title hook | Leads with the relatable situation/POV, NOT the character name |
| Format signalled | Title + first line say "Animated/Cartoon" and "No Words/Silent" |
| Keyword placement | Primary keyword in first ~40 chars of description |
| Snippet | First ~150 chars onboard (who + format + topic) — not literary prose |
| Protagonist one-liner | Description introduces the protagonist via the Bible one-liner |
| Language | All fields in English |
| Hashtags | 3–5 present (English; #Shorts first on short-form) |
| Title length | ≤100 chars; ≤60 chars of meaning shown |
| No misleading claims | Title and description don't overpromise |

---

## EXAMPLE (E12 — "Бесконечная лента" / Infinite Scroll)

```yaml
metadata_id: "SS-S15-E12-SPC-metadata-v01-DRAFT"
episode_id: "S15E12"

title: 'When You Open Your Phone "For 5 Minutes" 📱 | Sandy | Animated Comedy'

description: |
  Phone addiction, but make it animated 📱⏳ — Sandy opens his phone "for one minute" and the
  infinite scroll swallows his whole day. (No words, just comedy.)

  We've all been there: you check one thing and an hour vanishes. For Sandy it's worse — he's
  made of sand, so as he scrolls, his time literally drains away. A wordless take on doomscrolling
  that's a little too relatable. Even his loyal friend Metelka can't pull him back.

  Meet Sandy: a 2D cartoon sandman whose time runs out in real time — a silent comedy anyone,
  anywhere can watch (no dialogue, no language barrier).

  ▶ New silent Sandy cartoons every week. Subscribe so your time isn't wasted.

  #Sandy #FunnyCartoon #Animation

tags:
  - "Sandy"
  - "silent comedy"
  - "no dialogue cartoon"
  - "animated comedy"
  - "funny cartoon"
  - "phone addiction"
  - "doomscrolling"
  - "infinite scroll"
  - "2d animation"
  - "physical comedy"

hashtags: ["#Sandy", "#FunnyCartoon", "#Animation"]
playlist: "Silent Sandy Chronicles — S15"
category: "Film & Animation"
language: "en"

version: "v01"
status: "DRAFT"
created_by: "EXEC-COPY"
date: "2026-06-26"
```

> First ~40 chars of the description = "Phone addiction, but make it animated" — primary keyword up
> front, cold-viewer hook, format signalled, all before mobile truncation.

---

*SandyStudio metadata.md | v0.2 | Status: DRAFT*
*Write for the stranger who's never heard of us. The hook is the pain; the name rides in the tail.*
