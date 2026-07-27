---
name: plan-preview-drawer-doctrine
description: "Plan asset opens as pre-video contract page (prompt + settings + regenerate + placeholder for upcoming video), not raw markdown"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f0a3593b-9989-42e0-b220-580d55abe0ba
---

# Plan preview = pre-video contract surface

**Director directive 2026-05-27:** «когда уже сформирован контракт на генерацию чтобы когда я перехожу вот на эту ссылочку где сейчас план чтобы я переходил на страничку как бы вот этой самой видеогенерации где еще нет видео но есть всё остальное»

## Rule

When Director clicks on an **SPC-shot_plan** asset (and by symmetry SPC-ref_plan), the preview surface MUST be the **same shape as the VID-shot drawer**, just without the rendered video. NOT raw markdown body.

Required components:
- **Placeholder area at top** reserving video height — clicking Regenerate fills it with the upcoming video without reflow
- **Prompt** in readable text area (parsed from JSON body's `prompt` field), not raw markdown
- **Settings grid:** provider · quality_tier · duration · aspect_ratio · end_image · seed_strategy · resolution
- **Footer CTAs:** Approve · Request revision · **Regenerate**
- Same visual layout, spacing, controls as VID-shot drawer for muscle memory

## Why this rule exists

**Why:** Director needs to inspect the **generation contract** BEFORE the video burns. The Plan IS the contract (prompt + provider + settings). Raw markdown forces Director to mentally parse the JSON block. Same drawer shape as VID-shot means zero cognitive switch when moving from «video review» to «pre-video Plan review».

**How to apply:** When extending `AssetPreview.tsx` or `PreviewDrawer.tsx` for any contract-bearing asset type (Plans, briefs, gag plans), structure the view as a video-drawer-without-video. The placeholder area MUST be reserved so post-Regenerate video lands without reflow. Mirror existing VGENShotPanel layout patterns.

## Anti-pattern

❌ Plan asset opens as scrolling markdown text. Director scrolls past header → finds JSON code block → parses provider/duration/prompt manually → reaches Approve button at bottom. Cognitive overhead.

✅ Plan asset opens as compact «pre-video page»: empty 16:9 placeholder (with «Generating…» state ready), prompt in readable paragraph, settings as 6-cell grid, three buttons. Director scans in 5 seconds, decides.

## Related doctrines

- [[train-personnel-doctrine]] — separate but reinforcing: pre-video page surfaces the Plan so Director can spot whether Animator was «trained» correctly
- TD-80 — popover added Plan version row that links here
- TD-84 — implementation backlog
