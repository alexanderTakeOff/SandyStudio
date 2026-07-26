-- 0055_budget_log_series_id.sql
-- Multi-channel Phase 4e: budget_log gets the series dimension.
--
-- Until now the ledger's only link to a series was indirect (episode_id →
-- episodes.series_id): /api/budget had to fetch the WHOLE table and join in
-- JS, and episode-less spend (Polina chat, Bible enrichment) could not be
-- attributed to any series at all.
--
-- Same pattern as 0049 (activity_events.series_id): a nullable FK column, a
-- history backfill, and a BEFORE-INSERT trigger that derives series_id from
-- episodes so the ~8 existing writers stay untouched. Explicit series_id in an
-- INSERT (the Polina path for episode-less rows) wins over the trigger.

ALTER TABLE public.budget_log
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.series(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS budget_log_series_idx
  ON public.budget_log (series_id, created_at DESC);

-- Backfill history through the episode link.
UPDATE public.budget_log b
SET series_id = e.series_id
FROM public.episodes e
WHERE b.episode_id = e.id
  AND b.series_id IS NULL
  AND e.series_id IS NOT NULL;

-- Derive on insert when the writer didn't set it.
CREATE OR REPLACE FUNCTION public.budget_log_fill_series_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.series_id IS NULL AND NEW.episode_id IS NOT NULL THEN
    SELECT e.series_id INTO NEW.series_id
    FROM public.episodes e
    WHERE e.id = NEW.episode_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS budget_log_fill_series_id ON public.budget_log;
CREATE TRIGGER budget_log_fill_series_id
  BEFORE INSERT ON public.budget_log
  FOR EACH ROW EXECUTE FUNCTION public.budget_log_fill_series_id();

COMMENT ON COLUMN public.budget_log.series_id IS
  'Series attribution (multi-channel 4e). Filled by trigger from episodes when '
  'episode_id is set; writers of episode-less spend (Polina) set it explicitly.';
