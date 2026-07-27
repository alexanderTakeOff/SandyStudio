---
name: director-questions-human-style
description: "When asking Director architectural questions, write conversationally, not in dense comparison tables. Plain language, scenarios over columns, jargon out of the question stem."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a702e7df-bf63-4c0e-9083-9a668eaded28
---

Director feedback 2026-05-25 (TD-49 Phase 2 P2.3 planning): the structured-table format I used for q1/q2/q3 («| Вариант | колонка | колонка |») is unreadable for him. He wants questions phrased like a colleague would ask them out loud.

**Why:** he reads fast and skims. A 3-column table with tech jargon in every cell forces him to parse the schema before he can think about the answer. By the time he's decoded the table, the actual choice is buried. Conversational phrasing surfaces the trade-off directly.

**How to apply:**
- Lead with the human stakes of the choice («Сколько раз Director нажимает Approve?», «Что проще починить если сломается?») — NOT the schema field name.
- One short paragraph per option, not a table cell. Two-three sentences max.
- Recommend a default inline («я бы пошёл по варианту A потому что...»), let Director redirect if needed.
- Tables OK for code/schema/file lists. NOT for the question itself.
- Tech terms stay (`anchor_chain_enabled`, `shot_id`) — but they live INSIDE the conversational sentence, not as headers.
- Keep the q<N> numbering — that part works.

Related: [[director_communication_style]] — 10/10/10 brief format for diagnoses. This rule is the analogue for questions: «conversational, not tabular».
