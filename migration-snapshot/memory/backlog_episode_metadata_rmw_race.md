---
name: backlog_episode_metadata_rmw_race
description: episodes.metadata read-modify-write race across ~8 routes; fail-safe for reconciler arm via double-gate but worth atomic jsonb merge
metadata: 
  node_type: memory
  type: project
  originSessionId: 25a4dc36-f68e-4054-b71f-c3a380c7cb48
---

**Что:** ~8 роутов пишут `episodes.metadata` паттерном SELECT → spread `{...prev, key}` → UPDATE
(eref/approve-pilots, shot-exclusion, animatic-timing, upload-music, governance-mode switch,
episode materialize и др.). Конкурентная запись между SELECT и UPDATE молча теряется (lost update).

**Где всплыло:** code-review Phase 2b (2026-07-15) на `governance-mode/route.ts` — mode-switch
пишет `metadata.reconciler_armed` тем же паттерном.

**Почему НЕ блокер для reconciler-arm:** двойной гейт `isReconcilerArmed` = `reconciler_armed===true`
**И** `armForMode(governance_mode∈{2,3})`. Колонка `governance_mode` — СКАЛЯР, её пишет только
Director-only mode-switch, metadata-писатели её не трогают, а обе записи в ОДНОМ атомарном
`.update({ governance_mode, metadata })`. Итог: даже если `reconciler_armed` проиграет гонку и
откатится, `governance_mode` (неубиваемая колонка) доминирует → худший исход = «взвёл, флаг сбросился →
дирижёр остался ВЫКЛ» = **fail-safe** направление, никогда не «auto-advance без воли Директора».

**Why:** lost-update на safety-critical ключе (взвод платного авто-аппрува) опаснее прочих metadata-гонок,
но здесь смягчён архитектурой. Сист. корень — паттерн read-spread-write вместо атомарного merge.

**How to apply:** один общий хелпер атомарного jsonb-merge — Postgres RPC или
`UPDATE ... SET metadata = metadata || jsonb_build_object(k, v)` одним стейтментом — и перевести все ~8
сайтов на него (вычитание дублирующегося паттерна, не добавление). Отдельный слайс, не в Phase 2b.
Связано с [[anti_additivity_principle]], [[autonomous_factory_architecture_doctrine]].
