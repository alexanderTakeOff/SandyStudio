---
name: seedance-prompting
description: Prompt + parameter playbook for ByteDance Seedance 2.0 image-to-video on fal.ai. Use whenever generating, regenerating, or rewriting prompts for VID-shot assets where the provider is `seedance-fal-img2vid`. Pairs with `webapp/lib/agents/providers/fal-seedance.ts` and `webapp/components/vgen/ProviderControlPanel.tsx`.
status: ACTIVE
owner: EXEC-VGEN (Animator)
applies_when:
  agent: [EXEC-VGEN]
hard: false
maturity: stub-v0.1
created: 2026-05-14
---

# Seedance 2.0 — Prompting Playbook (SandyStudio)

> v0.1 — Sprint β kickoff. Will grow with each E2x production. Append findings
> as labelled subsections; do not rewrite history.

## When this skill applies

- The shot's resolved provider is `seedance-fal-img2vid` (default for
  `character_video` per migration 0028).
- The agent (`EXEC-VGEN` or the regenerate-video endpoint) is composing a
  prompt for the queue submission.
- Director is hand-editing the prompt textarea in `<VGENShotPanel>` and
  wants guidance.

For Veo 3 the rules are different — see future `veo-prompting` skill. Do not
cross-pollinate.

## The seven prompt slots

Seedance 2.0 responds best to a **structured prompt**, not a paragraph. The
following slot order produces the most consistent character motion and
camera control in our internal probes (E20 / 2026-05-13):

```
SHOT TYPE:
<framing label — e.g. "Medium close-up, 16:9">

SUBJECT:
<who/what is visible, anchored to the locked reference image>

ACTION:
<one clear physical action; verbs only — Seedance over-interprets adverbs>

CAMERA:
<lens framing + movement; static unless motion is the point>

MOTION:
<character motion + object motion + environmental motion, separated>

STYLE:
<visual style + lighting + rendering — match Series Bible style canon>

CONTINUITY:
<locked character / location / costume / props — refer back to anchor>

NEGATIVE:
<what must NOT happen — comma-separated list>
```

**Slot omission is allowed** but prefer all seven when the shot is final
quality. Skipping CONTINUITY is the single most common cause of
character-drift defects we've seen.

## Worked example (E20 SS-S14-E20-A1-SC03-SH01)

```
SHOT TYPE:
Medium close-up, 16:9, eye-level framing.

SUBJECT:
Sandy (animated hourglass character), tilting forward over a pale cream-white
counter inside a softly-lit perfume boutique.

ACTION:
Sandy leans forward. Both eyes water. One fat cartoon tear forms at the
inner corner of each eye. He smiles wider and leans in further.

CAMERA:
Static camera, slow 5% push-in. Keep Sandy centred. No handheld shake.

MOTION:
Subtle character animation only: eyebrow lift, tear bead descent,
shoulder lean. Mist particles drift unprompted off Perfume Madame in the
right edge of frame. Background remains stable.

STYLE:
Stylised 2D animation, S14 STYLE CANON v1.1 (outline-only pencil edge,
flat vector fills, no hatching). Warm cinematic lighting.

CONTINUITY:
Match reference image exactly for Sandy's proportions, golden sand colour,
dark-grey cap, and the perfume counter layout. Perfume Madame's atomiser
remains gold-chain. No outfit changes.

NEGATIVE:
no extra limbs, no face morphing, no costume changes, no extra characters,
no text or logos, no camera shake, no melting objects, no hatching.
```

## Parameter playbook

| Parameter | Default | When to deviate |
|---|---|---|
| `aspect_ratio` | `'16:9'` for YouTube; `'9:16'` for Shorts/Reels | Use `'auto'` only when the reference image is non-standard ratio. Avoid `'21:9'` for character close-ups — wastes vertical pixels. |
| `quality_tier` | `'fast'` for iteration, `'standard'` for final-cut shots | Use `'standard'` for any shot we're going to ship. `'fast'` for camera-test reroll loops. |
| `resolution` | `'720p'` for animatic / iteration, `'1080p'` for final | `'1080p'` costs ~2.25× per second. `'480p'` is only for throwaway tests. |
| `duration_seconds` | Match storyboard `shot_list[i].duration_seconds`, clamp to [4, 15] | If the storyboard says <4s, raise to 4 and let STITCH trim. If >15, split into two shots. |
| `seed` | omit (random) during iteration | **Lock a seed** the moment a shot looks 80%+ right. Subsequent reruns with the same seed + minor prompt tweaks tend to preserve identity — critical for batch-regen across a scene. |
| `end_image_url` | omit | Use for camera-tightening shots (start wide → end close), or for a deliberate state change in-frame (character enters, props rearrange). Two-shot reaction beats benefit. |

