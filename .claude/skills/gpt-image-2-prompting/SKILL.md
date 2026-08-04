---
name: gpt-image-2-prompting
description: How gpt-image-2 wants a prompt built — element order, indexed reference roles, exclusions without a negative parameter, single-instant phrasing, and the words that actually move the model. Provider mechanics only; nothing about genre or subject. Mirror of `seedance-prompting` on the image side.
status: ACTIVE
owner: EXEC-EREF-DESIGNER (Episode Reference Designer)
flavor: tool
tool: gpt-image-2
version: "2"
applies_when:
  agent: [EXEC-EREF-DESIGNER]
hard: true
created: 2026-07-31
---

# gpt-image-2 — Prompt Mechanics

Everything here is about the MODEL, not about the film. What leads the frame and
what the frame is about comes from the genre playbook; this file only says how to
phrase it so gpt-image-2 renders what was meant.

**Invalid for other models.** Version-bump or write a sibling when the provider
changes — the ordering and the reference-indexing rules below are specific to this
one.

## 1. Element order — scene first, constraints last

OpenAI's own guidance: write in a consistent order — **background/scene → subject →
key details → constraints**. Do not open with the constraint list, and do not open
with a block that only makes sense once the scene is known.

Use labelled segments with line breaks rather than one continuous paragraph. The
model reads structure; a wall of prose flattens the hierarchy you meant.

## 2. Reference images — index them and give each a ROLE

Up to 16 references are accepted, and they arrive **unlabelled** unless the prompt
labels them. An unlabelled reference is an invitation to copy its content.

Every attached image gets one line, in attachment order:

```
Image 1: <slug> — IDENTITY. Reproduce the subject's shape and markings. Nothing else from this image.
Image 2: <slug> — STYLE ONLY. Palette, light behaviour, surface treatment. Do NOT copy its subject or any object in it.
Image 3: <slug> — LAYOUT. Camera position and the placement of fixed elements.
```

Then state the interaction explicitly: *"apply Image 2's palette to the subject
from Image 1"*, *"put the subject of Image 1 into the space of Image 3"*.

For a style-only reference, name what to borrow AND add hard constraints against
extra elements — the documented recipe keeps *"palette, texture, brushwork, film
grain"* while changing the subject, plus explicit «no extra elements».

**There is no fidelity knob on this model.** `input_fidelity` existed on
gpt-image-1/1.5; on gpt-image-2 it is **disabled and the API errors on it** —
every attached image is processed at high fidelity by construction. The prompt is
the only lever you have over how strongly a reference pulls.

**Therefore the strongest control is attachment itself.** If a plate's CONTENT must
not appear, the reliable move is **not to attach it** and to describe what you
wanted from it in words. (SS-S20-E01 SH04, 2026-07-31: a typography specimen plate
— rows of the alphabet and numerals — was attached unlabelled and the model
rendered the whole alphabet onto the surface. This exact failure has no public
precedent, so role-labelling is a reasonable first try, not a proven fix; if it
survives one retry, detach the plate.)

**Ceiling:** 16 input images. A mask, if ever used, applies to the FIRST image only.

## 3. Exclusions — write them, don't dance around them

The endpoint has **no `negative_prompt` field**, and OpenAI's answer is blunt:
state the exclusion in the prompt. Verbatim: *"State exclusions and invariants
explicitly (e.g., 'no watermark,' 'no extra text,' 'no logos/trademarks,'
'preserve identity/geometry/layout/brand elements')."*

**This contradicts diffusion-era folklore and the folklore is wrong here.** «Never
say "no X", the model will draw X» is a Stable-Diffusion-era rule; on this
autoregressive family OpenAI deliberately prescribes the opposite. Do not soften
exclusions into hints.

The two forms are **complementary, not alternatives** — use both:

