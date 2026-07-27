---
name: session-2026-06-11-wchk-state-ledger-sprint
description: WCHK strengthening shipped — state-ledger (Motor 1) + inventory-cascade (Motor 2) + CREAD double-fire killed at root; commit 4ff5262 local-unpushed; next = Director push + clean E06 re-run with CONTINUITY_LEDGER_ENABLED
metadata: 
  node_type: memory
  type: project
  originSessionId: 2609dad1-6447-43a0-ae0c-51149f556210
---

# Session 2026-06-11 — WCHK strengthening (state-ledger sprint)

## What landed (commit `4ff5262`, master, LOCAL — push needs Director authorization)

1. **CREAD double-fire убит в корне** — это был не race, а детерминированный дубль: в Mode 4 factory гонит `computeNextEvents` по auto-APPROVED ассету ДО отправки собственного critic-chain события → hasJob не видит job → второй fire. **Доктрина: критиков запускает ТОЛЬКО critic chain** (spec.nextEvent продьюсера, все режимы); из `computeNextEvents` удалены STB→CREAD и REV-readability PASS→WCHK пуши. Плюс мина: per-shot eref/vanim `REV-readability` строки (T1) попадали в ту же ветку — AUTOTEST REVISE по shot-плану перезапустил бы ВСЮ раскадровку; теперь phase-guard.
2. **Motor 1 — state-ledger (CHK-W08)**: `webapp/lib/agents/state-ledger.ts` чистый детерминированный судья над `ShotStateDelta[]` из Haiku-extraction (`runners/continuity-extract.ts`, claude-haiku-4-5). 4 правила: STATE_REVERT_NO_CAUSE / REPEAT_FIRST_DISCOVERY / STATE_CHANGE_NO_CAUSE / ENTITY_FROM_NOWHERE. Extraction-fail surfaced (`ledger.status=EXTRACTION_FAILED`), не глушится, membership-вердикт не аннулирует.
3. **CHK-W05** длительности (1.5–8.0s, детерминир.) + **W02/W07** advisory-метки (`lighting_canon`/`appearance_canon`) в Sonnet per_shot. Все 8 проверок спеки живые (W04/W06 — data-gated).
4. **Motor 2 — inventory-cascade (CHK-W04)**: `lib/agents/inventory-cascade.ts`, props vs union(Bible `SBL-object_*` ∪ бриф `prop_delta` [q3a]). Переиспользует ТЕ ЖЕ extraction-дельты (без второго LLM). Data-gated: пустой union → NO_INVENTORY, проверка инертна — второй флаг не нужен. UNRESOLVED_PROP всегда MINOR.
5. **q2 comedy-soft вердикт**: детерминированный слой никогда не даёт FAIL; PASS→REVISE только при MAJOR-пуле ≥3 (леджер + длительности + canon-конфликты).
6. Контракт **continuity_check@v2** (+чинит давний рассинхрон max_tokens 3000-yaml/6000-code); `world_checker.md` v0.2 с честной runtime-картой кто-что исполняет (train-personnel).

## Verify
tsc·0 / **vitest 787/787** (+23 новых: state-ledger 11, ledger-helpers 4, inventory 7, next-events ±) / **replay-pilot 30/30**. Флаг off = байт-идентичный legacy.

## Ключевые решения
- Один флаг `CONTINUITY_LEDGER_ENABLED` на оба мотора; Motor 2 самоактивируется данными.
- Политика пула: `reviseImpactForMajorPool(count)` в state-ledger.ts, порог `LEDGER_REVISE_MAJOR_THRESHOLD=3`.
- runner.ts менять не пришлось — body уже проходит в metadata насквозь (планер предлагал лишнее).
- Слабое звено Motor 1 — нормализация имён сущностей (lamp_cord vs cord рвёт timeline); промпт пиннит canonical naming, остаточные false-negatives приняты честно.

## Next / открыто
- **Director: push master** (4ff5262 поверх c6fc100).
- **Чистый E06 re-run** (предложен, не запущен): rebuild prod-сервера с новым кодом, `CONTINUITY_LEDGER_ENABLED=true` в webapp/.env.local, E06 unfreeze → mode 4, ceiling поднять, C1_STOP_BEFORE_EREF on. Ожидание: CREAD fires ОДИН раз → converge (PASS или HALT-at-cap=2) → WCHK с ledger-отчётом. E06 id `ab0f3469-c845-4f19-896f-f192be4ac84f`.
- Data-work Motor 2: наполнить Bible `SBL-object_*` (спальня Sandy: bed/vanity/bookshelf/drawer/rug/lamp + aliases/geometry в metadata) — включит CHK-W04/W06 по-настоящему.
- Незакрытое из бэклога: q45 wan aspect, q40 cap→Episode Settings, [[backlog_td61_td62_pipeline_blockers]].