### Cost intuition (Sprint β baseline)

| Tier | $/second @ 720p | 5s · 720p | 8s · 1080p · standard |
|---|---|---|---|
| Fast | $0.242 | $1.21 | $4.36 |
| Standard | $0.302 | $1.51 | $5.44 |

Plan accordingly when iterating. Standard 1080p × 15s = ~$10. Use 480p for
camera tests; switch to 1080p when locked.

## Hard rules (don't violate)

1. **Always pass `generate_audio: false`** — Seedance inline audio clashes
   with the music track laid down by `EXEC-MGEN` (Composer) and the muxed
   final cut from `EXEC-STITCH` (Online Editor). Already enforced in
   `fal-seedance.ts` line ~195; surfaced here so prompt authors never ask
   for audio cues in the prompt.

2. **Never describe a character's identity in the prompt as if it were
   novel.** The character lives in the locked reference image. The prompt
   describes **what they do**, not **who they are**. Example:
   - ❌ "Sandy, a sand-filled hourglass character with golden granules…"
   - ✅ "Sandy leans forward; golden sand surges warmly upward into his chest."

3. **Mention the reference asset's framing.** If the reference is a wide
   shot but the prompt asks for a close-up, Seedance interpolates an
   ungrounded zoom — character proportions drift. Match prompt framing to
   the reference, or supply an `end_image_url` that conveys the close-up
   target.

4. **One primary causal chain per shot**, not one verb (softened 2026-05-27).
   Beats may chain causally («tap → launch → smash → vibrate» — four beats,
   one subject, one chain) and a reactive micro-beat on a secondary subject
   is fine (e.g. character recoil from the primary impact). Seedance 2
   renders these without blur. What DOES blur Seedance is genuinely parallel
   independent actions — split those into two shots. Comedy rhythm
   (technology.md §3.5) remains 3-5s per cut.

5. **Negative prompt is not optional.** At minimum:
   `no extra limbs, no face morphing, no costume changes, no extra characters,
   no melting objects, no text, no logos`. Seedance is robust but the
   surcharge of including this list is zero and it visibly reduces defect
   rate (E20 probe 2026-05-13).

## Known quirks (collected from production probes)

- **Parent-truncated status URLs** — fal returns `…/seedance-2.0/requests/<id>/status`
  even though POST was to `…/seedance-2.0/image-to-video`. Use returned URLs
  verbatim; do not reconstruct. Already handled in adapter.
- **Duration must be string enum, not int** — payload uses `"5"`, not `5`.
  Adapter handles. Don't fight this.
- **Seedance enforces 4–15s clamp.** Storyboard timings outside that range
  are silently clamped at submit time; runner logs the clamp.

## Open questions (to refine with more E21+ probes)

- Best resolution for the `regenerate-video` iteration loop — currently we
  default to 720p but a Director ablation on 1080p iteration cost-vs-quality
  is pending.
- Whether seed-locking across a scene (same seed, ±10s of prompt drift)
  consistently keeps character identity. Anecdotal yes, no formal probe.
- `end_image_url` for emotion arc (frame 0 = neutral, frame N = punchline) —
  promising but unconfirmed for our gag density.

## Cross-references

- Adapter: [`webapp/lib/agents/providers/fal-seedance.ts`](../../../webapp/lib/agents/providers/fal-seedance.ts)
- Capability manifest: [`webapp/lib/api/provider-capabilities.ts`](../../../webapp/lib/api/provider-capabilities.ts)
- UI: [`webapp/components/vgen/ProviderControlPanel.tsx`](../../../webapp/components/vgen/ProviderControlPanel.tsx)
- Phase A.1 prompt builder: [`webapp/lib/api/vgen-shot-helpers.ts`](../../../webapp/lib/api/vgen-shot-helpers.ts) (currently provider-agnostic; future fork into seedance-specific composer is a follow-up)
- Series style anchor: [`technology.md`](../../../technology.md) §3.5 (shot rhythm)
