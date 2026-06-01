import { describe, it, expect } from 'vitest';
import { isHttpishUrl, resolvePreviewSrc } from '@/lib/asset-preview-resolver';

describe('isHttpishUrl', () => {
  it('accepts root-relative and http(s) URLs', () => {
    expect(isHttpishUrl('/staging/x.png')).toBe(true);
    expect(isHttpishUrl('https://drive.google.com/x')).toBe(true);
    expect(isHttpishUrl('http://localhost/x')).toBe(true);
  });
  it('rejects null, undefined, and OS-absolute paths', () => {
    expect(isHttpishUrl(null)).toBe(false);
    expect(isHttpishUrl(undefined)).toBe(false);
    expect(isHttpishUrl('C:\\Users\\x.png')).toBe(false);
    expect(isHttpishUrl('H:/My Drive/x.png')).toBe(false);
  });
});

describe('resolvePreviewSrc', () => {
  it('prefers drive_path when http-ish', () => {
    expect(resolvePreviewSrc({ drive_path: '/staging/a.png', staging_path: '/staging/b.png' })).toBe(
      '/staging/a.png',
    );
  });
  it('falls through to staging_path when drive_path is a non-loadable OS path', () => {
    expect(
      resolvePreviewSrc({ drive_path: 'C:\\x.png', staging_path: '/staging/b.png' }),
    ).toBe('/staging/b.png');
  });
  it('falls through to drive_web_view_url', () => {
    expect(
      resolvePreviewSrc({ drive_path: null, staging_path: null, drive_web_view_url: 'https://d/v' }),
    ).toBe('https://d/v');
  });
  it('falls through to the prompt-entry candidates last', () => {
    expect(
      resolvePreviewSrc(
        { drive_path: null, staging_path: null, drive_web_view_url: null },
        { staging_path: '/staging/hist.png' },
      ),
    ).toBe('/staging/hist.png');
  });
  it('returns null when no candidate is loadable', () => {
    expect(resolvePreviewSrc({ drive_path: 'C:\\x', staging_path: null })).toBeNull();
  });

  it('prefers the Drive-backed /api/media route when id + drive_file_id present', () => {
    expect(
      resolvePreviewSrc({
        id: 'asset-123',
        drive_file_id: 'drive-abc',
        drive_path: '/staging/a.png',
      }),
    ).toBe('/api/media/asset-123');
  });

  it('falls back to legacy candidates when drive_file_id is absent', () => {
    expect(
      resolvePreviewSrc({ id: 'asset-123', drive_file_id: null, staging_path: '/staging/b.png' }),
    ).toBe('/staging/b.png');
  });
});
