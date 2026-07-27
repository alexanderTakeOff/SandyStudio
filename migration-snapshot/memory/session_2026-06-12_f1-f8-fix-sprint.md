---
name: session-2026-06-12-f1-f8-fix-sprint
description: F1-F8 fix-спринт после E07 smoke — все дефекты закрыты в корне за одну сессию; 7 коммитов local-unpushed; среда ревертнута к Mode 1-3
metadata: 
  node_type: memory
  type: project
  originSessionId: 933fcbb8-b0a4-4eed-b4c1-4b543c51d981
---

# Session 2026-06-12 — F1-F8 fix-спринт (q10a)

## Что легло (7 коммитов, master local-unpushed `9685845…4e6838a`)

1. **F1 `9685845` single-dispatch**: SREV убран из SCR-ветки роутера (critic chain владеет, все режимы); SPC-ref_plan/SPC-shot_plan ветки = только Mode 1-3 (AUTOTEST стрелял ДО критика + дублировал post-critic fire); **новая ветка REV-shot_plan PASS** (отсутствовавшее зеркало eref-стороны = Mode-4 корень TD-76); идемпотентность по планам читает ОБЕ формы metadata (provenance.plan_asset_id И top-level — была слепа к VID-shot, отсюда SH03 +$1.21); runner-side дедуп VGEN до платного вызова, `regenerate:true` для осознанных регенов (trigger route ставит).
2. **F2 `418b275` newest-wins**: `findApprovedAsset` 10 копий → 1 (`lib/agents/upstream.ts`); 4 копии были несортированным `.find()` — корень зеркального дедлока (Designer STB v1 / Artist v2). loadAgentInputs сортирует version desc.
3. **F3 `975f768` TD-76 КОРЕНЬ** (диагноз по живой БД E07: `updated_at == created_at` у застрявших планов при COMPLETED-джобах): factory флипал статус **отдельным unchecked supabase update** → тихий фейл → DRAFT навсегда. Статус теперь едет В insert (`saveAgentOutput initialStatus`); legacy-флип остался только для skip_save (CREAD/EREF/THUMB, теперь error-checked); applyCriticVerdict поднимает DRAFT→REVIEW на чистом вердикте (не понижает APPROVED).
4. **F4+F5 `e105f90`**: agent_failed — свой debounce-bucket (`:fail`) + обход anti-cascade guard; watchdog: второй скоуп — Mode-4 эпизоды idle ≥6мин при активности ≤2ч; BEHAVIOR_CONTRACT 8a-8c (объявленное доделывается первым действием следующего хода / verify real results / молчащий агент >3мин = инцидент); bold auto-react cap 3→5; concierge.md зеркалит.
5. **F6 `6f848f6`**: extraction чанками ≤12 шотов, sequential, словарь entity-id переносится между чанками (иначе фантомные entity-from-nowhere на границах).
6. **F7 `e4dcf77`**: `CHECKERS_FREE_TIER` (default ON, все режимы; SREV/CREAD/WCHK/VPREV/EPREV/extraction/style-check → gemini free; откат одним env); фолбэк на Anthropic при отсутствии GEMINI_API_KEY (громкий warn); честный `result.model` в 12 description-сайтах.
7. **F8 реверты СДЕЛАНЫ**: TEXT_LLM_DEBUG_TIER=false (env), eref_provider=openai-edits-multi (app_config), E07 → mode 1, дубль VID SH03 v2 → INVALIDATED, тред `0d5de76a` отвязан от episode_id.

## Verify
tsc·0 / **824** (+37 за спринт) / replay-pilot 30 — после каждого F-блока.

## Открыто / next
- **Push 7 коммитов** (авторизация Director; утренние 5 запушены `c6fc100..2148580`).
- **Anthropic console top-up** (Director) — блокер Mode 1-3 креаторов.
- **Перезапуск prod-сервера** (крутится build 2148580 со старым env) — предложить, не делать самому.
- Mode-4 регрессия (~$0): ожидание — ноль дублей версий, планы сходятся без unstick, ровно один SREV/STB/WCHK.
- **D1-D4 не отвечены** (план §F8): animatic-гейт vs частичные прогоны · 2-сек гэги vs 3s минимум · полнота маскировки «Александр» · gemini style drift.
- Бэклог-находка: `naming-validator.cjs` блокирует записи в dev-каталог `webapp/scripts/` (матчит любой сегмент `scripts`) — false positive.
- Замечание для D-обсуждения: на eref-стороне Artist стреляет на EPREV PASS, CREAD eref-phase ревьюит ПАРАЛЛЕЛЬНО генерации (advisory) — гейт-порядок не идеален, но без дублей; vanim-сторона теперь симметрична.

Связано: [[backlog_td61_td62_pipeline_blockers]], [[polina_resistance_log_e07_smoke]], [[anti_additivity_principle]].
