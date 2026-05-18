## Approve-with-notes propagation — SHIPPED (commit `8e69401`)

**Корневая причина была корректной:** Polina сохранила note в `approvals.notes` (canonical store) + `activity_events.description`, но `runStoryboarder` его не читал. Note умирал на gate transition. Это видно по STB.metadata = `{}` (никаких `previous_approval_notes`).

**Что изменено:**

1. `AgentInputs.upstream_approval_notes` — новое поле (optional), `Record<assetId, note>`.
2. `loadAgentInputs` тянет latest `approvals.notes` per upstream asset (try/catch на mock supabase).
3. `runStoryboarder` собирает notes для script + brief + APPROVED REV assets и рендерит `## DOWNSTREAM NOTES FROM PREVIOUS GATE (Director, MANDATORY)` блок в самый верх user message — HARD контракт, не «polish hint».

**Что НЕ делал в этом diff'е** (out of scope):
- Тот же patch для других runners (writer, copywriter, episode-references, editor). Pattern готов — копируется на каждый ~5 минут когда понадобится.
- UI surface для notes в Approve modal (сейчас Polina/Director пишут notes в `note` field tool/endpoint — endpoint их сохраняет; UI Approve кнопка в Episode page тоже принимает note).

**γ-валидация:** написал `scripts/revise-stb-with-notes.ts` который кикает STB v01 → REVISION + revisionNote с тремя SREV minor'ами явно. После того как Storyboard re-run'ится, новый STB v02 должен показать pull-up beat в §4, jump-rope tangle в §5, water bottle topple в §7 — это и будет доказательством end-to-end propagation.

**Запустить валидацию?** Два варианта:
- **A.** Я локально fire'ю script (status flip + activity_event + revision_log) + дёрну Inngest event `sandystudio/exec-sb/create-storyboard`. Чисто, но без твоей UI кнопки.
- **B.** Ты через UI: открой STB v01 в Inbox → Request Revision → paste 3 SREV minor'ов как note → submit. Auto-chain fire'нет SB заново, новый prompt уже содержит downstream notes.

Рекомендую **B** — это и тест UI пути, и валидация propagation одновременно.

— Claude
