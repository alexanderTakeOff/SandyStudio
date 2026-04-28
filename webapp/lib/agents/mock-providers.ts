// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/mock-providers.ts
// Deterministic mock outputs for every provider contract used by Phase 4.
// Active when config/providers.yaml: gateway.provider_mode: mock.
//
// These mocks NEVER call real APIs and NEVER write binary files to disk —
// they only return metadata records that runner.ts persists into Supabase
// `assets` rows. Real binary outputs land in Sprint 10 with the same shapes.
//
// Determinism rules:
//   - Same input → identical output (no Date.now, no Math.random except seeded)
//   - All costs $0.00
//   - 50ms simulated latency per providers.yaml gateway settings
//   - All file paths use the template strings from providers.yaml verbatim,
//     so a future swap to real providers leaves the surrounding code untouched
// ──────────────────────────────────────────────────────────────────────────────

import type { AgentId } from './types';

/** Simulated provider latency in ms — matches providers.yaml mock.latency_ms. */
const MOCK_LATENCY_MS = 50;

/** Tiny helper so step.run() durations look realistic in Inngest dev UI. */
async function simulateLatency(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

// ── Common output shapes ──────────────────────────────────────────────────────

export interface MockMediaResult {
  status: 'success';
  provider: 'mock';
  format: string;
  width?: number;
  height?: number;
  duration_seconds?: number;
  sample_rate?: number;
  channels?: number;
  fps?: number;
  size_bytes: number;
  seed?: number;
  drive_path: string;
  cost_usd: 0;
}

export interface MockTextResult<T = Record<string, unknown>> {
  status: 'success';
  provider: 'mock';
  agent_id: AgentId;
  body: T;
  /** Markdown content suitable for direct write to assets.staging_path. */
  markdown: string;
  cost_usd: 0;
}

// ── Path templating per providers.yaml ────────────────────────────────────────

function templatePath(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key];
    if (value === undefined) {
      throw new Error(`Mock path template missing var "${key}": ${template}`);
    }
    return String(value);
  });
}

const TEMPLATES = {
  image:
    'H:/My Drive/SandyStudio_Media/raw/images/mock_{episode_id}_{asset_id}-v{version}-DRAFT.png',
  video:
    'H:/My Drive/SandyStudio_Media/raw/video/mock_{episode_id}_{shot_id}-v{version}-DRAFT.mp4',
  music:
    'H:/My Drive/SandyStudio_Media/raw/audio/mock_{episode_id}_{track_id}-v{version}-DRAFT.wav',
} as const;

// ── Image (EXEC-THUMB, EXEC-VGEN frames) ──────────────────────────────────────

export interface MockImageInput {
  episodeId: string;
  assetId: string;
  version?: number;
}

export async function mockImage(input: MockImageInput): Promise<MockMediaResult> {
  await simulateLatency();
  return {
    status: 'success',
    provider: 'mock',
    format: 'PNG',
    width: 1280,
    height: 720,
    size_bytes: 10240,
    seed: 42,
    drive_path: templatePath(TEMPLATES.image, {
      episode_id: input.episodeId,
      asset_id: input.assetId,
      version: input.version ?? 1,
    }),
    cost_usd: 0,
  };
}

// ── Video (EXEC-VGEN per-shot, EXEC-EDIT animatic) ────────────────────────────

export interface MockVideoInput {
  episodeId: string;
  shotId: string;
  version?: number;
  durationSeconds?: number;
}

export async function mockVideo(input: MockVideoInput): Promise<MockMediaResult> {
  await simulateLatency();
  return {
    status: 'success',
    provider: 'mock',
    format: 'MP4',
    width: 1920,
    height: 1080,
    fps: 24,
    duration_seconds: input.durationSeconds ?? 5.0,
    size_bytes: 102400,
    seed: 42,
    drive_path: templatePath(TEMPLATES.video, {
      episode_id: input.episodeId,
      shot_id: input.shotId,
      version: input.version ?? 1,
    }),
    cost_usd: 0,
  };
}

// ── Music (EXEC-MGEN) ─────────────────────────────────────────────────────────

export interface MockMusicInput {
  episodeId: string;
  trackId: string;
  version?: number;
  durationSeconds?: number;
}

