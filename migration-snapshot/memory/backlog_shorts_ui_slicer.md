---
name: backlog_shorts_ui_slicer
description: "Deferred UI \"video to shorts\" slicer in Distribution stage — start/end, overlay, privacy, preview-picker; reuses makeShort helper"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4f93edba-f18a-4e7b-9d8f-2085df1a672f
---

Отложенный (2026-07-12) UI-слайсер «video to shorts» в стадии Distribution. Директор выбрал
сначала батч-скрипт ([[backlog_video_direct_from_canon]] родственно), UI — потом.

**Что строить:** в стадии `publisher`/Distribution — кнопка «video to shorts» с контролами:
`start time`, `end time`, `overlay on/off`, `privacy [private/unlisted/published]`, и preview-part
для выбора версии final-cut mp4 перед нарезкой.

**Готовое к переиспользованию (разведка 2026-07-12):**
- Version-picker: `CandidatesStrip` (`webapp/components/assets/EREFv2Sections.tsx:367`) +
  `PilotApproveButtons` (`webapp/components/preview/AssetPreview.tsx:673`) — уже подключены к
  VID-final_cut в `AssetPreview.tsx:485-530`.
- Контролы: `ProviderControlPanel` (`webapp/components/vgen/ProviderControlPanel.tsx`) — уже есть
  `9:16` аспект и `range`-слайдер; `fields`-проп рендерит подмножество.
- Privacy-плумбинг уже есть без UI: `PrivacyStatus` (`youtube.ts:188`), читается из
  `episodes.metadata.youtube_privacy` (`runner.ts:3054`), PATCH через `EpisodeSettingsCard`.
- ffmpeg-логика НЕ дублируется: хелпер **`makeShort()`** (`webapp/lib/agents/providers/ffmpeg-shorts.ts`,
  создан для батча) уже принимает `{startSec,endSec,overlayText,mode}` — UI дёргает тот же код.
- Backend-паттерн: кнопка → `POST /api/assets/[id]/...` → `computeNextEvents` → `inngest.send`.

**Почему отложено:** upload напрямую работает (`uploadVideo` доказан на E25), поэтому батч
(`scripts/dist-shorts.ts`) наполняет канал сразу; UI — ручной контроль на будущее, ~день работы.

**Watch-out:** scope `youtube.upload` НЕ умеет удалять → UI должен дефолтить в `unlisted`,
public — осознанным кликом.
