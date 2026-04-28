// ──────────────────────────────────────────────────────────────────────────────
// lib/uiux/types.ts
// Shared UI/UX types per specs/system/uiux.md.
// ──────────────────────────────────────────────────────────────────────────────

export type ThemeId =
  | 'slate_blue_cinematic'
  | 'sand_gold_studio'
  | 'deep_purple_night';

export type AmbientMode = 'on' | 'reduced' | 'off';

export type AssetTypeCode =
  | 'SCR'
  | 'STB'
  | 'IMG'
  | 'VID'
  | 'AUD'
  | 'REV'
  | 'PRO'
  | 'STA'
  | 'BIB'
  | 'SPC';

export type AssetStatusCode =
  | 'DRAFT'
  | 'REVIEW'
  | 'REVISION'
  | 'APPROVED'
  | 'LOCKED'
  | 'NEEDS_HUMAN_TWEAK'
  | 'REJECTED'
  | 'INVALIDATED'
  | 'TEST';

export interface AppearanceState {
  theme: ThemeId;
  ambient: AmbientMode;
}

export const DEFAULT_APPEARANCE: AppearanceState = {
  theme: 'slate_blue_cinematic',
  ambient: 'on',
};