export async function mockMusic(input: MockMusicInput): Promise<MockMediaResult> {
  await simulateLatency();
  return {
    status: 'success',
    provider: 'mock',
    format: 'WAV',
    duration_seconds: input.durationSeconds ?? 30.0,
    sample_rate: 44100,
    channels: 2,
    size_bytes: 5_292_000,
    drive_path: templatePath(TEMPLATES.music, {
      episode_id: input.episodeId,
      track_id: input.trackId,
      version: input.version ?? 1,
    }),
    cost_usd: 0,
  };
}

// ── YouTube upload (EXEC-PUB) ─────────────────────────────────────────────────

export interface MockYouTubeUploadInput {
  episodeId: string;
  title: string;
  description: string;
  tags: readonly string[];
  thumbnailDrivePath: string;
  videoDrivePath: string;
  scheduledPublishTime?: string; // ISO
}

export interface MockYouTubeUploadResult {
  status: 'success';
  provider: 'mock';
  youtube_video_id: string;
  video_url: string;
  upload_timestamp: string;
  scheduled_publish_time: string | null;
  privacy_status: 'private' | 'unlisted' | 'public';
  cost_usd: 0;
  note: 'MOCK — no actual upload performed';
}

export async function mockYouTubeUpload(
  input: MockYouTubeUploadInput
): Promise<MockYouTubeUploadResult> {
  await simulateLatency();
  // Deterministic id: derive from episodeId so retries on the same episode get
  // the same video_id. Real provider would generate a new id per upload.
  const idSuffix = input.episodeId.slice(-6).padStart(6, '0');
  return {
    status: 'success',
    provider: 'mock',
    youtube_video_id: `mock_vid_${idSuffix}`,
    video_url: `https://www.youtube.com/watch?v=mock_vid_${idSuffix}`,
    upload_timestamp: new Date(0).toISOString(), // deterministic — overridden by caller if needed
    scheduled_publish_time: input.scheduledPublishTime ?? null,
    privacy_status: 'private',
    cost_usd: 0,
    note: 'MOCK — no actual upload performed',
  };
}

// ── YouTube analytics (EXEC-ANAL) ─────────────────────────────────────────────

export interface MockAnalyticsInput {
  episodeId: string;
  youtubeVideoId: string;
  collectionPoint: 'T+1h' | 'T+24h' | 'T+7d' | 'T+30d';
}

export interface MockAnalyticsResult {
  status: 'success';
  provider: 'mock';
  collected_at: string;
  collection_point: 'T+1h' | 'T+24h' | 'T+7d' | 'T+30d';
  views: number;
  watch_time_minutes: number;
  avg_view_duration_seconds: number;
  avg_view_percentage: number;
  impressions: number;
  impression_ctr: number;
  subscribers_gained: number;
  likes: number;
  comments: number;
  traffic_sources: {
    search_pct: number;
    suggested_pct: number;
    direct_pct: number;
    notification_pct: number;
    other_pct: number;
  };
  retention_curve: number[];
  cost_usd: 0;
  note: 'MOCK — no real analytics data';
}

export async function mockAnalytics(
  input: MockAnalyticsInput
): Promise<MockAnalyticsResult> {
  await simulateLatency();
  return {
    status: 'success',
    provider: 'mock',
    collected_at: new Date(0).toISOString(),
    collection_point: input.collectionPoint,
    views: 0,
    watch_time_minutes: 0,
    avg_view_duration_seconds: 0,
    avg_view_percentage: 0,
    impressions: 0,
    impression_ctr: 0,
    subscribers_gained: 0,
    likes: 0,
    comments: 0,
    traffic_sources: {
      search_pct: 0,
      suggested_pct: 0,
      direct_pct: 0,
      notification_pct: 0,
      other_pct: 0,
    },
    retention_curve: [],
    cost_usd: 0,
    note: 'MOCK — no real analytics data',
  };
}

// ── LLM stubs (Anthropic surrogate for EXEC-SW, EXEC-SREV, EXEC-SB, etc.) ─────

export interface MockLLMInput {
  agentId: AgentId;
  episodeId: string;
  /** Free-form upstream context — only used to make markdown deterministic per call. */
  contextDigest?: string;
}

/**
 * Returns a markdown stub appropriate for the agent.
 * Real Sprint-10 implementation calls Anthropic with the agent's prompt_file
 * and returns the model's response. The stub structure here matches the schema
 * each agent is expected to produce, so downstream gates pass.
 */
