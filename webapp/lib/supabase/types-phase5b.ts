// ──────────────────────────────────────────────────────────────────────────────
// lib/supabase/types-phase5b.ts
// Type extensions for tables added in migration 0010 — kept here until the
// next `npm run gen:types` regeneration after Director pushes 0010 to remote.
// Once regenerated, this file can be deleted and call sites switch to the
// canonical `Database` import.
// ──────────────────────────────────────────────────────────────────────────────

export interface SeriesRow {
  id: string;
  code: string;
  title: string;
  audience: string | null;
  genre: string | null;
  logline: string | null;
  episode_budget_ceiling: number | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeriesInsert {
  code: string;
  title: string;
  audience?: string | null;
  genre?: string | null;
  logline?: string | null;
  episode_budget_ceiling?: number | null;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  created_by?: string | null;
}

export type AuthorityCategory =
  | 'character_visual'
  | 'location_ref'
  | 'generated_shots'
  | 'thumbnail'
  | 'script'
  | 'storyboard'
  | 'music'
  | 'metadata'
  | 'publish';

export type AuthorityApprover = 'director' | 'exec_dir_ai' | 'human_delegate';

export interface AuthorityMatrixRow {
  id: string;
  series_id: string;
  category: AuthorityCategory;
  approver: AuthorityApprover;
  delegate_user_id: string | null;
  is_locked: boolean;
  updated_at: string;
}

export const VISUAL_CATEGORIES: ReadonlySet<AuthorityCategory> = new Set([
  'character_visual',
  'location_ref',
  'generated_shots',
  'thumbnail',
]);

export const HARD_LOCKED_CATEGORIES: ReadonlySet<AuthorityCategory> = new Set([
  'character_visual',
  'location_ref',
  'generated_shots',
  'thumbnail',
  'publish',
]);
