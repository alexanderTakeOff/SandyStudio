---
name: grill-me-skill
description: "Custom global /grill-me skill exists — interrogate Director to pin requirements BEFORE code, with q<N> numbering + 2-3 batching."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 048c2fc0-5f3d-415f-b95d-cfd57d043114
---

Global skill at `~/.claude/skills/grill-me/SKILL.md` (works in every project/session). Adapted from mattpocock/skills grill-me (MIT), 6-line body. Triggers: «grill me», «погоняй», «погоняй по плану», «допроси меня», «stress-test this».

What it does: before writing code, interrogate Director to extract every missing requirement / resolve every open decision, walking the design tree depth-first.

Our customizations vs the original (the reuse-not-fork move):
- **q<N> continuous numbering** ([[director_question_numbering]]) instead of unnumbered.
- **batches of 2-3 related questions**, NOT one-at-a-time — fits Director's stream-of-consciousness ([[director_message_stream_read_all_first]]); original forces serialization.
- conversational phrasing + recommended default inline ([[director_questions_human_style]]).
- explore code instead of asking when the answer is in the codebase.

Crystallizes behavior our rules already mandate ([[anti_additivity_principle]] partnership loop) into an explicit on-demand mode. Zero runtime/deps/cost — one markdown file.
