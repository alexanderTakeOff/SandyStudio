// Episode Start Notice (2026-07-11, Director q1b): the Writer injects an OPTIONAL
// advisory reservoir block when an SPC-start_notice is attached, and omits it
// entirely when absent (backward-compatible). The brief stays the MUST-hit spine.
import { describe, expect, test } from 'vitest';
import { buildUserMessage } from '@/lib/agents/runners/screenwriter';
import type { SeriesBibleCanon } from '@/lib/agents/bible-loader';

const EMPTY_BIBLE: SeriesBibleCanon = {
  series_id: null,
  general_idea: null,
  characters: [],
  locations: [],
  styles: [],
  total_entries: 0,
};

const BASE = {
  episodeCode: 'SS-S15-E26',
  episodeTitle: 'Test Episode',
  briefContent: '# Brief\n## Key beats\n- beat one\n- beat two',
  bible: EMPTY_BIBLE,
};

describe('screenwriter buildUserMessage — Episode Start Notice injection', () => {
  test('injects the advisory reservoir block when a notice is present', () => {
    const msg = buildUserMessage({
      ...BASE,
      startNoticeContent: '# Gag bank\n1. gag one\n2. gag two\n... 100. final punch',
    });
    expect(msg).toContain('<episode_start_notice>');
    expect(msg).toContain('</episode_start_notice>');
    expect(msg).toContain('100. final punch');
    // It must be framed as advisory, not a hard contract.
    expect(msg).toContain('NOT a beat-contract');
    // The brief is still present and remains the spine.
    expect(msg).toContain('<brief>');
    expect(msg).toContain('beat one');
  });

  test('omits the block entirely when no notice is attached', () => {
    const msg = buildUserMessage({ ...BASE, startNoticeContent: null });
    expect(msg).not.toContain('<episode_start_notice>');
    expect(msg).not.toContain('Episode Start Notice');
    // Brief still present — backward compatible with pre-notice episodes.
    expect(msg).toContain('<brief>');
  });

  test('treats whitespace-only notice as absent (no empty block)', () => {
    const msg = buildUserMessage({ ...BASE, startNoticeContent: '   \n  ' });
    expect(msg).not.toContain('<episode_start_notice>');
  });
});