export async function mockLLM<T = Record<string, unknown>>(
  input: MockLLMInput
): Promise<MockTextResult<T>> {
  await simulateLatency();
  const { agentId, episodeId, contextDigest = '' } = input;

  let markdown: string;
  let body: Record<string, unknown>;

  switch (agentId) {
    case 'EXEC-SW':
      body = {
        episode_id: episodeId,
        title: 'The Red Carpet (mock)',
        runtime_target_seconds: 60,
        scenes: [
          { scene_id: `${episodeId}-A1-SC01`, action: 'Sandy walks onto the red carpet.' },
          { scene_id: `${episodeId}-A2-SC01`, action: 'Inspector Stopwatch trips on a cable.' },
          { scene_id: `${episodeId}-A3-SC01`, action: 'Sandy strikes a pose. Cut to black.' },
        ],
      };
      markdown = `# Mock Script — ${episodeId}\n\nDeterministic stub for EXEC-SW.\nContext digest: ${contextDigest}\n\n${JSON.stringify(body, null, 2)}\n`;
      break;

    case 'EXEC-SREV':
      body = {
        episode_id: episodeId,
        verdict: 'PASS',
        checks_passed: ['structure', 'character_voice', 'comic_beats', 'world_consistency'],
        notes: ['Mock review — all checks auto-pass.'],
      };
      markdown = `# Mock Script Review — ${episodeId}\n\nVerdict: PASS\n\n${JSON.stringify(body, null, 2)}\n`;
      break;

    case 'EXEC-SB':
      body = {
        episode_id: episodeId,
        acts: [1, 2, 3].map((act) => ({
          act,
          shots: [
            {
              shot_id: `${episodeId}-A${act}-SC01-SH01`,
              camera_angle: 'medium_wide',
              location: 'red_carpet_front',
              action: 'mock action',
              duration_seconds: 5,
            },
          ],
        })),
      };
      markdown = `# Mock Storyboard — ${episodeId}\n\n${JSON.stringify(body, null, 2)}\n`;
      break;

    case 'EXEC-WCHK':
      body = {
        episode_id: episodeId,
        verdict: 'PASS',
        per_act: [
          { act: 1, result: 'PASS', issues: [] },
          { act: 2, result: 'PASS', issues: [] },
          { act: 3, result: 'PASS', issues: [] },
        ],
      };
      markdown = `# Mock World Check — ${episodeId}\n\nVerdict: PASS\n\n${JSON.stringify(body, null, 2)}\n`;
      break;

    case 'EXEC-EDIT':
      body = {
        episode_id: episodeId,
        animatic_version: 'v01',
        total_duration_s: 60.0,
        target_runtime_s: 60.0,
        budget_delta_pct: 0.0,
        pacing_self_qa: {
          punchlines_landed: true,
          no_orphan_dialogue: true,
          music_sync: true,
          budget_within_5pct: true,
          result: 'PASS',
        },
      };
      markdown = `# Mock Animatic Spec — ${episodeId}\n\n${JSON.stringify(body, null, 2)}\n`;
      break;

    case 'EXEC-COPY':
      body = {
        episode_id: episodeId,
        title: 'The Red Carpet — Sandy & Stopwatch',
        description: 'A 60-second silent comedy.\n\nMock metadata for Phase 4.',
        tags: ['sandystudio', 'animation', 'comedy', 'silent', 'pink-panther-style'],
      };
      markdown = `# Mock Metadata — ${episodeId}\n\n${JSON.stringify(body, null, 2)}\n`;
      break;

    case 'EXEC-PUB':
      // Publisher is mostly a side-effect agent (YouTube upload). Its markdown
      // is the publish log, populated by the function itself, not the LLM.
      body = { episode_id: episodeId, log: 'Publish log placeholder — overwritten by function.' };
      markdown = `# Mock Publish Log — ${episodeId}\n\n(Populated by exec-pub.ts)\n`;
      break;

    default:
      body = { episode_id: episodeId, agent_id: agentId, note: 'generic mock' };
      markdown = `# Mock Output — ${agentId} — ${episodeId}\n\n${JSON.stringify(body, null, 2)}\n`;
  }

  return {
    status: 'success',
    provider: 'mock',
    agent_id: agentId,
    body: body as T,
    markdown,
    cost_usd: 0,
  };
}
