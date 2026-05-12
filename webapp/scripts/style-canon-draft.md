# S14 STYLE CANON v1.0 — Formal Spec

> Synthesized 2026-05-12 from observed E (winner) silhouette + C (gag-pop) palette + Director feedback "less detail than B, closer to C, broader than just human figures".
> Goal: ONE canonical style asset that gives guaranteed visual consistency across all 26 S14 episodes for characters, objects, locations, and props.
> Slot: replace the 7 exploratory style drafts with this single source of truth. Lock as `SS-S14-SBL-style_s14_canon_v1-v01-LOCKED.md` after Director approval.

---

## 0. Series direction (one sentence)

Flat 2D cartoon, action-first silent comedy in the spirit of The Pink Panther — every frame readable in under 1 second, character and emotion delivered by silhouette + face + flat colour. Zero 3D, zero photorealism, zero cinematic depth.

---

## 1. Line & Shape (universal)

| Rule | Spec |
|---|---|
| Outline weight | **uniform 3–4 px @ 1080p** (4–5 px for hero close-ups) — never tapered, never broken |
| Outline colour | **`#1A1A1A` near-black** on light tier · **`#0A0818` void-purple** on dark tier |
| Geometry | Circles · rounded rectangles · truncated wedges · stubby cylinders. **No** organic freehand curves, no NURBS-feel surfaces |
| Corner radius | **2–4 px** — crisp vector, never brittle |
| Silhouette test | Every character/prop must read clearly at **25% scale** with palette stripped to grayscale |
| Separation | Same-hue neighbours need a **3 px containment stroke** (outline colour) between them |
| Negative space | **≥ 35%** of any frame is empty flat colour field |

---

## 2. Palette (anchor tier)

### Character / hero base (Sandy and family)

| Role | Hex | Use |
|---|---|---|
| **Sandy body — warm sand** | `#F5C842` | primary fill |
| **Sandy shadow flat** | `#C4882A` | 1-step darker, hard band only |
| **Mitten/limb tip** | `#D8763A` | extremities for read |
| **Outline (hero)** | `#1A1A1A` | always |

### Background tiers (pick ONE per episode)

| Tier | Base | Mid | Use case |
|---|---|---|---|
| **LIGHT — Cream Day** | `#F0E6CC` | `#D8C99A` | default — diner, street day, indoor light |
| **DARK — Indigo Night** | `#1A1530` | `#2E2148` | night, drama, Perfume mist episodes (E20 violet distance) |
| **DUSK — Warm Pink** | `#F3B89C` | `#D88260` | sunset, romantic-ish gag tone |

Only ONE tier active per episode. Mid value used for floor band + props receding to background.

### Gag-pop accents (used sparingly)

| Role | Hex | When |
|---|---|---|
| **Electric cyan** | `#00F0E0` | gag trigger, surprise spark |
| **Hot magenta** | `#FF2D78` | escalation beat |
| **Coral pop** | `#F87171` | impact freeze frame only |
| **Acid lime** | `#B0FF3A` | payoff flash (1 per episode max) |

**Hard rule:** maximum **2** accent colours active in any single shot. Accents render as flat shapes only — no bloom, no halo, no soft edge.

---

## 3. Lighting (universal, mandatory)

- **Flat. Zero volumetric.** Single implied frontal key.
- **No cast shadows.** Sole exception: 1 hard darker band on ground plane behind character — flat shape, never gradient.
- **No rim light, no ambient occlusion, no soft edge.** Depth = colour value contrast between layers (BG → midground → character), nothing else.
- Neon accents are **flat colour shapes**, not light sources.

---

## 4. Per-asset-type rules

### 4.1 Characters

- Hero silhouette = round body + stubby limbs + mitten hands + classic comedic feet (per E reference).
- Eyes = black ovals with white pupil dot OR single cyclops eye for stylistic variants (per D). Pick ONE convention per character and keep.
- Expression range: 5 reusable face plates per character — neutral / surprise / worry / determination / payoff. No "in-between" emotion smears.
- Squash-and-stretch = discrete held poses, 5 deformation states per action — no animated smear suggesting mass.

### 4.2 Objects (Perfume Vial, props, gadgets)

