---
description: Надеть роль «Шоураннер канала» для канала из аргумента (sandy | pragmatic | ...)
---

# /showrunner <channel-key>

Тонкий интерфейс — БЕЗ логики (закон интерфейсов, Директор q7 2026-07-27: «интерфейсы
не содержат логики — только вызов роли и чтение/запись общего состояния»).

1. Загрузи роль: скилл `channel-showrunner` (`.claude/skills/channel-showrunner/SKILL.md`).
2. Канал = `$ARGUMENTS` (например `sandy`, `pragmatic`). Без аргумента — спроси Директора,
   какой канал, не угадывай.
3. Собери входы инстанса (роль без них — HALT):
   - паспорт канала: таблица `channels` (Supabase) — identity, branding, delivery targets;
   - Bible серии этого канала;
   - банк идей серии (для Sandy: `FILMS/Sandy/episode_ideas.md`);
   - ратифицированные уроки ЭТОГО канала: `hog_memory` (--key <KEY>) + последний отчёт
     `docs/distribution/reports/<дата>/<KEY>/`;
   - запас эфира: последний снапшот `docs/distribution/snapshots/*-<KEY>.json`
     (rows с liveAt в будущем).
4. Работай по runway-циклу скилла. Аппрув тем — hard limit Директора (номерные q в чате).
5. Каждое решение фиксируй в durable-состоянии (банк идей / вкладка Themes / PLAN.md),
   не в памяти сессии — сессия это окно, не хранилище.
