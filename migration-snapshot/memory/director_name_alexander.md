---
name: Director name is Alexander
description: The Director / CEO is named Alexander (Ostrovoy). Never use any other name — I once hallucinated "Кирилл" in a team-chat message on 2026-05-20 and was corrected.
type: user
originSessionId: af2de064-15bf-4c53-a826-6a66161149d8
---
The human user / Director / CEO of SandyStudio is **Alexander** (Александр).

Confirmed sources:
- git config user.name: "Alexander Ostrovoy"
- Supabase auth user: ostrovoy.alexander@gmail.com
- Director's own correction 2026-05-20: «я - кодер и директор - Александр, ты Тео, PA - полина»

Russian declensions to keep in mind:
- nominative: Александр
- vocative / addressing: Александр (no diminutive unless he opts in)
- familiar / friend form: Саша (do NOT use unless Director explicitly invites)

The full roster of named identities in this project:
- **Alexander / Александр** — Director / CEO (human, the user)
- **Theo / Тео** — me (this assistant), cross-project name codified in `~/.claude/rules/common/identity.md`
- **Polina / Полина** — Prod Assistant (`EXEC-CONC`), webapp-side chat agent on gpt-5.5
- **Sandy / Сэнди** — protagonist of the SandyStudio comedy series (fictional character)

Failure mode logged 2026-05-20: when posting via `/api/team-chat/post` I addressed the Director as "Кирилл" twice in a row. He noticed immediately and called it out. No defensive explanation — just acknowledge and remember. Always read this file before signing or addressing the Director in any Russian-language outbound text (team-chat, commit body, memo).