- Same outline weight + same palette tier as the scene.
- Geometry stylised but **physically recognisable** — Perfume Vial = clear vertical bottle silhouette + cap, NOT abstract sculpture.
- Surface material indicated by **1 colour + 1 highlight band**, no glass reflections, no glossy spec.
- Object eyes/face (Perfume Vial, Perfume Madame) follow Character rules above.

### 4.3 Locations

- Locations exist as **layered flat shapes**: sky/wall colour field → architectural silhouette → signage cutouts → floor band.
- **Maximum 4 architectural elements per location plate.** Anything beyond is clutter.
- No depth-of-field, no perspective grids, no realistic windows-with-rain. Buildings are 2-tone elevations, not 3D dioramas.
- Lighting hardcoded into the colour fields — no time-of-day animation within an episode.

### 4.4 Props (incidental — chair, lamp, bucket, mirror)

- Drawn as 2-tone silhouettes with outline; no internal detail unless it's a gag function.
- Match scene tier palette; use accent colours only on gag-critical props.

---

## 5. Composition

- **Aspect:** 16:9, locked horizon, no Dutch tilt, no zoom-in lens distortion.
- **Camera:** wide medium shot is default — character occupies centre-left third, right third reserved for incoming gag.
- **Stage discipline:** props enter from frame edge one at a time. No cluttered multi-element frames.
- **Symmetry:** centred symmetry permitted ONLY for impact freeze frame — 1 per episode max.

---

## 6. Texture & finish

- **Zero grain, zero noise, zero film texture.** Pure vector finish.
- **No halftone, no hatching, no rendered fabric.** All surfaces are flat colour fills.
- No paint texture, no canvas, no pencil overlay.

---

## 7. Forbidden list (auto-reject if detected)

- 3D shading, ambient occlusion, soft shadows, volumetric light, depth-of-field blur
- Glossy/wet/specular surfaces, photorealistic reflections, rain on windows
- Cinematic neon café aesthetic, cyberpunk volumetric glow, anime speed lines
- Drop shadows with gradient, soft outlines, anti-aliased halos
- Paint/oil/watercolour finish, sketch lines, half-tone shading
- More than 2 active accent colours per shot
- Multiple background tiers in one episode (no mixing LIGHT + DARK within same ep)

---

## 8. Generation prompt template (use verbatim for every Bible / IMG generation)

```
Flat 2D cartoon, hard-edged vector style, uniform 3-4 px outlines.
Scene tier: <LIGHT | DARK | DUSK>.
Palette (strict, hex-locked):
  body #F5C842 / shadow #C4882A / limb #D8763A / outline #1A1A1A
  background base <tier base hex> / mid <tier mid hex>
  accent <up to 2 from cyan #00F0E0, magenta #FF2D78, coral #F87171, lime #B0FF3A>
Lighting: completely flat, no cast shadows except one hard ground band.
Composition: 16:9, character centre-left third, gag space right third, 35% negative space minimum.
Forbidden: 3D shading, volumetric light, glossy reflections, depth of field, gradient shadows,
  paint texture, sketch lines, multiple accent colours beyond 2, cinematic neon-cafe look.
Asset type: <character | object | location | prop>.
Subject: <describe asset>.
Reference: SS-S14-SBL-style_s14_canon_v1-v01-LOCKED.
```

---

## 9. How to use this canon

1. **Lock this asset as `SS-S14-SBL-style_s14_canon_v1-v01-LOCKED.md`** (text canon, no image required — but optionally generate ONE companion reference plate combining a sample character + sample object + sample location in flat 2D).
2. Every new Bible / Library / IMG asset's prompt opens with the Generation prompt template (§8).
3. PA tool `regenerateBibleImage` passes `styleAnchorAssetId = <this asset's UUID>` for any image generation that needs canon enforcement.
4. Pipeline gate (future Hook): refuse generation if scene tier or palette deviation > threshold against this canon.
5. Mark all 7 exploratory drafts (a–g) as REJECTED via standard kebab → reject UI once this is locked.

---

*S14 STYLE CANON v1.0 | 2026-05-12 | Status: DRAFT awaiting Director review*
