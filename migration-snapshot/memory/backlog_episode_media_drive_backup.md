---
name: backlog_episode_media_drive_backup
description: music/stitch/final/intro персистятся local-only → «прилипают к машине»; провести через persistBinary на Drive + расширить guard. Отложено Директором на ПОСЛЕ прогона E31.
metadata: 
  node_type: memory
  type: project
  originSessionId: 3a3a92ed-4dc1-4559-a22e-802ae01c200e
  modified: 2026-07-22T19:48:37.814Z
---

# Episode-media Drive backup — отложенный слой (после E31)

Директор 2026-07-22: «всё нужно по-хорошему бэкапить на драйв — и музыку, и
финальные mp4… так и прилипли к десктопу». Порядок: **в план, после прогона E31**
(«music/stitch в план после прогона 31») — не трогать критичный pipeline прямо
перед платным смоуком.

**Причина (runtime-verified):** ряд persist-путей пишут ТОЛЬКО local-cache
(`/api/media/<local>`), Drive-upload не вызывают:
- `lib/api/ingest-music.ts:127` — **явно** `drive_file_id: null` (комментарий признаёт).
- `app/api/assets/[id]/upload-music/route.ts`, `upload-music-direct`, Director-`upload/route.ts` — local-only.
- stitch финального mp4 (VID-final_cut) — проверить `lib/agents/providers/ffmpeg-stitch.ts` / runner.

`audit-media-backup.ts` (постоянный инструмент, `webapp/scripts/`) нашёл **28**
финализированных медиа с `drive_file_id=NULL` (в осн. music E01-E17 + thumbnails +
video_intro) — **все без локальных байт**, невосстановимы (уплыли при переезде на ноут).

**intro/outro:** outro уже на Drive (`bible/video`); **intro потерян → регенерить**
(brand-bumper recipe `gen-intro-action.ts`), затем на Drive рядом с outro. Series
bumpers = SBL series-scoped → `bible/video`, НЕ эпизодные папки. Финалки/музыка эпизода
→ `<E##>/video` · `<E##>/audio` («как заведено» = layout `persistBinary` уже умеет).

**План слоя:** (1) провести перечисленные пути через `persistBinary` (Drive) →
впредь всё получает `drive_file_id`; (2) backfill живых локальных байт; (3) регенерация
intro → Drive; (4) расширить `lib/api/media-backup-guard.ts` с SBL-only на AUD + VID-final
(ТОЛЬКО после того как persist заливает — иначе ложные блокировки pipeline).

**Уже сделано (2026-07-22, отдельно):** Bible-canon guard (`media-backup-guard.ts`,
SBL image/video, в `approve` + `bible/lock`) + `bumpPreviewFreshness` (`copy-image-from`) +
Пиппи→Metelka cleanup + audit-tool. tsc 0, 11/11 тестов. См. [[anti_additivity_principle]].
