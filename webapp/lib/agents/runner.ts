// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runner.ts
// Single dispatcher for all 11 production agents. Each Inngest function calls
// the same three helpers — loadAgentInputs / runAgent / saveAgentOutput — so
// retries, mock-vs-real switching, and asset persistence all flow through one
// place.
//
// Mock mode (Phase 4): runAgent() returns deterministic mock-provider output
// without ever calling Anthropic, fal.ai, or YouTube. Sprint 10 swaps in real
// providers behind the same API.
//
// File naming follows CLAUDE.md §3:
//   SS-{S}-{E}-{TYPE}-{description}-v{NN}-{STATUS}.{ext}
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '../supabase/types.gen';
import {
  mockAnalytics,
  mockImage,
  mockLLM,
  mockMusic,
  mockVideo,
  mockYouTubeUpload,
} from './mock-providers';
import { generateImageOpenAI } from './providers/openai-image';
import { generateVideoVeoGemini } from './providers/veo-gemini';
import type { ResolvedProvider } from './provider-resolver';
import { getAgent } from './registry';
import type { AgentId, AgentInputs, AgentResult } from './types';

// ── Inputs ────────────────────────────────────────────────────────────────────

export interface LoadInputsArgs {
  supabase: SupabaseClient<Database>;
  agentId: AgentId;
  episodeId: string;
}

/**
 * Loads upstream context for an agent run. Returns a loose AgentInputs object —
 * gate.ts has already verified the required assets exist, so we just collect
 * what's available for runAgent's use.
 */
export async function loadAgentInputs(args: LoadInputsArgs): Promise<AgentInputs> {
  const { supabase, agentId, episodeId } = args;

  const { data: episode, error: epErr } = await supabase
    .from('episodes')
    .select('id, episode_code, governance_mode, status, title_working, series_id, budget_ceiling, budget_spent')
    .eq('id', episodeId)
    .single();
  if (epErr) {
    throw new Error(`loadAgentInputs: episode lookup failed: ${epErr.message}`);
  }

  const { data: assets, error: asErr } = await supabase
    .from('assets')
    .select('id, file_type, filename, status, drive_path, staging_path, version')
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED');
  if (asErr) {
    throw new Error(`loadAgentInputs: assets lookup failed: ${asErr.message}`);
  }

  return {
    episode_id: episodeId,
    agent_id: agentId,
    episode,
    upstream_assets: assets,
  };
}

// ── Agent execution (mock-only in Phase 4) ────────────────────────────────────

export interface RunAgentArgs {
  agentId: AgentId;
  inputs: AgentInputs;
  /** Optional shot id for EXEC-VGEN per-shot fan-out. */
  shotId?: string;
  /** Optional music section for EXEC-MGEN. */
  section?: string;
  /** Optional collection point for EXEC-ANAL. */
  collectionPoint?: 'T+1h' | 'T+24h' | 'T+7d' | 'T+30d';
  /** Optional youtube video id (passed by EXEC-PUB to EXEC-ANAL through events). */
  youtubeVideoId?: string;
  /** Resolved provider for the contract this agent fulfils. Undefined ⇒ mock everywhere (replay-pilot, tests). */
  provider?: ResolvedProvider;
}

// Persists base64 binary output under webapp/public/staging/ so it can be
// served by Next.js at /staging/<file>. Phase 8 step 10 replaces this with
// Drive upload + drive_file_id.
async function persistBinaryToStaging(args: {
  base64: string;
  ext: 'png' | 'jpg' | 'mp4' | 'wav';
  hint?: string;
}): Promise<{ absolutePath: string; browserUrl: string }> {
  const stagingDir = path.join(process.cwd(), 'public', 'staging');
  await fs.mkdir(stagingDir, { recursive: true });
  const rand = crypto.randomBytes(6).toString('hex');
  const filename = `${args.hint ? `${args.hint}-` : ''}${rand}.${args.ext}`;
  const absolutePath = path.join(stagingDir, filename);
  await fs.writeFile(absolutePath, Buffer.from(args.base64, 'base64'));
  return { absolutePath, browserUrl: `/staging/${filename}` };
}

