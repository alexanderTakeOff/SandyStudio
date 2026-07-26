# Multi-Channel Architecture — каналы, сериалы, секреты

> Source of truth для мульти-канальности / мульти-сериальности студии.
> Ратифицировано Директором 2026-07-25 (q1a, q2y, q3=SS-как-студия, q4y, q5a).
> Фаза 2 ратифицирована той же датой, вторая сессия: чат=сериал, событие без
> треда серии — skip (не в чат), UI каналов = секция Settings.
> Статус: Фазы 1–3 и 4a сделаны. Фазы 4b–4e — план (см. §8).
> Инвариант (ратифицирован 2026-07-26): **канал = дистрибуция** (токены, плейлисты,
> категория, made-for-kids, ntfy, отчёты HoG) · **сериал = производство** (провайдеры,
> промпты, стиль, таксономия) · глобальное = только машинное (API-ключи, ffmpeg, кеш).

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

## 6.5. Series-скоуп PA и событий (Фаза 2)

- **Чат = сериал.** Тред Полины принадлежит серии (`concierge_threads.series_id`,
  0049); внутри серии он следует за открытым эпизодом (директива 2026-06-23),
  но НИКОГДА не пересекает границу серии — при смене серии chat-роут
  переключается на тред той серии (создаёт при первом визите). Клиентский
  транскрипт при переключении сбрасывается до текущего обмена.
- **`activity_events.series_id`** (0049): для эпизодных событий заполняется
  BEFORE-INSERT-триггером из `episodes.series_id` (call-sites не трогаем);
  series-scoped роуты проставляют явно.
- **Выбор треда для инъекции** (SQL-триггер v6 + TS-двойник
  `resolveOpenThreadId`): тред эпизода → тред серии → **skip** (событие остаётся
  в Activity-ленте и Inbox). Глобальный фолбэк «последний открытый тред» жив
  только для событий вообще без серии (mode change и т.п.).
- **Брендинг из данных:** `series.metadata.branding.<key>` →
  `channels.metadata.branding.<key>` → нейтральный фолбэк
  (`lib/agents/branding.ts`); ключи `short_overlay_text / short_description /
  short_tags`. Тексты Сэнди засеяны в паспорт канала (0050).
