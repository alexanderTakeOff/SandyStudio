import { describe, it, expect } from 'vitest';
import { buildFileTypePrefixOr } from '@/lib/api/asset-filter';

describe('buildFileTypePrefixOr', () => {
  it('builds an ilike OR expression for a single prefix', () => {
    expect(buildFileTypePrefixOr('VID-shot')).toBe('file_type.ilike.VID-shot%');
  });

  it('builds a comma-joined OR for multiple prefixes', () => {
    expect(buildFileTypePrefixOr('IMG-episode_ref,VID-shot')).toBe(
      'file_type.ilike.IMG-episode_ref%,file_type.ilike.VID-shot%',
    );
  });

  it('trims whitespace around prefixes', () => {
    expect(buildFileTypePrefixOr(' IMG-episode_ref , IMG-anchor ')).toBe(
      'file_type.ilike.IMG-episode_ref%,file_type.ilike.IMG-anchor%',
    );
  });

  it('returns null for an empty value', () => {
    expect(buildFileTypePrefixOr('')).toBeNull();
  });

  it('drops invalid segments and keeps valid ones', () => {
    // A PostgREST-injection attempt is rejected by the whitelist.
    expect(buildFileTypePrefixOr('IMG-anchor,status.eq.APPROVED')).toBe(
      'file_type.ilike.IMG-anchor%',
    );
  });

  it('returns null when every segment is invalid (injection-only)', () => {
    expect(buildFileTypePrefixOr('status.eq.APPROVED')).toBeNull();
    expect(buildFileTypePrefixOr('a)b,c(d')).toBeNull();
  });
});