function buildThumbnailPrompt(inputs: AgentInputs): string {
  const ep = inputs.episode as { episode_code?: string; title_working?: string | null };
  const code = ep.episode_code ?? 'episode';
  const title = ep.title_working ?? 'Untitled comedy short';
  return [
    `YouTube thumbnail for an animated comedy short titled "${title}" (${code}).`,
    'Style: stylised 2D-ish animation aesthetic, vibrant colours, dynamic composition,',
    'a clear focal subject readable at 320×180, comedy/sketch art direction.',
    'No text, no watermark, 16:9 framing, high contrast.',
  ].join(' ');
}

interface RunResult {
  result: AgentResult;
  /** What kind of asset to write — drives saveAgentOutput shape. */
  outputKind:
    | 'text-md'
    | 'image-png'
    | 'video-mp4'
    | 'audio-wav'
    | 'analytics-json'
    | 'publish-log';
}

/**
 * Dispatch by agentId. Each branch returns deterministic mock output that
 * matches the schema each agent is contracted to produce.
 *
 * In Sprint 10 the same switch routes to real provider calls; the API surface
 * does not change.
 */
export async function runAgent(args: RunAgentArgs): Promise<RunResult> {
  const { agentId, inputs, shotId, section, collectionPoint, youtubeVideoId, provider } = args;
  void provider; // referenced inside individual cases (see EXEC-THUMB)
  const episodeId = inputs.episode_id;
  const agentMeta = getAgent(agentId);

  switch (agentId) {
    case 'EXEC-SW':
    case 'EXEC-SREV':
    case 'EXEC-SB':
    case 'EXEC-WCHK':
    case 'EXEC-COPY': {
      const llm = await mockLLM({ agentId, episodeId });
      return {
        outputKind: 'text-md',
        result: {
          asset_paths: [],
          cost_usd: llm.cost_usd,
          metadata: {
            agent_id: agentId,
            model: agentMeta.model,
            markdown: llm.markdown,
            body: llm.body as Record<string, unknown>,
          },
        },
      };
    }

    case 'EXEC-EDIT': {
      // EXEC-EDIT in Phase 4 mock mode: produce an animatic video asset.
      // Per-shot fan-out + music fan-out is dispatched by exec-edit.ts via
      // its nextEvent callback (it reads shot_ids from this metadata).
      // Real mode will read shot ids from the storyboard upstream.
      const llm = await mockLLM({ agentId, episodeId });
      const video = await mockVideo({ episodeId, shotId: 'animatic', durationSeconds: 60 });
      const shotIds = [1, 2, 3].map((act) => `${episodeId}-A${act}-SC01-SH01`);
      return {
        outputKind: 'video-mp4',
        result: {
          asset_paths: [video.drive_path],
          cost_usd: llm.cost_usd + video.cost_usd,
          metadata: {
            ...video,
            agent_id: agentId,
            markdown: llm.markdown,
            body: llm.body as Record<string, unknown>,
            shot_ids: shotIds,
          },
        },
      };
    }

    case 'EXEC-VGEN': {
      if (!shotId) {
        throw new Error(`EXEC-VGEN requires shotId in event payload`);
      }
      const video = await mockVideo({ episodeId, shotId, durationSeconds: 5 });
      return {
        outputKind: 'video-mp4',
        result: {
          asset_paths: [video.drive_path],
          cost_usd: video.cost_usd,
          metadata: {
            ...video,
            agent_id: agentId,
            shot_id: shotId,
          },
        },
      };
    }

    case 'EXEC-MGEN': {
      const trackId = section ?? 'main';
      const music = await mockMusic({ episodeId, trackId, durationSeconds: 30 });
      return {
        outputKind: 'audio-wav',
        result: {
          asset_paths: [music.drive_path],
          cost_usd: music.cost_usd,
          metadata: {
            ...music,
            agent_id: agentId,
            section: trackId,
          },
        },
      };
    }

    case 'EXEC-THUMB': {
      if (provider?.providerId === 'gpt-image-1') {
        const real = await generateImageOpenAI({
          prompt: buildThumbnailPrompt(inputs),
          size: '1536x1024',
          quality: 'medium',
        });
        const persisted = await persistBinaryToStaging({
          base64: real.b64_data,
          ext: 'png',
          hint: `thumb-${episodeId.slice(-8)}`,
        });
        return {
          outputKind: 'image-png',
          result: {
            asset_paths: [persisted.browserUrl],
            cost_usd: real.cost_usd,
            metadata: {
              agent_id: agentId,
              provider_id: 'gpt-image-1',
              provider_used: 'gpt-image-1',
              format: real.format,
              width: real.width,
              height: real.height,
              size_bytes: real.size_bytes,
              staging_path: persisted.absolutePath,
              revised_prompt: real.revised_prompt ?? null,
            },
          },
        };
      }
      const image = await mockImage({
        episodeId,
        assetId: `thumbnail-${episodeId.slice(-8)}`,
      });
      return {
        outputKind: 'image-png',
        result: {
          asset_paths: [image.drive_path],
          cost_usd: image.cost_usd,
          metadata: {
            ...image,
            agent_id: agentId,
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-PUB': {
      const upload = await mockYouTubeUpload({
        episodeId,
        title: 'Mock Episode',
        description: 'Phase 4 mock publish.',
        tags: ['sandystudio', 'mock'],
        thumbnailDrivePath: '<mock-thumb>',
        videoDrivePath: '<mock-video>',
      });
      return {
        outputKind: 'publish-log',
        result: {
          asset_paths: [],
          cost_usd: upload.cost_usd,
          metadata: {
            ...upload,
            agent_id: agentId,
            youtube_video_id: upload.youtube_video_id,
            publish_timestamp: Date.now(),
          },
          next_event: {
            name: 'sandystudio/exec-pub/published',
            data: {
              episodeId,
              youtubeVideoId: upload.youtube_video_id,
              publishTimestamp: Date.now(),
            },
          },
        },
      };
    }

    case 'EXEC-ANAL': {
      if (!collectionPoint || !youtubeVideoId) {
        throw new Error(
          `EXEC-ANAL requires collectionPoint and youtubeVideoId in event payload`
        );
      }
      const analytics = await mockAnalytics({
        episodeId,
        youtubeVideoId,
        collectionPoint,
      });
      return {
        outputKind: 'analytics-json',
        result: {
          asset_paths: [],
          cost_usd: analytics.cost_usd,
          metadata: {
            ...analytics,
            agent_id: agentId,
          },
        },
      };
    }

    default:
      throw new Error(`runAgent: agent ${agentId} not supported in Phase 4`);
  }
}

// ── Output persistence ────────────────────────────────────────────────────────

const FILE_TYPE_BY_AGENT: Record<AgentId, string> = {
  'EXEC-SW': 'SCR-script',
  'EXEC-SREV': 'REV-script_qa',
  'EXEC-SB': 'STB-storyboard',
  'EXEC-WCHK': 'REV-world_check',
  'EXEC-EDIT': 'VID-animatic', // animatic produces a video asset; spec is metadata
  'EXEC-VGEN': 'VID-shot',
  'EXEC-MGEN': 'AUD-music',
  'EXEC-COPY': 'SPC-metadata',
  'EXEC-THUMB': 'IMG-thumbnail',
  'EXEC-PUB': 'REV-publish_log',
  'EXEC-ANAL': 'REV-analytics',
  'EXEC-STY': 'BIB-style',
  'EXEC-ARCH': '',
  'EXEC-ORCH': '',
  'EXEC-CONC': '',
};

export interface SaveOutputArgs {
  supabase: SupabaseClient<Database>;
  agentId: AgentId;
  episodeId: string;
  episodeCode: string; // SS-S01-E01
  result: AgentResult;
  outputKind: RunResult['outputKind'];
  /** Optional discriminator for assets that come in multiple per agent (shots, music sections). */
  variant?: string;
}

/**
 * Persist agent output as one or more asset rows.
 *
 * For text-md outputs, we DON'T write the file to disk in Phase 4 — the
 * markdown lives in the asset row's description (or in a future blob column).
 * Drive paths point to the would-be filesystem location for Sprint 10 reuse.
 */
export async function saveAgentOutput(args: SaveOutputArgs): Promise<{ assetId: string }> {
  const { supabase, agentId, episodeId, episodeCode, result, outputKind, variant } = args;

  const fileTypeBase = FILE_TYPE_BY_AGENT[agentId];
  if (!fileTypeBase) {
    throw new Error(`saveAgentOutput: agent ${agentId} has no file_type mapping`);
  }
  const fileType = variant ? `${fileTypeBase}-${variant}` : fileTypeBase;

  const ext =
    outputKind === 'image-png'
      ? 'png'
      : outputKind === 'video-mp4'
        ? 'mp4'
        : outputKind === 'audio-wav'
          ? 'wav'
          : 'md';

  const filename = `${episodeCode}-${fileType}-v01-DRAFT.${ext}`;
  const drivePath = result.asset_paths[0] ?? null;

  // Markdown body lives in the dedicated `content` column (migration 0013).
  // `description` keeps its original role: a short summary line — currently
  // null for mock outputs since the providers don't emit a separate summary.
  // Phase 5d step 2 editor reads/writes via /api/assets/[id]/content → DB.
  const content =
    typeof result.metadata.markdown === 'string'
      ? (result.metadata.markdown as string)
      : null;

  // Real provider adapters that produce binaries (e.g. gpt-image-1) write the
  // file under webapp/public/staging/ and pass the absolute path through
  // metadata.staging_path. Mock outputs never set this — staging_path stays null.
  const stagingPath =
    typeof result.metadata.staging_path === 'string'
      ? (result.metadata.staging_path as string)
      : null;

  const { data, error } = await supabase
    .from('assets')
    .insert({
      episode_id: episodeId,
      agent_id: agentId,
      file_type: fileType,
      filename,
      drive_path: drivePath,
      staging_path: stagingPath,
      status: 'DRAFT',
      version: 1,
      content,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`saveAgentOutput: assets insert failed: ${error.message}`);
  }
  return { assetId: data.id };
}

// ── Job-row helpers (used by every Inngest function) ──────────────────────────

export interface InsertJobRowArgs {
  supabase: SupabaseClient<Database>;
  agentId: AgentId;
  episodeId: string | null;
  inngestEvent: string;
  inngestRunId: string;
  inputSnapshot: Record<string, unknown>;
}

export async function insertJobRow(args: InsertJobRowArgs): Promise<{ id: string }> {
  const { data, error } = await args.supabase
    .from('jobs')
    .insert({
      agent_id: args.agentId,
      episode_id: args.episodeId,
      inngest_event: args.inngestEvent,
      inngest_run_id: args.inngestRunId,
      status: 'RUNNING',
      input_snapshot: args.inputSnapshot as Json,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) {
    throw new Error(`insertJobRow: ${error.message}`);
  }
  return { id: data.id };
}

export async function markJobCompleted(
  supabase: SupabaseClient<Database>,
  jobId: string,
  outputRef: string | null
): Promise<void> {
  const { error } = await supabase
    .from('jobs')
    .update({
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
      output_ref: outputRef,
    })
    .eq('id', jobId);
  if (error) {
    throw new Error(`markJobCompleted: ${error.message}`);
  }
}

export async function markJobFailed(
  supabase: SupabaseClient<Database>,
  jobId: string,
  errorMessage: string
): Promise<void> {
  const { error } = await supabase
    .from('jobs')
    .update({
      status: 'FAILED',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('id', jobId);
  if (error) {
    throw new Error(`markJobFailed: ${error.message}`);
  }
}
