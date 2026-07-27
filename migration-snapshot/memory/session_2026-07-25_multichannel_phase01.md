---
name: session-2026-07-25-multichannel-phase01
description: "Мульти-канальность Фазы 0-1 в проде — channels-паспорт, per-channel токены, HoG channel_id; Фаза 2 next"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3817dfd4-6c6f-43dd-9847-517b234d91de
  modified: 2026-07-25T14:33:59.285Z
---

**2026-07-25, Тео.** Спека `specs/system/multi-channel.md` + Фазы 0–1 смерджены в master (`373f69d9`) и задеплоены.

- Иерархия: `channels 1:N series 1:N episodes`; `series.channel_id` **nullable** — сериал живёт без канала; на publish/analytics-гейте без канала **HALT**, тихого фолбэка на глобальный токен нет.
- Миграции 0046–0048 в проде: `channels` (сид Sandy `UCc2…`, key `SANDY`), 3 серии привязаны, `channel_id` NOT NULL в HoG-таблицах (бэкфилл 7284+93), дропнуты мёртвые `series_state`/`approval_authority`.
- Токены: `YOUTUBE_REFRESH_TOKEN_<KEY>` (SANDY читает легаси-имя); провижн `youtube-consent.ts --key <KEY>`. Канал = токен, `mine=true` сохранён; `assertChannelIdentity` — сверочный guard.
- **Директорское ruling:** `SS` = префикс СТУДИИ (рудимент), каждый `SS-SNN` = отдельный СЕРИАЛ; уровня «сезон» НЕ существует (glossary: Season DEPRECATED). Naming-стек не тронут; новый сериал = `SS-S16`.
- Новый канал за 3 шага: бренд-аккаунт → consent `--key` → INSERT в `channels` + привязка серии.

**Грабли:** Supabase MCP не подхватывает грант среди сессии (нужен `npx supabase login` в живом терминале Директора — headless non-TTY невозможен); worktree ставится только `npm install --legacy-peer-deps` (drei/fiber ERESOLVE).

**Next:** Фаза 2 — `activity_events.series_id` + фикс PA-фолбэка (утечка событий серии B в тред серии A), UI рождения канала+серии, бренд-литералы «SANDY the HOURGLASS» → metadata. Роадмап: multi-channel.md §8. Резюме: `session-data/2026-07-25-multichannel-phase01-session.tmp`. [[autonomous_factory_architecture_doctrine]] [[hog_daily_report_loop]]
