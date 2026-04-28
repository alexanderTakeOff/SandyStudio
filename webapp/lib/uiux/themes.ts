// ──────────────────────────────────────────────────────────────────────────────
// lib/uiux/themes.ts
// Theme metadata mirror of config/uiux.yaml `themes` section.
// CSS variables for each theme live in app/globals.css (one [data-theme] block
// per theme) per uiux.md §6.5. This file only describes the picker UI options.
// ──────────────────────────────────────────────────────────────────────────────

import type { ThemeId } from './types';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description: string;
  swatch: { from: string; to: string; accent: string };
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'slate_blue_cinematic',
    label: 'Slate Blue Cinematic',
    description: 'Recommended calm cinematic production theme.',
    swatch: { from: '#0F172A', to: '#1E293B', accent: '#3B82F6' },
  },
  {
    id: 'sand_gold_studio',
    label: 'Sand Gold Studio',
    description: 'Warmer theme for softer long-session work.',
    swatch: { from: '#1B1612', to: '#2A2118', accent: '#D4A574' },
  },
  {
    id: 'deep_purple_night',
    label: 'Deep Purple Night',
    description: 'Darker creative night-work theme.',
    swatch: { from: '#0E0A1A', to: '#1F1535', accent: '#A78BFA' },
  },
];

export function getThemeMeta(id: ThemeId): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
