-- ──────────────────────────────────────────────────────────────────────────────
-- 0001_enums.sql
-- ENUM types used by core tables. Created first so later migrations can reference.
-- Source: specs/system/webapp.md §3.1
-- ──────────────────────────────────────────────────────────────────────────────

-- Episode lifecycle. 22 values. Mirrors §8 EPISODE STATE MACHINE.
-- *_REVISION states are returned-for-rework with revision_log populated.
-- ANIMATIC_APPROVED is the generation gate — nothing generates until set.
CREATE TYPE public.episode_status AS ENUM (
  'BRIEF_PENDING',
  'BRIEF_APPROVED',
  'SCRIPT_IN_PROGRESS',
  'SCRIPT_REVIEW',
  'SCRIPT_REVISION',
  'SCRIPT_APPROVED',
  'STORYBOARD_IN_PROGRESS',
  'STORYBOARD_REVIEW',
  'STORYBOARD_REVISION',
  'STORYBOARD_APPROVED',
  'ANIMATIC_IN_PROGRESS',
  'ANIMATIC_REVIEW',
  'ANIMATIC_REVISION',
  'ANIMATIC_APPROVED',
  'GENERATION_IN_PROGRESS',
  'GENERATION_REVIEW',
  'GENERATION_REVISION',
  'GENERATION_APPROVED',
  'PUBLISH_PENDING',
  'PUBLISHED',
  'ANALYTICS_COLLECTING',
  'COMPLETE'
);

-- Asset workflow status. 9 values. Filename-status (DRAFT..LOCKED) is a subset;
-- NEEDS_HUMAN_TWEAK / REJECTED / INVALIDATED / TEST are DB-only workflow states.
CREATE TYPE public.asset_status AS ENUM (
  'DRAFT',
  'REVIEW',
  'REVISION',
  'APPROVED',
  'LOCKED',
  'NEEDS_HUMAN_TWEAK',
  'REJECTED',
  'INVALIDATED',
  'TEST'
);

-- Inngest job lifecycle. 6 values.
CREATE TYPE public.job_status AS ENUM (
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'RETRYING',
  'CANCELLED'
);
