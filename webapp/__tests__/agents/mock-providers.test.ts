import { describe, it, expect } from 'vitest';

import {
  mockAnalytics,
  mockImage,
  mockLLM,
  mockMusic,
  mockVideo,
  mockYouTubeUpload,
} from '@/lib/agents/mock-providers';

describe('mock providers — determinism + cost', () => {
  it('mockImage returns 1280x720 PNG, $0.00, deterministic seed', async () => {
    const r = await mockImage({ episodeId: 'ep-1', assetId: 'asset-1' });
    expect(r.width).toBe(1280);
    expect(r.height).toBe(720);
    expect(r.format).toBe('PNG');
    expect(r.cost_usd).toBe(0);
    expect(r.seed).toBe(42);
  });

  it('mockVideo returns 1920x1080 MP4 at 24fps, $0.00', async () => {
    const r = await mockVideo({ episodeId: 'ep-1', shotId: 'sh-1' });
    expect(r.width).toBe(1920);
    expect(r.height).toBe(1080);
    expect(r.fps).toBe(24);
    expect(r.format).toBe('MP4');
    expect(r.cost_usd).toBe(0);
  });

  it('mockMusic returns 30s WAV at 44100 Hz stereo, $0.00', async () => {
    const r = await mockMusic({ episodeId: 'ep-1', trackId: 'main' });
    expect(r.format).toBe('WAV');
    expect(r.duration_seconds).toBe(30);
    expect(r.sample_rate).toBe(44100);
    expect(r.channels).toBe(2);
    expect(r.cost_usd).toBe(0);
  });

  it('mockYouTubeUpload returns deterministic id derived from episodeId', async () => {
    const r1 = await mockYouTubeUpload({
      episodeId: 'episode-abc-123456',
      title: 't',
      description: 'd',
      tags: [],
      thumbnailDrivePath: '',
      videoDrivePath: '',
    });
    const r2 = await mockYouTubeUpload({
      episodeId: 'episode-abc-123456',
      title: 'different title',
      description: 'd',
      tags: [],
      thumbnailDrivePath: '',
      videoDrivePath: '',
    });
    expect(r1.youtube_video_id).toBe(r2.youtube_video_id);
    expect(r1.youtube_video_id).toMatch(/^mock_vid_/);
    expect(r1.cost_usd).toBe(0);
  });

  it('mockAnalytics returns all-zero metrics per providers.yaml', async () => {
    const r = await mockAnalytics({
      episodeId: 'ep-1',
      youtubeVideoId: 'mock_vid_000001',
      collectionPoint: 'T+24h',
    });
    expect(r.views).toBe(0);
    expect(r.watch_time_minutes).toBe(0);
    expect(r.likes).toBe(0);
    expect(r.collection_point).toBe('T+24h');
    expect(r.cost_usd).toBe(0);
  });

  it('mockLLM produces schema-valid markdown for each agent', async () => {
    const screenwriter = await mockLLM({ agentId: 'EXEC-SW', episodeId: 'ep-1' });
    expect(screenwriter.markdown).toContain('Mock Script');
    expect(screenwriter.cost_usd).toBe(0);

    const reviewer = await mockLLM({ agentId: 'EXEC-SREV', episodeId: 'ep-1' });
    expect(reviewer.markdown).toContain('Verdict: PASS');

    const wchk = await mockLLM({ agentId: 'EXEC-WCHK', episodeId: 'ep-1' });
    expect(wchk.markdown).toContain('Mock World Check');

    const editor = await mockLLM({ agentId: 'EXEC-EDIT', episodeId: 'ep-1' });
    expect(editor.markdown).toContain('Mock Animatic Spec');
  });
});
