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
import { persistBinary, type PersistedBinary } from './persist-binary';
import type { ResolvedProvider } from './provider-resolver';
import { getAgent } from './registry';
import { runScreenwriter, ScreenwriterError } from './runners/screenwriter';
import { runScriptReviewer, ScriptReviewerError } from './runners/script-reviewer';
import { runStoryboarder, StoryboarderError } from './runners/storyboarder';
import { runContinuityCheck, ContinuityCheckError } from './runners/continuity-check';
import { runCopywriter, CopywriterError } from './runners/copywriter';
import { runEpisodeReferences, EpisodeReferencesError } from './runners/episode-references';
import { runAnimaticSlideshow, AnimaticSlideshowError } from './runners/animatic-slideshow';
import { loadSeriesBibleCanon } from './bible-loader';
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
    .select('id, file_type, filename, status, drive_path, staging_path, version, content')
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED');
  if (asErr) {
    throw new Error(`loadAgentInputs: assets lookup failed: ${asErr.message}`);
  }

  // Load LOCKED Series Bible canon. Empty canon is valid (early-stage projects);
  // text-producing runners (SW, SREV, SB, COPY) gracefully degrade. Image and
  // continuity runners load the canon themselves with stricter preconditions.
  // Failure here is non-fatal: degrade to empty canon rather than blocking the
  // pipeline. Replay-pilot's mock supabase may not implement the assets/series
  // tables; without this guard the entire pipeline would fail in tests.
  let bible;
  try {
    bible = await loadSeriesBibleCanon(supabase, episodeId);
  } catch {
    bible = {
      series_id: null,
      general_idea: null,
      characters: [],
      locations: [],
      styles: [],
      total_entries: 0,
    };
  }

  return {
    episode_id: episodeId,
    agent_id: agentId,
    episode,
    upstream_assets: assets,
    bible,
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
  /** Supabase client (service role). Required for binary-producing agents that go to real providers — used by persistBinary to resolve the storage contract. */
  supabase?: SupabaseClient<Database>;
  /** Episode code (e.g. SS-S01-E02) — fed into Drive folder layout. */
  episodeCode?: string;
}

// Helper: assemble metadata payload for binary outputs, encapsulating the
// difference between local-only and Drive-backed persistence.
function metadataFromPersisted(
  persisted: PersistedBinary,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...extra,
    staging_path: persisted.absolutePath,
    drive_file_id: persisted.driveFileId,
    drive_web_view_url: persisted.driveWebViewUrl,
    storage_provider: persisted.storageProviderId,
    drive_upload_failed: persisted.driveUploadFailed,
  };
}

function buildAnimaticPrompt(inputs: AgentInputs): string {
  const ep = inputs.episode as { episode_code?: string; title_working?: string | null };
  const title = ep.title_working ?? 'Untitled comedy short';
  return [
    `Animatic preview for an animated comedy short titled "${title}".`,
    'Stylised 2D animation, muted palette, cinematic 16:9 framing.',
    'Smooth camera, simple silhouette compositions, no on-screen text.',
  ].join(' ');
}

