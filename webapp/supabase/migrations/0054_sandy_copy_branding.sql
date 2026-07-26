-- 0054_sandy_copy_branding.sql
-- Multi-channel Phase 4c: EXEC-COPY reads subscribe_cta /
-- long_description_boilerplate from the branding cascade
-- (series.metadata.branding → channels.metadata.branding). Seed the SANDY
-- channel with the values that until now lived only in the dead
-- config/defaults.yaml §copy (which no code reads).
UPDATE public.channels
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{branding}',
  COALESCE(metadata->'branding', '{}'::jsonb) || jsonb_build_object(
    'subscribe_cta', 'Subscribe for new episodes every week →',
    'long_description_boilerplate', 'New animated comedy series. New episode every week.'
  ),
  true
)
WHERE credential_key = 'SANDY'
  AND (metadata->'branding' IS NULL OR NOT (metadata->'branding') ? 'subscribe_cta');
