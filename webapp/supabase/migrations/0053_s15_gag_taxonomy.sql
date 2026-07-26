-- 0053_s15_gag_taxonomy.sql
-- Multi-channel Phase 4b: the advisor's holes-map taxonomy moves from the
-- SANDY_TAXONOMY hardcode in app/api/audience/route.ts into per-series data
-- (series.metadata.gag_taxonomy). Seed SS-S15 with the exact former hardcode;
-- other series declare their own (empty = advisor emits no holes map — honest
-- silence, never another series' categories).
UPDATE series
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'gag_taxonomy',
  jsonb_build_array(
    'Body', 'Object', 'Environment', 'Chain-reaction', 'Status',
    'False-success', 'Sand', 'Transparent-body', 'Timing', 'Social'
  )
)
WHERE code = 'SS-S15'
  AND (metadata IS NULL OR NOT metadata ? 'gag_taxonomy');
