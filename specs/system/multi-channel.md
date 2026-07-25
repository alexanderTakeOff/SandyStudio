# Multi-Channel Architecture — каналы, сериалы, секреты

> Source of truth для мульти-канальности / мульти-сериальности студии.
> Ратифицировано Директором 2026-07-25 (q1a, q2y, q3=SS-как-студия, q4y, q5a).
> Статус: Фаза 1 (канал как сущность). Фазы 2–4 — backlog (см. §8).

---

## 1. Иерархия

```
channels  1:N  series  1:N  episodes
```

- **`channels`** — паспорт YouTube-канала (таблица Supabase, миграция 0046).
- **`series`** — производственная единица (уже существовала). `series.channel_id`
  — **nullable по дизайну**: сериал рождается и живёт без канала.
- **Канал нужен только трём потребителям:** EXEC-PUB (публикация), EXEC-ANAL
  (аналитика), HoG-кроны (`hog-channel-snapshot`, `hog-report-poll`).
  Производственный пайплайн (brief → script → storyboard → render) канала
  **не знает** и знать не должен.

## 2. Паспорт канала (`channels`)

| Поле | Семантика |
|---|---|
| `name` | Человекочитаемое имя («Sandy the Hourglass») |
| `youtube_channel_id` | UC-id канала. **Сверочный guard, НЕ источник авторизации** (§5) |
| `credential_key` | Имя-ключ секрета: `YOUTUBE_REFRESH_TOKEN_<KEY>` в env. `^[A-Z][A-Z0-9_]*$` |
| `ntfy_topic` | Топик push-уведомлений HoG-отчётов этого канала |
| `status` | `ACTIVE / PAUSED / ARCHIVED` — кроны обходят только ACTIVE |
| `metadata` | jsonb-расширение (брендовые дефолты, оверлеи и т.п. — Фаза 2) |

## 3. Модель секретов

- **Канал определяется токеном.** Все запросы YouTube идут `mine=true` /
  `channel==MINE` — это сохраняется. Токен = identity.
- Секреты живут **только в env** (`webapp/.env.local`), в БД — лишь имя ключа:
  `YOUTUBE_REFRESH_TOKEN_<CREDENTIAL_KEY>` (например `YOUTUBE_REFRESH_TOKEN_SANDY`).
- **Переходное правило:** голый легаси `YOUTUBE_REFRESH_TOKEN` (без суффикса)
  трактуется как токен канала с `credential_key='SANDY'`.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — общие на все каналы (один
  GCP OAuth-клиент). `YOUTUBE_CLIENT_ID/SECRET` — мёртвые имена, удалены (Фаза 0).
- Провижн нового токена: `npx tsx webapp/scripts/youtube-consent.ts --key <KEY>`
  → выбрать бренд-аккаунт нового канала → токен пишется под именованный ключ,
  чужие ключи не перезаписываются.

## 4. Каскад резолвинга канала

`episodeId → episodes.series_id → series.channel_id → channels-строка`
(модуль `webapp/lib/agents/providers/channel-resolver.ts`).

- Серия без канала на гейте публикации/аналитики → **fail-fast HALT**
  (`ChannelResolutionError`). Тихий фолбэк на глобальный env-токен **запрещён** —
  именно он молча заливал бы новый сериал на канал Сэнди.
- Канал есть, но env под его `credential_key` пуст → HALT.
- Нет вообще никаких YT-кредов в env → **mock-путь** (dev / replay-pilot /
  тесты работают без изменений).
- Плейлист остаётся series-level: `resolveSeriesPlaylistId()`
  (`episode.metadata → series.metadata → env`) — не менялся.

## 5. Закон сверки identity

Перед реальной публикацией и на каждом снапшот-тике:
`getMyChannel(token).id === channels.youtube_channel_id`, иначе HALT с обоими id.
Защита от человеческой ошибки на consent («токен от чужого канала»).

## 6. HoG — пер-канальная семантика

- `channel_snapshots` и `channel_reports` несут `channel_id` (0046, бэкфилл
  истории на Sandy; NOT NULL добивается миграцией 0048 после деплоя кода).
- Дедуп отчётов: `UNIQUE (channel_id, report_type, report_id)`.
- Кроны итерируют по `channels WHERE status='ACTIVE'`; **ошибка одного канала
  не гасит съём остальных** (пер-канальные step.run, сводка ok/failed, throw
  в конце). Закон «gap ≠ ноль» действует пер-канально.
- TODO (вне критического пути): `scripts/hog-daily.ps1` читает ntfy-топик из
  паспорта канала, а не из хардкода; дневной луп — один прогон на канал.

## 7. Что НЕ меняется

- **Naming:** `SS` — рудиментарный префикс студии, НЕ сериала и НЕ канала.
  Новый сериал = `SS-S16-...`. CHECK-констрейнт, naming-хуки, zod — не трогаем.
  Уровня «сезон» не существует: каждый `SS-SXX` — отдельный сериал (glossary).
- **Inngest event payloads:** все события несут только `episodeId`; канал
  всегда резолвится из БД по каскаду §4.
- `resolveSeriesPlaylistId` и series-level playlist.

## 8. Фазы (статус)

| Фаза | Содержание | Статус |
|---|---|---|
| 0 | Вычитание: легаси-таблицы, мёртвые env, `/^SS-/` фолбэки, лексика Season→Series | эта ветка |
| 1 | `channels` + резолвер + гейты + HoG пер-канально + consent `--key` | эта ветка |
| 2 | Рождение проекта №2 в UI; `activity_events.series_id` + фикс PA-фолбэка; брендовые литералы («SANDY the HOURGLASS» в shorts-роуте, runner, AssetPreview) → `series/channels.metadata` | backlog |
| 3 | Workspace: глобальный переключатель канал/сериал в `#studio-topbar-slot`; скоуп Episodes/Budget/Audience/Inbox/Jobs/Activity | backlog |
| 4 | Per-series провайдеры/промпты через `app_config` суффикс-конвенцию — по реальной нужде (YAGNI) | backlog |

## Кросс-ссылки

- `specs/system/auth.md` — OAuth-плумбинг Google (общий клиент, refresh-токены).
- `specs/system/api_integrations.md` §YouTube — контракты Data/Analytics API.
- `specs/glossary.md` — термины «Channel / Канал», «Series / Сериал» (Season — DEPRECATED).
- Код: `webapp/lib/agents/providers/channel-resolver.ts`, `google-auth.ts`,
  `webapp/inngest/functions/hog-*.ts`, `webapp/supabase/migrations/0046+`.
