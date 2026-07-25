-- ──────────────────────────────────────────────────────────────────────────────
-- 0048_channel_id_not_null.sql
-- Multi-channel Phase 1 follow-up (deployed AFTER the channel-aware code):
-- backfill any straggler rows the OLD code inserted between 0046 and the deploy
-- (they belong to Sandy — the only channel that existed pre-deploy), then
-- tighten channel_id to NOT NULL so the "no channel dimension" bug class is
-- impossible by construction.
-- ──────────────────────────────────────────────────────────────────────────────

UPDATE public.channel_snapshots
SET channel_id = (SELECT id FROM public.channels WHERE credential_key = 'SANDY')
WHERE channel_id IS NULL;

UPDATE public.channel_reports
SET channel_id = (SELECT id FROM public.channels WHERE credential_key = 'SANDY')
WHERE channel_id IS NULL;

ALTER TABLE public.channel_snapshots ALTER COLUMN channel_id SET NOT NULL;
ALTER TABLE public.channel_reports  ALTER COLUMN channel_id SET NOT NULL;
