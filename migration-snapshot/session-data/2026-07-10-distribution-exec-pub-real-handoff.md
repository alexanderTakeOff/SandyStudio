# Handoff — Distribution / make EXEC-PUB real (2026-07-10)

## ⭐ RESUME: одна задача
Сделать стадию **EXEC-PUB настоящей** (сейчас мок). Директор: **q11a** — вся тройка real,
но **метаданные (EXEC-COPY) и тумбнейлы (EXEC-THUMB) уже готовы/APPROVED** — значит
переписывать надо ТОЛЬКО EXEC-PUB, он потребляет готовые ассеты.

Режим сессии: **===5===**. Ветка/воркдерево: работаем на **master** (git toplevel `C:/SandyStudio`;
воркдерево `.claude/worktrees/e25` = игнорируемая папка, реальные файлы в `C:/SandyStudio/webapp`).

## Что уже сделано (коммит `c4eac71` на master)
- `webapp/lib/agents/providers/youtube.ts` — провайдер: `getMyChannel`, `listAllUploads`, `uploadVideo` (resumable). tsc=0.
- `webapp/lib/agents/providers/google-auth.ts` — кэш по refresh-token + `getYouTubeAccessToken()`.
- `webapp/scripts/youtube-consent.ts` — разовый OAuth (youtube-only scopes).
- `docs/distribution/video-episode-map.md` — реестр видео↔эпизод с живыми YouTube-ID (10/10 на канале).
- Скрэтч (untracked, рабочие): `scripts/dist-youtube-diff.ts`, `dist-youtube-upload.ts`, `dist-youtube-read.ts`.

## Ключевая архитектура (НЕ забыть)
- **Sandy-канал = Brand Account** `UCc2YJlHFclO9BWLEgPlglIg` («Sandy the Hourglass») под аккаунтом `ao@mystaydubai.com`.
- **Два токена в `.env.local`** (не в git): `GOOGLE_REFRESH_TOKEN` = Drive (ao@ user, `drive.file`);
  `YOUTUBE_REFRESH_TOKEN` = Sandy brand (`youtube.upload`+`youtube.readonly`). Бренд-аккаунт БЕЗ Drive —
  поэтому токены раздельные (drive.file «травил» бренд-консент → "service unavailable").
- **Скоупа `youtube.upload` ХВАТАЕТ** для реального publish: `videos.insert` (title/desc/tags) + `thumbnails.set`.
  `force-ssl` нужен ТОЛЬКО чтобы править УЖЕ залитые видео (отдельная задача — см. ниже).

## Стадия существует и вписана, заливка = МОК
- Раннер: `webapp/lib/agents/runner.ts:2940` `case 'EXEC-PUB'` → `mockYouTubeUpload(...)` (хардкод «Mock Episode»).
- Обёртка: `webapp/inngest/functions/exec-pub.ts`.
- Гейт: `webapp/lib/agents/next-events.ts:1503` — finalCut + metadata + thumbnail APPROVED → `sandystudio/exec-pub/publish`.
- Governance: `gate.ts:247` EXEC-PUB = PUBLISH hard limit → нужен `directorConfirm:true` (Mode 1/2/3).
- Идемпотентность: `factory.ts:337` — episode-scoped key гасит тройную заливку.
- Цепочка: `runner.ts:2960` emit `sandystudio/exec-pub/published` → EXEC-ANAL забирает `youtube_video_id`.
- Мок-описание: `mock-providers.ts:166,384`.

## План имплементации (порядок)
1. **`youtube.ts`: добавить `setThumbnail(videoId, bytes)`** (`POST /upload/youtube/v3/thumbnails/set?videoId=`, скоупа хватает).
2. **`runner.ts` EXEC-PUB: заменить мок на реальную заливку.** Загрузить из ассетов эпизода:
   - финальное видео (VID-final / стич-выход) → байты (Drive `downloadFile` по `drive_file_id`, см. `drive.ts`);
   - метаданные (SPC-copy / EXEC-COPY) → title/description/tags;
   - тумбнейл (IMG-thumbnail APPROVED) → байты для `setThumbnail`;
   - `uploadVideo({privacyStatus: 'unlisted'})` → `setThumbnail` → вернуть НАСТОЯЩИЙ `youtube_video_id`.
   - **Мок-фолбэк оставить**, когда нет `YOUTUBE_REFRESH_TOKEN` (replay-pilot) — как у тумбнейла (`runner.ts:2920`).
3. **Идемпотентный ре-аплоад** (включает сценарий Директора «удалил шорт → ретригер E25 → перезалил»):
   перед заливкой — если `episodes.metadata.youtube_video_id` есть, проверить `videos.list?id=` что видео живо;
   нет → перезалить, записать новый id.
4. **Записать `youtube_video_id` в `episodes.metadata`** (реестр в БД — тонкий, без новой таблицы).
5. **Тест на E25** (`SS-S15-E25`, id `eaa23857-6a23-4c8a-832f-80af991bf3eb`): у него thumbnail v02 APPROVED,
   music/refs APPROVED. Проверить наличие VID-final + SPC-copy (были ниже среза вывода). Прогнать publish,
   убедиться что видео появилось на канале с настоящими метаданными+тумбнейлом.
6. tsc + vitest + replay-pilot (ритуал 3). Обновить PLAN.md CURRENT STATE (ритуал 1 — НЕ сделано, сделать!).

## Отдельная задача (потом): 9 «сырых» видео уже на канале
9 из 10 залиты с сырыми заголовками («sandy and smartphone», «Sandy and Car Wash 1 17», «…v03»),
без описаний/тегов/тумбнейлов. Чтобы их ПРАВИТЬ — нужен `force-ssl` (ещё одно разовое пересогласие).
IDs — в `docs/distribution/video-episode-map.md`.

## Решения Директора (locked)
q1 unlisted · q2 грузить только недостающие (без легаси) · q3 API · q6/q7 Sandy=brand под ao@ ·
q11a вся тройка real (но copy/thumb уже готовы → только EXEC-PUB).

## Проверенные факты
- Gym залит нами через API: `https://youtu.be/rzBgn07Ucsg` (unlisted). Остальные 9 уже были (IDs в реестре).
- Канал подтверждён `getMyChannel` → `UCc2YJlHFclO9BWLEgPlglIg` MATCH.
- YouTube Data API v3 включён в GCP проекте `204892276351`, OAuth consent = Production.
