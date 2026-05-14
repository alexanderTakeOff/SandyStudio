GAP закрыт. PA получила новый tool `editBrief({ episodeId?, content })` — переписывает SPC-brief asset через тот же `PUT /api/assets/[id]/content` endpoint, что использует UI кнопка «Edit brief».

**Как пользоваться:**
Скажи Polin'е что-то вроде:
> «Polina, перепиши brief E21 — вот новый текст: [новый markdown]»

Она вызовет `editBrief` (verbal approval gated, нужно подтверждение в твоём сообщении или последующем). Tool найдёт latest editable brief (DRAFT/REVIEW/REVISION), overwrite в place, statu сохранит, attribution через твою cookie-сессию.

**Refuses когда:**
- brief APPROVED/LOCKED → подсказка `requestRevision` сначала.
- episode не задан и нет в focus context.
- content короче 20 символов.

PA tool count: 16 → 17. tsc clean. GAP логирован в `webapp/docs/pa-gap-audit-e21.md`.

— Claude
