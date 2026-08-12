-- 0058_thread_mind_session_closed.sql
-- Добивка к 0057: перенос карты сессии для ЗАКРЫТЫХ тредов.
--
-- Дефект 0057, пойманный сразу после применения: перенос шёл только по тредам с
-- `ended_at IS NULL`. Тред живого эпизода E06 был закрыт по TTL
-- (`closeStaleConciergeThreads`) — карта не переехала, а ключ у эпизода тем же
-- скриптом сняли, и сессия Полины по эпизоду потерялась. В нашей базе она
-- восстановлена вручную (session_id цел в metadata её же реплик), но текст
-- миграций — append-only, поэтому дыру закрывает СЛЕДУЮЩАЯ миграция, а не правка
-- предыдущей: на чистой базе 0057 и 0058 отработают парой и покроют все треды.
--
-- Урок в одну строку: у переноса «живых» данных условие живости — уже фильтр,
-- и он выкидывает ровно то, что кажется неважным до момента, когда понадобится.

UPDATE public.concierge_threads t
SET mind_session = e.metadata -> 'mind_session'
FROM public.episodes e
WHERE t.episode_id = e.id
  AND e.metadata ? 'mind_session'
  AND t.mind_session IS NULL
  AND t.id = (
    SELECT t2.id FROM public.concierge_threads t2
    WHERE t2.episode_id = e.id
    ORDER BY t2.started_at DESC
    LIMIT 1
  );

UPDATE public.episodes
SET metadata = metadata - 'mind_session'
WHERE metadata ? 'mind_session';
