import { describe, it, expect } from 'vitest';
import { isHttpishUrl, resolvePreviewSrc, previewFreshness } from '@/lib/asset-preview-resolver';

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

describe('previewFreshness — variant-pick cache-bust (regression 2026-07-17)', () => {
  it('prefers image_prompt.current_version, falls back to row version', () => {
    expect(previewFreshness({ metadata: { image_prompt: { current_version: 4 } }, version: 1 })).toBe(4);
    expect(previewFreshness({ version: 2 })).toBe(2);
    expect(previewFreshness(null)).toBeNull();
  });

  it('changes when selected_version changes even though version/current_version do not', () => {
    // select_attempt touches neither version nor current_version; before the fix
    // the freshness key was byte-identical across picks, so /api/media/{id}?t=
    // never changed and the drawer served the cached prior variant.
    const base = { metadata: { image_prompt: { current_version: 4 } } };
    const pickA = previewFreshness({ ...base, metadata: { image_prompt: { current_version: 4 }, shot_reference: { selected_version: 2 } } });
    const pickB = previewFreshness({ ...base, metadata: { image_prompt: { current_version: 4 }, shot_reference: { selected_version: 3 } } });
    expect(pickA).not.toBe(pickB);
    expect(pickA).toBe('4-sel2');
    expect(pickB).toBe('4-sel3');
  });

  it('flows a distinct ?t= into the drawer media URL per picked variant', () => {
    const url = (sel: number) =>
      resolvePreviewSrc({
        id: 'a1',
        drive_file_id: 'drive-1', // stays set on select_attempt → route branch is taken
        metadata: { image_prompt: { current_version: 4 }, shot_reference: { selected_version: sel } },
      });
    expect(url(2)).not.toBe(url(3));
    expect(url(2)).toBe('/api/media/a1?t=4-sel2');
  });
});
