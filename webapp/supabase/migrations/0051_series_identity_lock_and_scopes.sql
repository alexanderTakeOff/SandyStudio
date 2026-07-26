-- 0051_series_identity_lock_and_scopes.sql
-- Multi-channel Phase 4a (spec: specs/system/multi-channel.md §8).
--
-- Part 1 — A1: the Sandy-specific anchor identity block moves out of the EREF
-- runner hardcode (episode-references.ts ANCHOR_LAYOUT_LOCK_PREAMBLE) into
-- per-series data. Seed SS-S15 with the exact text that used to be hardcoded,
-- byte-for-byte, so S15 anchor prompts do not change. Other series get no
-- block (generic preamble only) until they declare their own.
--
-- Part 2 — A6: app_config_scope_check was last rebuilt in 0010 and does not
-- include the 'visual_critic' and 'on_model' scopes that the code writes/reads
-- (lib/api/visual-critic-provider-config.ts, runners/on-model-detector.ts).
-- Saving the Visual Critic model from Settings violates the CHECK. Rebuild the
-- constraint with the two live scopes added.

-- ── Part 1: seed S15 anchor identity lock ────────────────────────────────────
UPDATE series
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'anchor_identity_lock',
  'CRITICAL — Sandy_hourglass body shape: Sandy is a transparent two-bulb hourglass character with rubber-hose dark-grey arms, oversized mitten hands, and a Sandy-Gold sand column inside the glass. Sandy is NOT an animal, NOT a bear, NOT a cub, NOT a squirrel, NOT any furry creature. If the action prose mentions Sandy in motion (lunging, running, stretching), render the hourglass body in that motion — never substitute a different creature form. The Sandy character canon reference image is authoritative.'
)
WHERE code = 'SS-S15'
  AND (metadata IS NULL OR NOT metadata ? 'anchor_identity_lock');

-- ── Part 2: widen app_config scope CHECK ─────────────────────────────────────
ALTER TABLE app_config DROP CONSTRAINT IF EXISTS app_config_scope_check;
ALTER TABLE app_config ADD CONSTRAINT app_config_scope_check CHECK (scope IN (
  'production', 'visual', 'audio', 'seo', 'analytics', 'finance', 'providers',
  'narrative', 'characters', 'world', 'naming', 'app', 'storage', 'onboarding',
  'system', 'visual_critic', 'on_model'
));
