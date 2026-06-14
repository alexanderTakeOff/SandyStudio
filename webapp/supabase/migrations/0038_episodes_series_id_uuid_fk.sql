-- 0038: normalize episodes.series_id from series CODE → series UUID + FK
--
-- Root fix for the code-vs-UUID identity polymorphism that caused recurring
-- "small things break" bugs:
--   * episodes.series_id stored the CODE ("SS-S15") while assets store the UUID,
--     forcing seriesIdForEpisode() into a 3-branch resolver and every series
--     query to translate code↔uuid.
--   * loadSeriesContext()/build-context genre lookup did series.eq('id', code)
--     → silently returned null (broken thumbnails + always-null genre).
--
-- Pre-verified (2026-06-14): all 11 existing episodes resolve cleanly to a
-- series row; 0 unresolved. Backfill is deterministic.

begin;

-- 1. Backfill code-form → UUID (string-into-text for now).
update public.episodes e
set series_id = s.id::text
from public.series s
where e.series_id = s.code;

-- 2. Guard: abort if any row is still non-UUID before the type change.
do $$
declare bad int;
begin
  select count(*) into bad
  from public.episodes
  where series_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if bad > 0 then
    raise exception 'episodes.series_id still has % non-UUID row(s) — aborting migration', bad;
  end if;
end $$;

-- 3. text → uuid.
alter table public.episodes
  alter column series_id type uuid using series_id::uuid;

-- 4. FK to series(id). Default RESTRICT — never orphan an episode.
alter table public.episodes
  add constraint episodes_series_id_fkey
  foreign key (series_id) references public.series(id);

commit;
