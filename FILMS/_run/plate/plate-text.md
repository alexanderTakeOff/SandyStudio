# SANDY STUDIO — SS-S20 «DEEP» — OBJECT BIBLE
## THE SERIES HERO: THE BATHYSCAPHE (turnaround + light signature)

**Canon ID:** S20-HERO-001
**Role:** PROTAGONIST of the series. The vehicle carries the gaze; the series has no human face by design, so THIS is the identity that must never drift.
**Version:** 1.1 — text restored 2026-08-10 after `register-canon` overwrote it; see §6.
**Status of this text:** AUTHORITATIVE. Where this text and the turnaround image disagree, THIS TEXT WINS.

---

### 1. What this asset is

One sheet, six views of the SAME vehicle in a clean 3x2 grid on a near-black background, each view captioned underneath in small plain white uppercase letters: FRONT, REAR, LEFT, RIGHT, TOP, BOTTOM. A sheet rather than six separate assets, so the canon reads as a whole and costs one image.

BOTTOM is mandatory: in this world the vehicle is most often seen from below, and the same view is needed for shots framed as "we are inside someone else's eye".

One angle does not hold a series. The moment the vehicle appears from another side, the model re-invents it. The turnaround is the only defence against silhouette drift.

### 2. Hull

Pale grey-white hull. Hemispherical blister canopy with warm amber light inside. Dome with a mast and handrails. Two outboard brackets carrying floodlights. Tubular ski frame underneath.

No human figure ever appears OUTSIDE the vehicle — an external human sets the scale of the world and kills the premise. A hand resting on the joystick INSIDE the cabin sets no scale and is permitted.

### 3. Light signature — AVIATION CONVENTION

The lights do two jobs, not one: they say "this is our vehicle", and they say WHICH PART of it we are looking at. The convention is borrowed from aircraft because the viewer reads it without being taught.

| Where | What | Reads as |
|---|---|---|
| Starboard / RIGHT side | two GREEN points | right side |
| Port / LEFT side | two RED points | left side |
| REAR | tail markers: RED on the left, GREEN on the right, on the flanks | looking at the tail |
| FRONT | TWIN floodlight: one lamp left, one lamp right | looking at the nose |

The twin floodlight is engineering logic, not decoration: REDUNDANCY. One lamp burns out, the other remains, and that is visible. It also means our light is always TWO cones, which separates it from any foreign single source before colour is even read.

Points are single, almost pixel-sized, very bright, each with a small halo. The halo is required: without it the points are the first thing to die after a 9:16 crop and platform compression. Readability is verified at a few percent of frame width — on wide shots the vehicle is exactly that small.

**Palette note.** Red and green are the fourth and fifth colours of the series, and this does not repeal the three-colour law — it refines it. Colour in this world always has a source, and red and green are the ONLY man-made colours; they mean "our vehicle". They never appear in surfaces, creatures or water. Any other colour remains forbidden.

### 4. Why the signature exists — the tumble

The vehicle will spin fast in front of camera after striking something it does not understand. In that moment the viewer must understand: two thrashing cones and thrashing red-green markers are OUR bathyscaphe, and it is in trouble. Without a hard onboard scheme the tumble reads as random flashes in the dark; with it, as a specific object that has lost control. It is the only way to stage action in a world where nothing is visible except light.

### 5. Light sides on BOTTOM — mirrored in v01 AND in v02; corrected in v03 (2026-08-12)

**State of this sheet — v03, measured not eyeballed.** On BOTTOM the red light sits on the LEFT of frame and the green on the RIGHT. All six views were re-measured pixel-wise after the edit: FRONT green-left, REAR green-right, LEFT red, RIGHT green, TOP green-left, BOTTOM red-left. Every view now agrees with the table in §3.

**What actually happened.** On v01 the BOTTOM lights were mirrored. An edit on 2026-08-10 targeted exactly that and **did not fix it** — the sheet shipped as v02 with the defect still in place, while the previous text of this section declared it corrected. The Director found it on 2026-08-12 by looking at the sheet.

**The proof needs no argument about which way the nose points.** On TOP and on BOTTOM the vehicle is oriented the same way (nose toward the bottom of frame — the amber canopy on TOP, the underside of the same blister on BOTTOM). A top view and a bottom view of one object at one orientation MUST be mirror images of each other; both had green on the left. TOP independently satisfies §3 (seen from above with the nose down-frame, starboard falls to the left), so the view in error was BOTTOM.

**How v03 was made.** Channel swap R↔G inside two 120×120 px windows around the two lights — **3 063 pixels of 1 572 864**. The hull, ski frame, brackets, canopy and halos are untouched, and the sheet was deliberately NOT regenerated: a repeat through the image endpoint produces a DIFFERENT vehicle.

Two dead ends are recorded so the next edit skips them: swapping every pixel where R≠G turns half the hull cold (the hull is not strictly grey), and widening the window to the whole BOTTOM cell turns the warm underside of the blister violet. What works is a saturation ratio, not an absolute threshold, inside a window wide enough for the halo (±60 px) and no wider.

**The rule still stands:** the side of each light is taken from the table in §3 and from the geometry of the viewpoint — never read off the picture. The table is the authority; the sheet illustrates it.

**And a second rule, paid for by v02:** a fix is written down as a MEASUREMENT, never as an intention. The old text of this section said "in v02 this is corrected" while the sheet said otherwise, and that sentence suppressed suspicion in everyone who read it afterwards. State what was measured, and state it after the edit.

### 6. Provenance of this text — read before trusting it blindly

On 2026-08-10 `register-canon` was called to replace the sheet image. The tool updates the existing row instead of creating a sibling, and in doing so it **overwrote this asset's text** with the short `--desc` string and dropped the row from LOCKED to REVIEW.

The text above was restored from two full readings of the original made in the same session, immediately before the overwrite. It is a faithful restoration, **not a byte-identical copy** — if any wording differs from the original v01 text, this note is why. The original image bytes were never lost: `SS-S20-SBL-character_bathyscaphe_turnaround-v01-LOCKED.png` is intact in the media cache.

**Operational lesson — the hole is CLOSED since 2026-08-12.** `persistAsset` now refuses to overwrite a LOCKED row: any edit to a locked plate is written as a NEW version (max+1) in REVIEW, and the text is inherited rather than replaced. `register-canon` also accepts `--text <file>`, so the sheet and its text travel in ONE call instead of an image call that silently drops the words. v03 of this plate is the first row written through that path.
