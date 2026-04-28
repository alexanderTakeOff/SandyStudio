// ──────────────────────────────────────────────────────────────────────────────
// lib/uiux/taxonomy.ts
// Asset visual taxonomy per uiux.md §16. Mirrors config/uiux.yaml.
// Colors map to CSS variables defined in app/globals.css.
// ──────────────────────────────────────────────────────────────────────────────

import type { AssetTypeCode, AssetStatusCode } from './types';

export interface AssetTypeMeta {
  code: AssetTypeCode;
  label: string;
  cssVar: string; // CSS variable name (without `var()` wrapping)
}

export const ASSET_TYPE_TAXONOMY: Record<AssetTypeCode, AssetTypeMeta> = {
  SCR: { code: 'SCR', label: 'Script',     cssVar: '--asset-script' },
  STB: { code: 'STB', label: 'Storyboard', cssVar: '--asset-storyboard' },
  IMG: { code: 'IMG', label: 'Image',      cssVar: '--asset-image' },
  VID: { code: 'VID', label: 'Video',      cssVar: '--asset-video' },
  AUD: { code: 'AUD', label: 'Audio',      cssVar: '--asset-audio' },
  REV: { code: 'REV', label: 'Review',     cssVar: '--asset-review' },
  PRO: { code: 'PRO', label: 'Production', cssVar: '--asset-production' },
  STA: { code: 'STA', label: 'Status',     cssVar: '--asset-status' },
  BIB: { code: 'BIB', label: 'Bible',      cssVar: '--asset-bible' },
  SPC: { code: 'SPC', label: 'Spec',       cssVar: '--asset-spec' },
};

export interface StatusChipMeta {
  code: AssetStatusCode;
  label: string;
  variant: 'draft' | 'review' | 'revision' | 'approved' | 'locked' | 'warning' | 'danger' | 'muted';
}

export const STATUS_CHIP_MAP: Record<AssetStatusCode, StatusChipMeta> = {
  DRAFT:             { code: 'DRAFT',             label: 'Draft',             variant: 'draft' },
  REVIEW:            { code: 'REVIEW',            label: 'Review',            variant: 'review' },
  REVISION:          { code: 'REVISION',          label: 'Revision',          variant: 'revision' },
  APPROVED:          { code: 'APPROVED',          label: 'Approved',          variant: 'approved' },
  LOCKED:            { code: 'LOCKED',            label: 'Locked',            variant: 'locked' },
  NEEDS_HUMAN_TWEAK: { code: 'NEEDS_HUMAN_TWEAK', label: 'Needs human tweak', variant: 'warning' },
  REJECTED:          { code: 'REJECTED',          label: 'Rejected',          variant: 'danger' },
  INVALIDATED:       { code: 'INVALIDATED',       label: 'Invalidated',       variant: 'muted' },
  TEST:              { code: 'TEST',              label: 'Test',              variant: 'muted' },
};