| Form | Job | Example |
|---|---|---|
| Positive invariant | something that must BE true | «the surface is smooth and unmarked» |
| Explicit exclusion | something that must not be invented | «no letters, no text, no glyphs» |
| Change-only + preserve list | edits of an existing image | «change only the background; keep everything else the same» |

Repeat the preserve list on **every** iteration of a revision — the documented
failure mode of long prompts here is drift, not truncation.

**No evidence exists for a maximum number of exclusions.** Anyone who quotes
"max 3–5 negatives" is inventing it. Keep the list to this shot's real risks
because attention is finite, not because of a documented ceiling.

## 4. Which instant — name it, don't ban verbs

The rendered frame is a still, and for us it is the FIRST frame of a video shot.
The job of this section is to make the prompt state **which** instant that is.

**Honest status of the stricter rule:** OpenAI documents no frozen-instant
vocabulary, no list of temporal words to avoid, and no claim that action phrasing
makes the model render the end of the action. Its own shipped example prompts use
progressive verbs freely («running away from the bear as it destroys the campsite
behind her»). The "temporal language flattens to the last moment described" claim
circulates without a single citation. So:

- **Do** state the moment explicitly and describe what is true at it.
- **Do not** write a sentence that only makes sense across seconds — «the beam
  travels along the wall and then finds the letters» describes two frames, and the
  model must pick one.
- **Do not** treat every gerund as a defect. «Marine snow drifting through the
  beam» is a texture, not a sequence.

**The real test is not grammar, it is countability:** if the sentence contains two
states that cannot both be true in one photograph, split it and keep the one you
want. That is the failure we actually saw — «the cones have just found the surface;
the vehicle has not yet begun to drift» is a caption about two different times.

**One caution specific to our pipeline:** an over-frozen first frame can fight the
video stage. Animators' own guidance is that implied motion in the input still
(motion blur, mid-action pose) shapes what the video model does with it, and a
video prompt that contradicts those cues needs more iteration. A completely inert
first frame is not automatically the best first frame — pick the instant that the
motion should start FROM.

## 5. Emotion — gaze and interaction are the documented levers

OpenAI's own reference prompts use abstract mood words freely («a kind expression,
gentle eyes, and a brave but warm demeanor»), so «never write an emotion word» is
not their rule and is not ours. What IS documented: *"For people in scenes,
describe scale, body framing, gaze, and object interactions"* — with «looking down
at the open book, not at the camera» as the worked example.

So: name the feeling if it helps, but always give the geometry that carries it —
where the eyes point, what the hands hold, how the body is turned. Whether emotion
LEADS the prompt is a genre decision and lives in the genre playbook. **There is no
evidence either way about prompt position**, so treat any leading-block rule as a
craft choice, not as a model fact.

## 6. Words that move the model, words that don't

- **Say `photorealistic`** when you want photorealism — the literal word is a
  documented activator, as are "real photograph" / "taken on a real camera" /
  "professional photography".
- **Use capture vocabulary**: lens length, aperture feel, direction and quality of
  light. But know what it is: camera specs are *"interpreted loosely… use them
  mainly for high-level look and composition rather than exact physical
  simulation."* They set a look; they do not simulate optics.
- **Lens and lighting beat quality tokens**, in OpenAI's own words: camera and
  composition terms *"often steer realism more reliably than generic
  '8K/ultra-detailed.'"* "Masterpiece", "award-winning", "trending on" are
  Midjourney-era tags this model does not read — they displace description that
  would have worked.
- **Quality levers must be physical**, and rationed: film grain, textured
  brushstrokes, macro detail. Never evaluative adjectives.
- **Name framing and viewpoint explicitly**: close-up / medium / wide, eye-level /
  low-angle / top-down; and lighting/mood: soft diffuse, high-contrast.
- **`cinematic` is a commitment, not an error.** The guide warns against it in the
  section on making an image look like a *real photograph* — it trades documentary
  realism for a movie look. When a movie look is the point, that trade is the
  intent. Decide per series, don't ban the word.
