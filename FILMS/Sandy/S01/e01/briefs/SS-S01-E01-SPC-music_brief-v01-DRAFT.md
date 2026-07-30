# SS-S01-E01 — Music Brief
## SS-S01-E01-SPC-music_brief-v01-DRAFT.md
## Agent: ART-MS | v0.1 | DRAFT

---

```yaml
episode_id:   SS-S01-E01
total_runtime: 60
```

**Note:** This episode is driven entirely by sound design. Music provides structural
framing only — it never compensates for or explains the action. The cascade of sand,
the brass click, and the silicone squeak carry the emotional weight.

---

## Tracks

```yaml
tracks:

  - track_id:     T01_swagger
    placement:    "Act 1 — Sandy's entrance and approach"
    timing:       "00.00–00.18"
    target_duration_seconds: 18
    mood:         "self-important, bouncy, slightly ridiculous — confidence that
                   hasn't been tested yet"
    instrumentation: >
      Sparse jazz-adjacent: single muted brass stab on beat 1, light woodblock,
      plucked double bass walking line. Nothing lush. Nothing warm.
      The music is as pleased with itself as Sandy is.
    tempo_bpm:    116
    structural_notes:
      intro_build: false
      main_loop:   true    # loops cleanly if Sandy's walk is longer than 18 sec
      outro_fade:  false   # cuts abruptly on trash smear hit
    loop_required: true
    comedy_accent: "abrupt hard stop (no fade) on the frame Sandy sees the smear"

  - track_id:     T02_assessment
    placement:    "Act 2 — rejection through handstand solution"
    timing:       "00.18–00.42"
    target_duration_seconds: 24
    mood:         "tense calculation — not panic, not drama. Problem-solving under
                   social pressure. Slightly absurd."
    instrumentation: >
      Muted pizzicato strings, single sustained low brass tone under Inspector's scan.
      On handstand: a brief ascending run — not triumphant, more like a question mark.
      On approval chime: strings resolve upward, then cut.
    tempo_bpm:    96
    structural_notes:
      intro_build: true     # builds through Inspector's processing scan
      main_loop:   false
      outro_fade:  false    # resolves on Inspector's ascending chime
    loop_required: false
    comedy_accent: >
      On Inspector's approval chime (00.40): strings resolve to major chord —
      but in a slightly wrong key. Optimism that is structurally suspicious.

  - track_id:     T03_collapse
    placement:    "Act 3 — interior walk through collapse"
    timing:       "00.42–01.00"
    target_duration_seconds: 18
    mood:         "dignified effort losing to inexorable physics —
                   heavy, slowing, bass-led. The music sinks like the sand."
    instrumentation: >
      Low sustained bass note that drops in pitch as sand accumulates.
      Single sustained cello line that bends downward.
      No percussion after 00.52 — silence amplifies the weight.
      Ends on floor impact: single low bass thud, then nothing.
    tempo_bpm:    72     # slower than T01 — weight is increasing
    structural_notes:
      intro_build: false
      main_loop:   false
      outro_fade:  false   # ends on impact, not fade
    loop_required: false
    comedy_accent: "bass thud on collapse frame (00.56), then 4 seconds of silence"
```

---

## SFX Markers

```yaml
sfx_markers:
  - timecode:   "00.14"
    sound:      "trash_impact"
    description: "soft wet smack — black debris hits silicone. Slightly disgusting."

  - timecode:   "00.19"
    sound:      "inspector_scan_start"
    description: "brass_click (single) + faint mechanical hum as shaft extends"

  - timecode:   "00.24"
    sound:      "inspector_reject"
    description: "descending single chime — brass, clean, final"

  - timecode:   "00.30"
    sound:      "sandy_handstand"
    description: "silicone_stretch (effort squeak) + gloves on carpet (soft pad pad)"

  - timecode:   "00.34"
    sound:      "sand_migration_start"
    description: "sand cascade begins — low, dry, continuous under T03"

  - timecode:   "00.40"
    sound:      "inspector_approve"
    description: "ascending single chime — same brass tone, reversed direction"

  - timecode:   "00.42–00.56"
    sound:      "sand_increasing"
    description: "cascade volume increases steadily — louder = heavier = more sand"

  - timecode:   "00.56"
    sound:      "sandy_collapse"
    description: "heavy floor impact — low bass thud + brief sand settling sound"

  - timecode:   "00.58"
    sound:      "crowd_reaction"
    description: "ambient murmur shift — slight increase, then settle. No laughter cue."
```

---

## Music QA Criteria

Per `ART-MS` QA protocol. All tracks must pass before EXEC-MGEN delivers:
- MQ-01: Each track within ±2s of target duration
- MQ-02: Peak headroom ≤ –6 dBFS
- MQ-03: T01 cuts hard (no fade) on trash smear frame
- MQ-04: T03 ends on bass thud, not fade
- MQ-05: No track contains recognisable melody that could cause YouTube Content ID claim

---

*SS-S01-E01-SPC-music_brief-v01-DRAFT.md | ART-MS output | Pending Director approval*
