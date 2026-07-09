// ──────────────────────────────────────────────────────────────────────────────
// lib/api/status-transitions.ts
// Centralised status transition graph for assets and episodes.
// Source of truth for both API routes (this file) and agent runner code.
//
// Per specs/system/project_state.md and the asset_status / episode_status
// enums in 0001_enums.sql.
// ──────────────────────────────────────────────────────────────────────────────

import { ValidationError } from './errors';

export type AssetStatus =
  | 'DRAFT'
  | 'REVIEW'
  | 'REVISION'
  | 'APPROVED'
  | 'LOCKED'
  | 'NEEDS_HUMAN_TWEAK'
  | 'REJECTED'
  | 'INVALIDATED'
  | 'TEST';

export const ASSET_TRANSITIONS: Record<AssetStatus, ReadonlyArray<AssetStatus>> = {
  DRAFT:             ['REVIEW', 'INVALIDATED'],
  REVIEW:            ['REVISION', 'APPROVED', 'REJECTED', 'NEEDS_HUMAN_TWEAK'],
  REVISION:          ['REVIEW', 'INVALIDATED'],
  APPROVED:          ['LOCKED', 'REVISION'],         // REVISION on a previously-approved asset = revoke + rework
  LOCKED:            [],                              // terminal
  NEEDS_HUMAN_TWEAK: ['REVIEW', 'REVISION', 'REJECTED'],
  REJECTED:          ['INVALIDATED', 'REVISION'],
  // INVALIDATED = auto-superseded by a sibling's approval. Director may OVERRIDE
  // and re-choose a superseded version: APPROVE it directly (demoteSiblingApproved
  // then swaps the current winner out) or send it to REVISION. LOCKED is the only
  // truly terminal state. (q13 2026-06-05: Director couldn't re-pick a version.)
  INVALIDATED:       ['APPROVED', 'REVISION'],
  TEST:              ['INVALIDATED'],                 // Mode 4 outputs never promote
};

export function assertAssetTransition(from: AssetStatus, to: AssetStatus): void {
  if (from === to) return;
  const allowed = ASSET_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new ValidationError(
      `Asset status transition not allowed: ${from} → ${to}. ` +
        `Allowed from ${from}: ${allowed.length ? allowed.join(', ') : '(terminal)'}.`,
    );
  }
}

export type EpisodeStatus =
  | 'BRIEF_PENDING'
  | 'BRIEF_APPROVED'
  | 'SCRIPT_IN_PROGRESS'
  | 'SCRIPT_REVIEW'
  | 'SCRIPT_REVISION'
  | 'SCRIPT_APPROVED'
  | 'STORYBOARD_IN_PROGRESS'
  | 'STORYBOARD_REVIEW'
  | 'STORYBOARD_REVISION'
  | 'STORYBOARD_APPROVED'
  | 'ANIMATIC_IN_PROGRESS'
  | 'ANIMATIC_REVIEW'
  | 'ANIMATIC_REVISION'
  | 'ANIMATIC_APPROVED'
  | 'GENERATION_IN_PROGRESS'
  | 'GENERATION_REVIEW'
  | 'GENERATION_REVISION'
  | 'GENERATION_APPROVED'
  | 'PUBLISH_PENDING'
  | 'PUBLISHED'
  | 'ANALYTICS_COLLECTING'
  | 'COMPLETE';

// Forward-only transitions (with allowed loops back to *_REVISION).
export const EPISODE_TRANSITIONS: Record<EpisodeStatus, ReadonlyArray<EpisodeStatus>> = {
  BRIEF_PENDING:           ['BRIEF_APPROVED'],
  BRIEF_APPROVED:          ['SCRIPT_IN_PROGRESS'],
  SCRIPT_IN_PROGRESS:      ['SCRIPT_REVIEW'],
  SCRIPT_REVIEW:           ['SCRIPT_REVISION', 'SCRIPT_APPROVED'],
  SCRIPT_REVISION:         ['SCRIPT_IN_PROGRESS'],
  SCRIPT_APPROVED:         ['STORYBOARD_IN_PROGRESS'],
  STORYBOARD_IN_PROGRESS:  ['STORYBOARD_REVIEW'],
  STORYBOARD_REVIEW:       ['STORYBOARD_REVISION', 'STORYBOARD_APPROVED'],
  STORYBOARD_REVISION:     ['STORYBOARD_IN_PROGRESS'],
  // Animatic-stage demotion (2026-07-09): video may start WITHOUT an animatic
  // approval — the "Start Video" latch flips straight to GENERATION. ANIMATIC_*
  // path kept for in-flight episodes and anchor-mode (pacing gate).
  STORYBOARD_APPROVED:     ['ANIMATIC_IN_PROGRESS', 'GENERATION_IN_PROGRESS'],
  ANIMATIC_IN_PROGRESS:    ['ANIMATIC_REVIEW'],
  ANIMATIC_REVIEW:         ['ANIMATIC_REVISION', 'ANIMATIC_APPROVED'],
  ANIMATIC_REVISION:       ['ANIMATIC_IN_PROGRESS'],
  ANIMATIC_APPROVED:       ['GENERATION_IN_PROGRESS'],     // hard gate per Phase 4 design
  GENERATION_IN_PROGRESS:  ['GENERATION_REVIEW'],
  GENERATION_REVIEW:       ['GENERATION_REVISION', 'GENERATION_APPROVED'],
  GENERATION_REVISION:     ['GENERATION_IN_PROGRESS'],
  GENERATION_APPROVED:     ['PUBLISH_PENDING'],
  PUBLISH_PENDING:         ['PUBLISHED'],                  // hard limit Director-only
  PUBLISHED:               ['ANALYTICS_COLLECTING'],
  ANALYTICS_COLLECTING:    ['COMPLETE'],
  COMPLETE:                [],                             // terminal
};

export function assertEpisodeTransition(from: EpisodeStatus, to: EpisodeStatus): void {
  if (from === to) return;
  const allowed = EPISODE_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new ValidationError(
      `Episode status transition not allowed: ${from} → ${to}. ` +
        `Allowed from ${from}: ${allowed.length ? allowed.join(', ') : '(terminal)'}.`,
    );
  }
}
