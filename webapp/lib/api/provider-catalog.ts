// ──────────────────────────────────────────────────────────────────────────────
// lib/api/provider-catalog.ts
// Minimal in-memory catalog of providers per contract for the Settings UI.
// Keeps the dropdown options + env keys + adapter availability flags.
//
// Single source of truth until /settings/providers grows beyond MVP — at which
// point this graduates into a generated catalog from config/providers.yaml.
// ──────────────────────────────────────────────────────────────────────────────

export type ContractName =
  | 'image'
  | 'video'
  | 'character_video'
  | 'music'
  | 'sfx'
  | 'storage'
  | 'publish';

export interface ProviderCandidate {
  id: string;
  display_name: string;
  vendor: string;
  envKey: string | null;
  /** True iff a real adapter is wired in `lib/agents/providers/`. */
  adapter_ready: boolean;
  /** Hint for cost; informational only. */
  cost_hint?: string;
}

export type ProviderCatalog = Record<ContractName, ProviderCandidate[]>;

const MOCK: ProviderCandidate = {
  id: 'mock',
  display_name: 'Mock (deterministic stub)',
  vendor: 'sandystudio',
  envKey: null,
  adapter_ready: true,
  cost_hint: 'free',
};

export function getProviderCatalog(): ProviderCatalog {
  return {
    image: [
      MOCK,
      {
        id: 'gpt-image-1',
        display_name: 'gpt-image-1',
        vendor: 'OpenAI',
        envKey: 'OPENAI_API_KEY',
        adapter_ready: true,
        cost_hint: '~$0.04 / image (medium 1536×1024)',
      },
      {
        id: 'flux-pro',
        display_name: 'Flux Pro',
        vendor: 'fal.ai',
        envKey: 'FAL_AI_KEY',
        adapter_ready: false,
        cost_hint: '~$0.055 / image',
      },
      {
        id: 'imagen-3',
        display_name: 'Imagen 3',
        vendor: 'Google Vertex AI',
        envKey: 'GOOGLE_REFRESH_TOKEN',
        adapter_ready: false,
      },
      {
        id: 'dall-e-3',
        display_name: 'DALL·E 3',
        vendor: 'OpenAI',
        envKey: 'OPENAI_API_KEY',
        adapter_ready: false,
      },
    ],
    video: [
      MOCK,
      {
        id: 'veo-3',
        display_name: 'Veo 3.1 (text-to-video)',
        vendor: 'Google AI Studio (Gemini API)',
        envKey: 'GEMINI_API_KEY',
        adapter_ready: true,
        cost_hint: '~$0.15 / second (standard) · ~$0.075 (fast)',
      },
      {
        id: 'runway-gen4',
        display_name: 'Runway Gen-4',
        vendor: 'Runway ML',
        envKey: 'RUNWAY_API_KEY',
        adapter_ready: false,
      },
    ],
    character_video: [
      MOCK,
      {
        id: 'veo-3-img2vid',
        display_name: 'Veo 3 (image-to-video)',
        vendor: 'Google AI Studio (Gemini API)',
        envKey: 'GEMINI_API_KEY',
        adapter_ready: true,
        cost_hint: '~$0.15 / second (with reference image, when wired in PA-001)',
      },
      {
        id: 'kling-3-elements',
        display_name: 'Kling 3.0 Elements',
        vendor: 'Kuaishou',
        envKey: 'KLING_API_KEY',
        adapter_ready: false,
        cost_hint: '~$0.12 / second',
      },
      {
        id: 'runway-gen4-ref',
        display_name: 'Runway Gen-4 (reference)',
        vendor: 'Runway ML',
        envKey: 'RUNWAY_API_KEY',
        adapter_ready: false,
      },
    ],
    music: [
      MOCK,
      {
        id: 'beatoven',
        display_name: 'Beatoven.ai',
        vendor: 'Beatoven',
        envKey: 'BEATOVEN_API_KEY',
        adapter_ready: false,
        cost_hint: '~$0.20 / track',
      },
      {
        id: 'suno',
        display_name: 'Suno (unofficial)',
        vendor: 'Suno',
        envKey: 'SUNO_API_KEY',
        adapter_ready: false,
      },
    ],
    sfx: [
      MOCK,
      {
        id: 'elevenlabs-sfx',
        display_name: 'ElevenLabs SFX',
        vendor: 'ElevenLabs',
        envKey: 'ELEVENLABS_API_KEY',
        adapter_ready: false,
        cost_hint: '~$0.01 / sfx',
      },
    ],
    storage: [
      MOCK,
      {
        id: 'drive_native',
        display_name: 'Google Drive',
        vendor: 'Google',
        envKey: 'GOOGLE_REFRESH_TOKEN',
        adapter_ready: true,
        cost_hint: 'free (storage uses Drive quota)',
      },
    ],
    publish: [
      MOCK,
      {
        id: 'youtube_data_api',
        display_name: 'YouTube Data API v3',
        vendor: 'Google',
        envKey: 'YOUTUBE_REFRESH_TOKEN',
        adapter_ready: false,
      },
    ],
  };
}
