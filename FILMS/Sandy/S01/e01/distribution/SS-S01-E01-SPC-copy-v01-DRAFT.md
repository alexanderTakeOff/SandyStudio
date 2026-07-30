# SS-S01-E01 — Episode Copy & Metadata
## SS-S01-E01-SPC-copy-v01-DRAFT.md
## Agent: EXEC-COPY | v0.1 | DRAFT

---

```yaml
episode_id:       SS-S01-E01
episode_title:    "The Red Carpet"
series:           Sandy Studio S01
agent:            EXEC-COPY
inputs:
  - script:       SS-S01-E01-SCR-script-v01-APPROVED
  - story_brief:  SS-S01-E01-SPC-story_brief-v01-APPROVED
  - style_bible:  SS-S01-BIB-style-v01-APPROVED
  - seo_config:   config/defaults.yaml §seo
  - copy_config:  config/defaults.yaml §copy
generation_date:  2026-04-24
```

---

## YouTube Metadata

### Title

```
Primary:    "She Got In. Gravity Didn't." | Sandy Studio
Fallback A: "The Red Carpet Problem" | Sandy Studio
Fallback B: "When Physics Is the Bouncer" | Sandy Studio
```

*Primary selected: leads with the punchline-as-hook, not the plot. "Got In" creates 
curiosity + payoff ambiguity. 60-character limit: ✅ (44 chars including series tag)*

---

### Description

```
One smear. One rope. One solution that works perfectly until it doesn't.

Sandy Studio — original animated comedy. New episode every week.

──────────────────────────────────────
🔔 Subscribe so you don't miss the next one.
──────────────────────────────────────

#animation #silentcomedy #sandystudio #shortfilm #animatedcomedy
```

*No dialogue. No explanation. Description mirrors the episode's tone: deadpan, 
minimal, lets the premise hook. Subscribe CTA at natural break point.*

---

### Tags

```yaml
tags:
  # Series / brand (always)
  - sandy studio
  - sandy studio animation
  - SS-S01-E01

  # Genre / style
  - animated comedy
  - silent comedy
  - physical comedy
  - slapstick animation
  - cartoon comedy

  # Format
  - animated short
  - short film animation
  - 60 second animation
  - one minute cartoon

  # Visual style
  - art deco animation
  - graphic modernism
  - bold cartoon

  # Discovery / viral hooks
  - funny animation 2026
  - original animation
  - indie animation
  - ai animation

  # Character / premise (non-spoiler)
  - hourglass character
  - velvet rope
  - bouncer cartoon
```

---

### Category & Settings

```yaml
category:           Film & Animation
language:           en
made_for_kids:      false
age_restriction:    none
comments:           enabled
likes:              enabled
embeds:             allowed
notifications:      notify_subscribers: true
visibility:         public          # set at publish time
scheduled_date:     null            # set by Director at publish decision
```

---

### End Screen Plan

```
0:00–0:57  — Episode plays
0:57–1:00  — Fade to black begins (SH12 hold)
No end screen elements during episode.

Post-roll (appended in editing — 5–8 seconds):
  - Subscribe button
  - Next episode suggestion (placeholder until E02 exists)
  - Sandy Studio logo card
```

---

### Cards

```yaml
cards:
  - position_seconds: 45    # approximately SH10 — Sandy slowing inside
    type:             subscribe
    label:            "Subscribe for more"
  - position_seconds: 58
    type:             playlist
    label:            "Sandy Studio S01"
    playlist_id:      null    # created at publish time
```

---

## Social Copy

### YouTube Community Post (day of publish)

```
New episode: The Red Carpet 🪞

She gets the smear. She finds a solution. The solution is technically correct.

60 seconds. No dialogue. Physics wins.

[LINK]
```

### X / Twitter

```
She got in.

(physics had opinions)

Sandy Studio — new episode: The Red Carpet
60s animation. No dialogue.

[LINK]
```

### TikTok Caption

```
She solved the problem. The problem solved her back. 

#animation #silentcomedy #cartoon #fyp #animatedshort
```

---

## SEO Notes

```yaml
primary_keyword:     "animated comedy short"
secondary_keywords:
  - "silent animation 2026"
  - "original animated series"
  - "art deco cartoon"
hook_statement:      "She Got In. Gravity Didn't."
search_intent:       entertainment / discovery
thumbnail_text:      none (Style Bible: zero text on generated surfaces)
```

*Thumbnail carries no text — discovery depends entirely on title + tags. 
Primary title front-loads the payoff to maximise curiosity gap in search results.*

---

## Self-Check

```
CHK-C01 Title length:      ✅ 44 chars (limit: 100)
CHK-C02 Description hook:  ✅ First line is premise, not meta-description
CHK-C03 CTA present:       ✅ Subscribe CTA in description
CHK-C04 Tag count:         ✅ 22 tags (YouTube allows 500 chars of tags)
CHK-C05 Hashtags in desc:  ✅ 5 hashtags — within YouTube recommendation (≤15)
CHK-C06 Spoilers:          ✅ None — title/description do not reveal ending
CHK-C07 Tone match:        ✅ Deadpan voice consistent with episode
CHK-C08 Social variants:   ✅ YouTube + X + TikTok covered
CHK-C09 Series tag:        ✅ "Sandy Studio" in title
CHK-C10 Made for kids:     ✅ false — correctly set (content not targeted at children)
```

---

*SS-S01-E01-SPC-copy-v01-DRAFT.md | EXEC-COPY output | Pending Director review*
