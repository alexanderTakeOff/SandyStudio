---
name: backlog_per_shot_video_eligibility
description: "Per-shot video should unlock the moment a shot has a usable visual (ref image OR anchors), provider mode chosen by availability — NOT gated on whole-episode refs. Capability mostly exists (q21/seedance/anchor-mode); blocker = episode-wide ANIMATIC_APPROVED gate."
metadata: 
  node_type: memory
  type: project
  originSessionId: 3a812bff-e255-4d62-ad4e-00e0ef9cb60b
---

Director 2026-06-20: неправильно, что видео-генерацию шота можно запустить только когда ВСЕ референсы эпизода готовы. Пока реф-артист делает рефы, Director в простое — хочет уже из первых готовых кадров делать видео и смотреть как получается. Правильнее (Director: «важно!»): уметь делать видео из ОДНОГО кадра или якорей **по факту наличия**, выбирая режим провайдера; разрешать видео как только у шота появился реф или якоря (в завис. от governance-режима). Создание референсов = производство, сам процесс не трогаем.

**В основном СУБТРАКТИВНО — capability уже есть:**
- per-shot readiness: `validateShotReadyForGeneration` (q21 preflight, single source of truth).
- видео из 1 картинки: seedance img2vid ref-only (`seedance-standard`, end_image=null).
- видео из якорей: anchor-mode (two-anchor / ref-only по orbit-доктрине [[anchor_mode_orbit_ref_only]]).
- провайдер по факту наличия: режим выбирается тем, что есть (1 ref→img2vid; start/end anchors→two-anchor).

**Блокер = ЭПИЗОД-широкий гейт, не per-shot.** `EpisodeTimelineSection` требует APPROVED `VID-animatic`; `EPISODE_TRANSITIONS` ANIMATIC_APPROVED→GENERATION — хард-гейт; shot_list-билдеры бросают (`assertCompleteShotList`), пока не у ВСЕХ кадров approved-реф. Фикс субтрактивный: снять эпизод-широкое условие, пустить per-shot readiness драйвить eligibility.

**Тонкость (НЕ конфликтовать!):** аниматик остаётся КОНТРАКТОМ финальной сборки — несёт timing/director_overrides/audio, которые `EXEC-STITCH` запекает в финальный кат. Поэтому: РАННЕЕ per-shot видео = превью/эксплорация (смотреть как получается), а ФИНАЛ всё равно собирается из залоченного аниматика. Не путать превью-видео с гейтом финальной сборки.

**Why:** продукт — видеошоты; их естественная единица готовности — кадр, не эпизод. Эпизод-широкий гейт держит Director в простое и дублирует per-shot готовность, которая уже вычисляется.

**How to apply:** часть [[backlog_shot_centric_paradigm]] + [[backlog_animatic_dedup_ref_vs_video]], после прогона. Slice: (1) per-shot video-eligible как только есть ref/anchor (provider mode by availability, governance-mode gates autonomy); (2) timeline рендерит из storyboard shot_list (placeholder `asset_id:null`), не ждёт approved VID-animatic; (3) аниматик-контракт сохраняем для финальной сборки.