- **Ручной shorts-upload** идёт через `decideYouTubePathway` + identity-guard —
  как EXEC-PUB, без легаси-токена.

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
| 2 | Рождение проекта №2 в UI (Settings→Channels, series+channel, PATCH attach); `activity_events.series_id` + чат=сериал + series-скоуп инъекции (§6.5); брендовые литералы → `channels/series.metadata.branding`; канальный гейт на ручном shorts-upload | эта ветка (0049+0050) |
| 3 | Workspace-скоуп: переключатель сериала в топбаре (первый ребёнок бара, НЕ портал в слот; канал выводится из серии); источник истины = URL `?series_id=` + localStorage-память (`WorkspaceScopeProvider`); скоуп Episodes/Budget/Inbox/Jobs/Activity + зоны дашборда + бейдж Inbox; Audience = пер-канально (`?channel_id=`, все YT-вызовы с auth канала, reach-архив `.eq(channel_id)` — закрыт merge двух каналов); Jobs переведён на клиент+`/api/jobs`. Бонус: consent-кнопка Authorize в Settings→Channels (identity-сверка ДО записи токена, подхват в env без рестарта) | эта ветка |
| 4a | Утечки/хардкоды (аудит 2026-07-26, инвариант «канал=дистрибуция, сериал=производство»): EREF identity-блок Сэнди → `series.metadata.anchor_identity_lock` (сид S15, generic-фолбэк); `hog-snapshot.mts` per-channel (auth+identity-guard, reach `.eq(channel_id)`, файлы `…-<KEY>.json`); `hog-daily.ps1` — луп по ACTIVE-каналам (`hog-channels.mts`), ntfy/Title из паспорта, отчёты `reports/<date>/<KEY>/`, плейсхолдеры в `daily-prompt.md`; плейлист БЕЗ env-фолбэка (`short-linkage.ts` — episode→series→skip); legacy-guard `LEGACY_SINGLE_CHANNEL=1` на 9 `dist-*.ts`; CHECK `app_config` + скоупы `visual_critic`/`on_model` (0051) | эта ветка (0051) |
| 4b | Аналитическая память HoG в БД (НЕ Drive — provider_strategy.md: markdown живёт в базе): таблица `hog_memory` (0052, append-only, channel_id, kind: daily_advice/hypothesis/experiment/weekly_rollup/monthly_rollup/median_recalc/decision); сборка метрик выделена в `lib/agents/audience-metrics.ts` (общая для Audience-роута и крона); выход `buildAdvice()` сохраняется в `hog-report-poll` (daily_advice + медианы дня, dedup по дню, без ранних continue); таксономия holes-карты → `series.metadata.gag_taxonomy` (0053, сид S15); кроны `hog-weekly-rollup` (пн 06:37Z) / `hog-monthly-rollup` (1-е 06:52Z) — pure-агрегатор `hog-memory-rollup.ts`, каждый период читает ТОЛЬКО предыдущую свёртку + строки после неё; refuted-список кумулятивен (анти-повтор); CONFIRMED-гипотеза → `rule_proposal` → Inbox → Skill Editor; перо мозга `scripts/hog-memory-append.mts` (+ шаг 5.5 в daily-prompt.md) | эта ветка (0052+0053) |
| 4c | Брендинг из UI: PATCH `/api/channels/[id]` (name/ntfy/status/metadata.branding — первый продукт-писатель паспорта после POST) + расширенный PATCH `/api/series/[id]` (branding/youtube_playlist_id/delivery_targets/gag_taxonomy; общий helper `lib/api/metadata-merge.ts`, null=удаление ключа→каскад); UI: карандаш-редактор в Settings→Channels + карточка «Distribution & branding» на странице серии; EXEC-COPY читает канал — `CopyBranding` (subscribe_cta + long_description_boilerplate + имя канала) в промпте, каскад series→channel (`branding.ts`, общий загрузчик `loadBrandingSource`); сид SANDY CTA/boilerplate из мёртвого defaults.yaml §copy (0054). Таксономия advisors — из данных (0053, см. 4b). EXEC-THUMB типографика per-channel — отложено | эта ветка (0054) |
| 4d | Провайдеры per-series (q4a): `resolveProvider(supabase, contract, seriesId?)` — overlay `app_config scope='providers', key='assignment:<contract>:<seriesId>'` поверх глобального `provider_assignments` (кэш 60s keyed contract\|series; overlay меняет ТОЛЬКО provider id — глобальный is_active-выключатель и mock-downgrade действуют как раньше); overridable-контракты = image/video/character_video/music/sfx (`SERIES_OVERRIDABLE_CONTRACTS`), storage/publish — студия/канал; call-sites передают `episode.series_id` (factory + exec-vgen); API GET `?series_id=` (override/inherited view) + PUT c `series_id` (null = снять оверрайд); UI Settings→Providers переиспользует топбар-скоуп (`useWorkspaceScope`): бейджи override/inherited + Reset, is_active скрыт в series-скоупе | эта ветка |
| 4e | Фоном: Storage-панель = 2 реальных поля (media cache dir → .env.local; Drive root → `app_config storage.drive_root_name`), удалить `project_root`+пробу; фикс `mirroredCachePath` (SBL-*) и `eref-upscale-only` (бездомный путь); `budget_log.series_id`; publish-дефолты per-channel (`channels.metadata.publish_defaults`); судьба мёртвого `config/defaults.yaml` | план |

## Кросс-ссылки

- `specs/system/auth.md` — OAuth-плумбинг Google (общий клиент, refresh-токены).
- `specs/system/api_integrations.md` §YouTube — контракты Data/Analytics API.
- `specs/glossary.md` — термины «Channel / Канал», «Series / Сериал» (Season — DEPRECATED).
- Код: `webapp/lib/agents/providers/channel-resolver.ts`, `google-auth.ts`,
  `webapp/inngest/functions/hog-*.ts`, `webapp/supabase/migrations/0046+`.