function buildShotPrompt(inputs: AgentInputs, shotId?: string): string {
  const ep = inputs.episode as { episode_code?: string; title_working?: string | null };
  const title = ep.title_working ?? 'Untitled comedy short';
  return [
    `Single shot from animated comedy "${title}" (shot ${shotId ?? '?'}).`,
    'Vibrant 2D animation, dynamic action, comedic timing, 16:9 framing, no text.',
  ].join(' ');
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
  const {
    agentId,
    inputs,
    shotId,
    section,
    collectionPoint,
    youtubeVideoId,
    provider,
    supabase,
    episodeCode,
  } = args;
  void provider; // referenced inside individual cases
  const episodeId = inputs.episode_id;
  const agentMeta = getAgent(agentId);

  switch (agentId) {
    case 'EXEC-SW': {
      // Real screenwriter — Anthropic Sonnet, reads APPROVED brief from
      // upstream_assets, returns markdown + scenes_v1 JSON. Contract:
      // specs/contracts/screenwriter@v1.yaml.
      //
      // Auto-mock fallback (mirrors provider-resolver.ts pattern): when
      // ANTHROPIC_API_KEY is not set we keep the mock path so replay-pilot
      // and unit tests run without secrets. In webapp dev/prod the key is
      // always present and the real path runs.
      const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
      if (hasAnthropicKey) {
        try {
          const sw = await runScreenwriter({ inputs });
          return {
            outputKind: 'text-md',
            result: {
              asset_paths: [],
              cost_usd: sw.costUsd,
              metadata: {
                agent_id: agentId,
                model: sw.model,
                contract: sw.contract,
                markdown: sw.markdown,
                body: sw.body,
                description: sw.description,
                brief_asset_id: sw.briefAssetId,
                mvp_missing_inputs: sw.notes,
                provider_id: sw.model,
                provider_used: 'anthropic',
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof ScreenwriterError) {
            throw new Error(`EXEC-SW: ${err.message}`);
          }
          throw err;
        }
      }
      // Fallback: mockLLM path (replay-pilot, unit tests, environments without key)
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
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-SREV': {
      // Real script reviewer — Anthropic Sonnet, reads APPROVED brief +
      // script, returns markdown + verdict JSON. Contract:
      // specs/contracts/script_reviewer@v1.yaml.
      const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
      if (hasAnthropicKey) {
        try {
          const r = await runScriptReviewer({ inputs });
          return {
            outputKind: 'text-md',
            result: {
              asset_paths: [],
              cost_usd: r.costUsd,
              metadata: {
                agent_id: agentId,
                model: r.model,
                contract: r.contract,
                markdown: r.markdown,
                body: r.body,
                description: r.description,
                verdict: r.verdict,
                brief_asset_id: r.briefAssetId,
                script_asset_id: r.scriptAssetId,
                mvp_missing_inputs: r.notes,
                provider_id: r.model,
                provider_used: 'anthropic',
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof ScriptReviewerError) {
            throw new Error(`EXEC-SREV: ${err.message}`);
          }
          throw err;
        }
      }
      // Fallback: mockLLM (replay-pilot, tests, no key)
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
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-SB': {
      // Real storyboarder — Anthropic Sonnet, breaks APPROVED script into
      // 3 acts × shots. Contract: specs/contracts/storyboarder@v1.yaml.
      const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
      if (hasAnthropicKey) {
        try {
          const r = await runStoryboarder({ inputs });
          return {
            outputKind: 'text-md',
            result: {
              asset_paths: [],
              cost_usd: r.costUsd,
              metadata: {
                agent_id: agentId,
                model: r.model,
                contract: r.contract,
                markdown: r.markdown,
                body: r.body,
                description: r.description,
                total_shots: r.totalShots,
                total_duration_s: r.totalDurationS,
                brief_asset_id: r.briefAssetId,
                script_asset_id: r.scriptAssetId,
                mvp_missing_inputs: r.notes,
                provider_id: r.model,
                provider_used: 'anthropic',
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof StoryboarderError) {
            throw new Error(`EXEC-SB: ${err.message}`);
          }
          throw err;
        }
      }
      // Fallback: mockLLM
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
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-WCHK': {
      // Pivoted: was "World Checker", now Continuity Supervisor — validates
      // storyboard against LOCKED Series Bible canon. Contract:
      // specs/contracts/continuity_check@v1.yaml.
      const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
      if (hasAnthropicKey && supabase) {
        try {
          const r = await runContinuityCheck({ inputs, supabase });
          return {
            outputKind: 'text-md',
            result: {
              asset_paths: [],
              cost_usd: r.costUsd,
              metadata: {
                agent_id: agentId,
                model: r.model,
                contract: r.contract,
                markdown: r.markdown,
                body: r.body,
                description: r.description,
                verdict: r.verdict,
                storyboard_asset_id: r.storyboardAssetId,
                bible_snapshot: r.bibleSnapshot,
                provider_id: r.model,
                provider_used: 'anthropic',
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof ContinuityCheckError) {
            throw new Error(`EXEC-WCHK: ${err.message}`);
          }
          throw err;
        }
      }
      // Fallback: mockLLM
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
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-COPY': {
      // Real copywriter — Haiku 4.5 (cheap + fast). Contract:
      // specs/contracts/copywriter@v1.yaml.
      const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
      if (hasAnthropicKey) {
        try {
          const r = await runCopywriter({ inputs });
          return {
            outputKind: 'text-md',
            result: {
              asset_paths: [],
              cost_usd: r.costUsd,
              metadata: {
                agent_id: agentId,
                model: r.model,
                contract: r.contract,
                markdown: r.markdown,
                body: r.body,
                description: r.description,
                provider_id: r.model,
                provider_used: 'anthropic',
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof CopywriterError) throw new Error(`EXEC-COPY: ${err.message}`);
          throw err;
        }
      }
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
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-EREF': {
      // Real Episode Reference Generator. Bible-anchored gpt-image-1 fan-out
      // — produces N IMG-episode_ref_<slug> assets directly. Contract:
      // specs/contracts/episode_references@v1.yaml.
      const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());
      if (hasOpenAI && supabase) {
        try {
          const r = await runEpisodeReferences({ inputs, supabase, episodeCode });
          return {
            outputKind: 'image-png',
            result: {
              // Empty asset_paths because the runner already inserted N rows
              // directly. saveAgentOutput sees skip_save and doesn't create
              // an extra placeholder row.
              asset_paths: [],
              cost_usd: r.costUsd,
              metadata: {
                agent_id: agentId,
                contract: r.contract,
                provider_id: 'gpt-image-1',
                provider_used: 'gpt-image-1',
                description: r.description,
                skip_save: true,
                inserted_asset_ids: r.insertedAssetIds,
                total_images: r.totalImages,
                bible_snapshot: r.bibleSnapshot,
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof EpisodeReferencesError) {
            throw new Error(`EXEC-EREF: ${err.message}`);
          }
          throw err;
        }
      }
      // Fallback: mock placeholder so replay-pilot keeps working.
      const image = await mockImage({
        episodeId,
        assetId: `episode_ref-${episodeId.slice(-8)}`,
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
            description: 'Stub EXEC-EREF mock — set OPENAI_API_KEY for real path',
          },
        },
      };
    }

    case 'EXEC-EDIT': {
      // EXEC-EDIT priority: Step 8-lite slideshow assembly when ≥1 APPROVED
      // IMG-episode_ref exists in upstream. This is our Bible-anchored animatic
      // gate per Director's critique #4 — Director validates pacing on a
      // browser-rendered sequence of approved refs. Music + real MP4 land in
      // Step 8.5 / 8 full.
      const upstream = inputs.upstream_assets as
        | ReadonlyArray<{ file_type?: string | null; status?: string | null }>
        | undefined;
      const hasApprovedRefs = (upstream ?? []).some(
        (a) =>
          typeof a.file_type === 'string' &&
          a.file_type.startsWith('IMG-episode_ref') &&
          a.status === 'APPROVED',
      );
      if (hasApprovedRefs && supabase) {
        try {
          const slide = await runAnimaticSlideshow({ inputs, supabase, episodeCode });
          return {
            outputKind: 'text-md',
            result: {
              asset_paths: [],
              cost_usd: slide.costUsd,
              metadata: {
                agent_id: agentId,
                contract: slide.contract,
                provider_id: 'slideshow',
                provider_used: 'slideshow',
                markdown: slide.markdown,
                body: slide.body,
                description: slide.description,
                animatic_kind: 'slideshow_v1',
                total_duration_s: slide.totalDurationS,
                frame_count: slide.frameCount,
                // animatic@v1 — interactive browser-native player payload.
                // Drawer renders <AnimaticPlayer /> when present.
                ...(slide.animaticV1 ? { animatic_v1: slide.animaticV1 } : {}),
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof AnimaticSlideshowError) {
            throw new Error(`EXEC-EDIT (slideshow): ${err.message}`);
          }
          throw err;
        }
      }

      // Legacy real Veo path + mock path (kept for replay-pilot and Step 9).
      const llm = await mockLLM({ agentId, episodeId });
      const shotIds = [1, 2, 3].map((act) => `${episodeId}-A${act}-SC01-SH01`);

      if (provider?.providerId === 'veo-3' || provider?.providerId === 'veo-3-img2vid') {
        if (!supabase) throw new Error('EXEC-EDIT real path requires supabase in runArgs');
        const real = await generateVideoVeoGemini({
          prompt: buildAnimaticPrompt(inputs),
          durationSeconds: 8,
          aspectRatio: '16:9',
          quality: 'fast',
        });
        const persisted = await persistBinary({
          base64: real.mp4_b64,
          ext: 'mp4',
          driveFilename: `${episodeCode ?? 'SS-unknown'}-VID-animatic-v01-DRAFT.mp4`,
          localHint: `animatic-${episodeId.slice(-8)}`,
          episodeCode,
          supabase,
        });
        return {
          outputKind: 'video-mp4',
          result: {
            asset_paths: [persisted.browserUrl],
            cost_usd: llm.cost_usd + real.cost_usd,
            metadata: metadataFromPersisted(persisted, {
              agent_id: agentId,
              provider_id: real.provider,
              provider_used: real.provider,
              format: real.format,
              width: real.width,
              height: real.height,
              duration_seconds: real.duration_seconds,
              size_bytes: real.size_bytes,
              markdown: llm.markdown,
              body: llm.body as Record<string, unknown>,
              shot_ids: shotIds,
            }),
          },
        };
      }

      const video = await mockVideo({ episodeId, shotId: 'animatic', durationSeconds: 60 });
      return {
        outputKind: 'video-mp4',
        result: {
          asset_paths: [video.drive_path],
          cost_usd: llm.cost_usd + video.cost_usd,
          metadata: {
            ...video,
            agent_id: agentId,
            provider_id: 'mock',
            provider_used: 'mock',
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

      if (provider?.providerId === 'veo-3-img2vid' || provider?.providerId === 'veo-3') {
        if (!supabase) throw new Error('EXEC-VGEN real path requires supabase in runArgs');
        // Without a master character reference (PA-001/2/3 lands later), fall
        // back to text-to-video for the shot. When the reference workflow is
        // live, pass referenceImageBase64 + referenceImageMime here.
        const real = await generateVideoVeoGemini({
          prompt: buildShotPrompt(inputs, shotId),
          durationSeconds: 4,
          aspectRatio: '16:9',
          quality: 'fast',
        });
        const safeShotId = shotId.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
        const persisted = await persistBinary({
          base64: real.mp4_b64,
          ext: 'mp4',
          driveFilename: `${episodeCode ?? 'SS-unknown'}-VID-shot_${safeShotId}-v01-DRAFT.mp4`,
          localHint: `shot-${safeShotId}`,
          episodeCode,
          supabase,
        });
        return {
          outputKind: 'video-mp4',
          result: {
            asset_paths: [persisted.browserUrl],
            cost_usd: real.cost_usd,
            metadata: metadataFromPersisted(persisted, {
              agent_id: agentId,
              shot_id: shotId,
              provider_id: real.provider,
              provider_used: real.provider,
              format: real.format,
              width: real.width,
              height: real.height,
              duration_seconds: real.duration_seconds,
              size_bytes: real.size_bytes,
            }),
          },
        };
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
            provider_id: 'mock',
            provider_used: 'mock',
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
        if (!supabase) throw new Error('EXEC-THUMB real path requires supabase in runArgs');
        const real = await generateImageOpenAI({
          prompt: buildThumbnailPrompt(inputs),
          size: '1536x1024',
          quality: 'medium',
        });
        const persisted = await persistBinary({
          base64: real.b64_data,
          ext: 'png',
          driveFilename: `${episodeCode ?? 'SS-unknown'}-IMG-thumbnail-v01-DRAFT.png`,
          localHint: `thumb-${episodeId.slice(-8)}`,
          episodeCode,
          supabase,
        });
        return {
          outputKind: 'image-png',
          result: {
            asset_paths: [persisted.browserUrl],
            cost_usd: real.cost_usd,
            metadata: metadataFromPersisted(persisted, {
              agent_id: agentId,
              provider_id: 'gpt-image-1',
              provider_used: 'gpt-image-1',
              format: real.format,
              width: real.width,
              height: real.height,
              size_bytes: real.size_bytes,
              revised_prompt: real.revised_prompt ?? null,
            }),
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
  'EXEC-EREF': 'IMG-episode_ref', // backbone v2: between Storyboard and Animatic
  'EXEC-EDIT': 'VID-animatic', // animatic produces a video asset; spec is metadata
  'EXEC-VGEN': 'VID-shot',
  'EXEC-MGEN': 'AUD-music',
  'EXEC-COPY': 'SPC-metadata',
  'EXEC-THUMB': 'IMG-thumbnail',
  'EXEC-PUB': 'REV-publish_log',
  'EXEC-ANAL': 'REV-analytics',
  'EXEC-STY': 'BIB-style',
  'EXEC-BIBLE-AUTHOR': '', // updates existing SBL-* row inline; never creates a new one through saveAgentOutput
  'EXEC-STYLE-CHECK': '', // pre-flight check; never creates an asset
  'EXEC-EREF-CHECK': '', // post-generation review; called inline from EREF runner, never creates an asset
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

  // Some agents (e.g. EXEC-EREF) insert N assets directly inside their runner
  // and ask saveAgentOutput to step aside. They pass `skip_save: true` and
  // `inserted_asset_ids: [...]` in metadata; we return the first one as the
  // primary asset id so the rest of the factory chain keeps working.
  if (result.metadata.skip_save === true) {
    const ids = result.metadata.inserted_asset_ids;
    if (Array.isArray(ids) && typeof ids[0] === 'string') {
      return { assetId: ids[0] };
    }
    throw new Error(
      'saveAgentOutput: skip_save was set but inserted_asset_ids missing or empty',
    );
  }

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

  // Auto-increment version: each agent re-run produces a new asset row, so
  // re-trigger / revision cycles never collide on the unique filename
  // constraint. Versioning policy per glossary §9: each pipeline pass is its
  // own version; old version stays in REVISION/REJECTED for the audit trail.
  const { data: existingRows } = await supabase
    .from('assets')
    .select('version, filename')
    .eq('episode_id', episodeId)
    .eq('file_type', fileType);
  const maxExistingVersion = (existingRows ?? []).reduce(
    (max, row) => Math.max(max, row.version ?? 0),
    0,
  );
  const nextVersion = maxExistingVersion + 1;
  const versionTag = `v${String(nextVersion).padStart(2, '0')}`;
  const filename = `${episodeCode}-${fileType}-${versionTag}-DRAFT.${ext}`;
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

  // Drive identity (when storage provider = drive_native and upload succeeded)
  // — read by AssetPreview as a fallback when local cache misses, by future
  // Drive-native operations (download, share, delete) as the canonical handle.
  const driveFileId =
    typeof result.metadata.drive_file_id === 'string'
      ? (result.metadata.drive_file_id as string)
      : null;
  const driveWebViewUrl =
    typeof result.metadata.drive_web_view_url === 'string'
      ? (result.metadata.drive_web_view_url as string)
      : null;

  // Real text agents (Step 1+) emit a one-line description through metadata
  // ("produced by EXEC-SW · screenwriter@v1 · sonnet · cost $X · N tokens").
  // Mock agents leave this null. Surfaced verbatim in AssetPreview header.
  const description =
    typeof result.metadata.description === 'string'
      ? (result.metadata.description as string)
      : null;

  // Persist agent-specific structured payloads to the JSONB `metadata` column
  // so downstream UI / runners can read them. We pick only opted-in keys:
  // `animatic_v1` is the only one for now, but this list is expected to grow
  // as new contracts (animatic_v2, vgen_shot_v1, etc.) emerge. Keys like
  // `markdown`, `staging_path`, `description` are already promoted to columns
  // and would just bloat metadata, so they are NOT included here.
  const PERSIST_METADATA_KEYS = ['animatic_v1'] as const;
  let metadataPayload: Record<string, unknown> | null = null;
  for (const key of PERSIST_METADATA_KEYS) {
    const v = result.metadata[key];
    if (v !== undefined && v !== null) {
      if (metadataPayload === null) metadataPayload = {};
      metadataPayload[key] = v;
    }
  }

  const { data, error } = await supabase
    .from('assets')
    .insert({
      episode_id: episodeId,
      agent_id: agentId,
      file_type: fileType,
      filename,
      drive_path: drivePath,
      staging_path: stagingPath,
      drive_file_id: driveFileId,
      drive_web_view_url: driveWebViewUrl,
      status: 'DRAFT',
      version: nextVersion,
      content,
      description,
      ...(metadataPayload ? { metadata: metadataPayload as unknown as Json } : {}),
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