- **Literal text in quotes or ALL CAPS**, with typography named; spell tricky
  words letter-by-letter. Text rendering is much improved but still hedged by
  OpenAI itself on precise placement — no accuracy percentage is official.

## 7. Length

The hard limit is **32,000 characters** (characters, not tokens). There is no
documented point where more detail stops helping, only procedure: start from a
clean base prompt and refine with small single-change follow-ups.

The documented failure of long prompts is **drift, not truncation** — constraints
get lost, which is why the preserve list is repeated on every iteration. When a
prompt stops improving with more words, look for two clauses asking for different
images.

## What is NOT true (checked, so nobody re-invents it)

- **No first-token weighting.** Nothing documents that early words carry more
  weight. Any prompt architecture justified by "the model reads this first" is
  untested.
- **No "thinking mode" parameter** in the image API. Third-party blogs claim one;
  no OpenAI source has it.
- **No published text-accuracy figure.** The 95%/99% numbers are third-party.
- **`input_fidelity` is gone.** Advice to "set input_fidelity=high" is 1.5-era and
  errors on this model.

## Size (2026-07-31 — worth revisiting)

gpt-image-2 accepts **free-form sizes**: max edge ≤3840 px, both edges multiples of
16, ratio ≤3:1, total pixels 655,360–8,294,400. Our `SIZE_BY_DELIVERY_TARGET`
(`lib/api/provider-capabilities.ts`) still pins the three gpt-image-1 sizes and
carries a comment forbidding true 9:16 as "invalid for the provider". That comment
is stale for this model — a real 1080×1920 vertical reference is now possible
instead of a 2:3 portrait the video stage has to re-frame. Not changed here; flagged.

## Sources

- OpenAI cookbook, *GPT Image Generation Models Prompting Guide* (merged 2/1.5/1,
  April 2026) — element order, indexed reference roles, explicit exclusions,
  change-only+preserve, gaze/interaction, photorealism trigger, camera-specs
  caveat, iteration procedure.
- OpenAI *Image generation* API guide + `gpt-image-2` model page — `input_fidelity`
  disabled, 16-image ceiling, mask-applies-to-first, 32,000-character limit,
  free-form size bounds, text-placement hedge.
- `webapp/lib/agents/providers/openai-edits-multi.ts:33,99` — our model id and the
  absent negative-prompt parameter, verified in our own call path.

## Identity ceiling — four recognisable characters per frame (2026-08-01)

**The model locks at most FOUR identities.** A fifth attached identity reference is
not merely weaker — the fifth character comes back **invented from the prompt's
words**, wearing the right idea and the wrong canon.

Measured on SS-S15-E35, three runs of the same shot, one variable each:

| Refs | Order | Fifth character |
|---|---|---|
| 5 identities | style → location → identities | off-canon |
| 5 identities | location → identities → style | off-canon, unchanged |
| 4 identities | location → identities → style | four lock; the model **volunteers a fifth** on its own |

**So the ceiling is about the count, not the ordering**, and it sits far below the
provider's own limits: `MAX_REFS = 16` in the adapter, and `episode-references.ts`
calls 6–7 refs «comfortably under the cap». Neither number governs *recognisability*.

**Consequences for whoever plans the frames:**

- A scene needing more than four named characters is **split across shots**, not
  compressed into one. Chain them by overlap — each shot shares a character with
  the next — and the group still reads as continuous.
- The count that matters is **identities**, not references: location and style refs
  do not consume the budget.
- Stating «exactly four characters and no others» does **not** stop the model adding
  a fifth silhouette to fill a bench. Crop the frame so there is no room for one.
- Accept a multi-character frame **name by name against each canon plate**. Judging
  the frame «as a whole» is what let an off-canon character through in the first
  place.

**Related, and separate:** the ref-ORDER contract (TD-53, `episode-references.ts`)
still holds — location first as the canonical layout, then identities, then style.
It just does not buy a fifth identity.
