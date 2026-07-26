// Multi-channel Phase 2 — branding cascade (lib/agents/branding.ts):
// series.metadata.branding → channels.metadata.branding → neutral fallbacks.

import { describe, it, expect } from 'vitest';
import { resolveCopyBranding, resolveShortBranding } from '@/lib/agents/branding';

const SANDY_CHANNEL_BRANDING = {
  branding: {
    short_overlay_text: 'SANDY the HOURGLASS',
    short_description:
      '⏳ Sandy the Hourglass — silent physical comedy. Life is short. Flip yourself. #Shorts',
    short_tags: ['Shorts', 'Sandy the Hourglass', 'animation', 'comedy'],
  },
};

describe('resolveShortBranding', () => {
  it('channel branding fills all three keys (Sandy seed = former literals, byte-identical)', () => {
    const b = resolveShortBranding({
      channelMetadata: SANDY_CHANNEL_BRANDING,
      channelName: 'Sandy the Hourglass',
    });
    expect(b.overlayText).toBe('SANDY the HOURGLASS');
    expect(b.description).toBe(
      '⏳ Sandy the Hourglass — silent physical comedy. Life is short. Flip yourself. #Shorts',
    );
    expect(b.tags).toEqual(['Shorts', 'Sandy the Hourglass', 'animation', 'comedy']);
  });

  it('series branding overrides channel branding per key', () => {
    const b = resolveShortBranding({
      seriesMetadata: { branding: { short_overlay_text: 'STAPLER SHOW' } },
      channelMetadata: SANDY_CHANNEL_BRANDING,
      channelName: 'Sandy the Hourglass',
    });
    expect(b.overlayText).toBe('STAPLER SHOW');
    // Non-overridden keys still cascade to the channel.
    expect(b.tags).toEqual(SANDY_CHANNEL_BRANDING.branding.short_tags);
  });

  it('overlay falls back to the channel NAME when no branding key exists', () => {
    const b = resolveShortBranding({ channelName: 'New Channel' });
    expect(b.overlayText).toBe('New Channel');
  });

  it('channel-less series degrades to neutral (no throw, no Sandy leak)', () => {
    const b = resolveShortBranding({});
    expect(b.overlayText).toBeNull();
    expect(b.description).toBe('#Shorts');
    expect(b.tags).toEqual(['Shorts']);
  });

  it('description falls back to the series logline + #Shorts', () => {
    const b = resolveShortBranding({ seriesLogline: 'A stapler dreams big.' });
    expect(b.description).toBe('A stapler dreams big. #Shorts');
  });

  it('ignores malformed branding blocks and empty strings', () => {
    const b = resolveShortBranding({
      seriesMetadata: { branding: 'not-an-object' as never },
      channelMetadata: { branding: { short_overlay_text: '   ', short_tags: [] } },
      channelName: 'Fallback Name',
    });
    expect(b.overlayText).toBe('Fallback Name');
    expect(b.tags).toEqual(['Shorts']);
  });
});

// Phase 4c — long-form copy branding (EXEC-COPY finally knows its channel).
describe('resolveCopyBranding', () => {
  it('series override wins over channel; channel name passes through', () => {
    const b = resolveCopyBranding({
      seriesMetadata: { branding: { subscribe_cta: 'Series CTA' } },
      channelMetadata: {
        branding: { subscribe_cta: 'Channel CTA', long_description_boilerplate: 'Channel line.' },
      },
      channelName: 'Pragmatico Manifesto',
    });
    expect(b.channelName).toBe('Pragmatico Manifesto');
    expect(b.subscribeCta).toBe('Series CTA');
    expect(b.boilerplate).toBe('Channel line.');
  });

  it('channel-less series degrades to all-null (prompt stays channel-blind, no invention)', () => {
    const b = resolveCopyBranding({});
    expect(b).toEqual({ channelName: null, subscribeCta: null, boilerplate: null });
  });
});
