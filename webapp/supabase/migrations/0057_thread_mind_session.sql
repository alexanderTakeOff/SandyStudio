-- 0057_thread_mind_session.sql
-- Сессия ума переезжает с ЭПИЗОДА на ТРЕД.
--
-- Мост (scripts/mind-bridge.ts) держал карту headless-сессии Полины в
-- `episodes.metadata.mind_session`. Это связывало ум с одной сущностью: студийные
-- и сериальные разговоры вести было НЕГДЕ — мост их пропускал
-- ('skipped-no-episode'), а чат вне страницы эпизода падал в снесённый роут.
--
-- Тред уже несёт нужную привязку: `concierge_threads.episode_id` / `series_id`
-- (0049), а `resolveOpenThreadId` уже каскадит эпизод → сериал → студия. Поэтому
-- карта сессии кладётся на ТРЕД: одно место вместо трёх (эпизод + будущий сериал
-- + «где-то» для студии), и сессия автоматически следует за сущностью.
--
-- Директор: возвращаясь на сущность, он обязан попадать в ТОТ ЖЕ разговор —
-- поэтому живая карта переносится, а не бросается.

ALTER TABLE public.concierge_threads
  ADD COLUMN IF NOT EXISTS mind_session jsonb;

COMMENT ON COLUMN public.concierge_threads.mind_session IS
  'Карта headless-сессии Полины для этого треда: session_id, previous_session_id, busy{pid,turn_ids,started_at}, context_tokens, context_limit. Пишет и читает только мост.';

-- Перенос живых карт: у каждого эпизода с mind_session берём его САМЫЙ СВЕЖИЙ
-- открытый тред. Эпизоды без открытого треда пропускаются — их разговор всё
-- равно не отобразить, а новая сущность стартует чистой сессией.
UPDATE public.concierge_threads t
SET mind_session = e.metadata -> 'mind_session'
FROM public.episodes e
WHERE t.episode_id = e.id
  AND e.metadata ? 'mind_session'
  AND t.ended_at IS NULL
  AND t.id = (
    SELECT t2.id FROM public.concierge_threads t2
    WHERE t2.episode_id = e.id AND t2.ended_at IS NULL
    ORDER BY t2.started_at DESC
    LIMIT 1
  );

-- Старое место больше не читается — снимаем ключ, чтобы не осталось двух правд
-- об одной сессии (ровно та болезнь, которую чинит вся эта работа).
UPDATE public.episodes
SET metadata = metadata - 'mind_session'
WHERE metadata ? 'mind_session';
