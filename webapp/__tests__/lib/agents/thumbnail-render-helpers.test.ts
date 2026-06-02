import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { buildEditPrompt, overlayCaption } from '@/lib/agents/runners/thumbnail-renderer';

describe('buildEditPrompt', () => {
  it('always forbids in-image text (caption is overlaid afterward)', () => {
    const p = buildEditPrompt({ prompt: 'Sandy mid-lunge, shocked' });
    expect(p).toMatch(/Do NOT render any text/i);
  });

  it('folds composition_notes into the prompt', () => {
    const p = buildEditPrompt({ prompt: 'base', composition_notes: 'subject left third' });
    expect(p).toContain('subject left third');
  });

  it('reserves lower-third space only when an overlay caption exists', () => {
    const withText = buildEditPrompt({ prompt: 'base', overlay_text: 'TOO HEAVY!' });
    const withoutText = buildEditPrompt({ prompt: 'base', overlay_text: null });
    expect(withText).toMatch(/lower third/i);
    expect(withoutText).not.toMatch(/lower third/i);
  });
});

describe('overlayCaption', () => {
  async function solidBase(): Promise<Buffer> {
    return sharp({
      create: { width: 1280, height: 720, channels: 3, background: { r: 20, g: 30, b: 60 } },
    })
      .png()
      .toBuffer();
  }

  it('returns the base image unchanged when caption is empty', async () => {
    const base = await solidBase();
    const out = await overlayCaption(base, '   ');
    expect(out.equals(base)).toBe(true);
  });

  it('burns a caption and keeps the 1280×720 dimensions', async () => {
    const base = await solidBase();
    const out = await overlayCaption(base, 'TOO HEAVY!');
    expect(out.equals(base)).toBe(false);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(1280);
    expect(meta.height).toBe(720);
  });

  it('escapes XML-special characters without throwing', async () => {
    const base = await solidBase();
    await expect(overlayCaption(base, 'A & B < "C"')).resolves.toBeInstanceOf(Buffer);
  });
});
