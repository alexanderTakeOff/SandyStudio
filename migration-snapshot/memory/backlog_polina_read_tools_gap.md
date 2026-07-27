---
name: backlog_polina_read_tools_gap
description: "Полина умеет ПИСАТЬ (writeStartNotice, updateWorkPlan…), но не умеет НАЙТИ и ПРОЧИТАТЬ ассет-контент (notice, script draft). Обзорные tools не показывают pre-production. Дыра в инструментах, НЕ в модели."
metadata: 
  node_type: memory
  type: project
  originSessionId: 3a3a92ed-4dc1-4559-a22e-802ae01c200e
  modified: 2026-07-23T06:08:34.858Z
---

# Полина: асимметрия инструментов — пишет, но не читает (E31 2026-07-22)

Директор 2026-07-22, разбор переписки Полины (gemini-2.5-flash) по E31: она 4 раза
«запущу Writer?» вместо чтения готового скрипта. **Дело в инструментах, не в модели.**

**Дыра (runtime-verified):**
- `writeStartNotice` есть (`lib/concierge/tools/episode-create.ts:334`) — создать/перезаписать notice. ✓
- **НЕТ** read-инструмента: прочитать `SPC-start_notice`, `SCR-script` draft, любой ассет-контент. ✗
- Обзорные tools неполны: `getStateMatrix` возвращает `shots:[]` и НЕ показывает pre-production
  (writer/script/storyboard) — только shots/music/final_cut. `getRecentActivityEvents` смотрит окно
  **30 минут** → часто пусто → ложный вывод «не написано».
- Итог: Полина слепа на чтение любого контента; `getEpisode` даёт `assets_in_review:1`, но flash это игнорит.

**Фикс (backlog):**
1. `readAssetDraft` / `getAssetContent` tool (notice, script, storyboard — любой ассет по episode+file_type). ОТКРЫТО.
2. `getStateMatrix` расширить: показывать **весь** эпизод — writer/script/storyboard/casting стадии + статусы,
   не только shots. Сейчас `state-matrix.ts` ШОТ-центричный (стр. 30/77/108: «pre-production absent until
   Фаза 1b»); pre-production живёт в `getEpisode.stages[].assets_in_review`, не в матрице. ОТКРЫТО — это
   companion к #3, чтобы хватало ОДНОГО чтения.
3. ✅ DONE (2026-07-23, коммит `4bbfd341`): промпт Полины — failure mode #2 «READ THE FULL STATE FIRST»:
   перед ответом/командой читать getStateMatrix И getEpisode; трактовать `assets_in_review>0` как «output
   существует», не «не написано». Нужен ребилд прод-сборки чтобы вступило.
4. Опц.: поднять модель с gemini free после того как инструменты закрыты (модель вторична). [[backlog_next_run_polina_gemini_free]]

Связано с episode.runtime_target работой (длительность «бездомна», screenwriter хардкодит 15-40) —
разные баги, одна сессия E31.
