---
name: brand-bumper-production-recipe
description: "How to produce a Sandy brand intro/outro bumper (or promo) — reusable script + provider recipe + gotchas. Read before any \"make a bumper / promo / channel intro\" task."
metadata: 
  node_type: memory
  type: reference
  originSessionId: a52cf07d-ffdc-45d2-a622-5bec50b69cc9
---

Studio brand bumpers (intro/outro) are **produce-once, LOCKED `SBL-video_{intro,outro}`
assets** consumed by EXEC-STITCH's two-master branded stitch. Shipped 2026-07-13.

## The reusable tool
`webapp/scripts/gen-intro-action.ts` — kind-aware (`--outro` flag), 2-pass, money-gated:
- **PASS 1** (`~$0.08`): gpt-image-2 **multi-ref edit** (`openAIEditsMultiProvider`) over LOCKED
  S15 canon → on-model START FRAME. Reuses the EXEC-THUMB canon path.
- **PASS 2** (`--animate`, `~$1.69`): `generateVideoFalSeedance` img2vid from that still.
- Reuses `sandy-{kind}-action-v2-still.png` if present (don't re-pay for the image on retries).

## Provider recipe (per bumper ≈ $1.85)
1. gpt-image-2 multi-ref: refs = **all LOCKED S15 canon** (`SBL-character_sandy_hourglass`,
   `SBL-character_anvil`, `SBL-character_madam_parfum`, `SBL-style_s15_style_canon_2d_v1`),
   S15 series_id = `45351141-6334-4bf0-8a0f-4e00a994f670`. Identity-lock clause in the prompt
   (name the characters, "render EXACTLY on-model") or they drift generic.
2. Seedance 2.0 **fast** img2vid, 7s, 16:9, silent (`generate_audio:false`).
3. **ffmpeg POST** (separate bash, $0): iris-**in** for intro / iris-**out** for outro via
   `xfade transition=circleopen|circleclose` against a 0.7s black clip; overlay a crisp `Sandy`
   wordmark PNG (sharp SVG, NOT model-rendered text — multi-ref edits garble text); upscale to 1920×1080.
4. Music baked LAST via a direct ffmpeg mux (`-c:v copy` + aac + afade), OR `compose-brand-clip.ts`.
5. Register DRAFT with `scripts/register-brand-bumpers.ts` → Director LOCKs (hard-limit).

## Gotchas (verified in code/runtime, cost real money if forgotten)
- **Seedance `fast` maxes at 720p** — 1080p → fal 422 (validation, no charge). Generate 720p, **upscale
  to 1080p in post** (bookend MUST be 1920×1080 to match the episode body or the branded concat skips it).
- **gpt-image-2 `quality:'high'` routinely times out** at the provider's 90s fetch cap (possible
  server-side bill). Use `quality:'medium'` for 1536×1024.
- Precise "sand streams THROUGH the letters and fills the bulb" is **motion-graphics (After Effects),
  NOT Seedance** — img2vid only approximates the gesture. Set that expectation.
- Video preview in the Library needs a **poster** (`<video src="…#t=0.1">`) or it's a black box.

## Where the outputs live
`FILMS/_media_cache/_brand/sandy-{intro,outro}-*.mp4` (silent finals + `-v2-music.mp4`).
Feeds the branding feature: LOCKED `SBL-video_*` → EXEC-STITCH builds `VID-final_cut-branded`
(intro→body→outro) by the stitch-workspace intro/outro toggles; clean `VID-final_cut` stays for Shorts.

Pairs with [[sandy_canon_visual_identity]]. Series/style are referenced by S15 ids above — for a new
series, swap the canon file_types + series_id.
