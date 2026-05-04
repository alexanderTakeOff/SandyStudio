// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/image-gen-multi.ts
// Provider-agnostic interface for multi-image conditioning generation.
//
// Why an abstraction layer:
//   - EREF v2 must compose 0..N Bible LOCKED references per shot (Director's
//     directive: "multi-character by design"). Single-image-anchor was the
//     root cause of Vial drift in v1.
//   - Provider quality varies wildly per scene type. gpt-image-1 edits is
//     identity-locked (good for keeping Sandy looking like Sandy, bad for
//     dynamic emotion). Flux Pro Ultra has tunable strength — text wins more.
//     Director must be able to switch providers per stage / per shot without
//     code change.
//
// The runner picks one provider via `app_config.eref_provider`. The
// Director's QC console (Phase F) exposes a "SWITCH PROVIDER & REGENERATE"
// action that re-runs a single shot through a different provider — possible
// only because both implementations satisfy the same contract.
//
// First two implementations:
//   - openai-edits-multi.ts  → gpt-image-1 image edits, up to 16 ref images
//   - flux-pro-ultra-fal.ts  → fal.ai Flux Pro 1.1 Ultra Redux + tunable strength
// ──────────────────────────────────────────────────────────────────────────────

/** Three roles a reference image can play in the conditioning. */
export type MultiImageRefKind = 'identity' | 'location' | 'style';

export interface MultiImageRef {
  kind: MultiImageRefKind;
  /** Bible asset id (audit). */
  bible_asset_id: string;
  /** Base64-encoded source image (no `data:` URI prefix). */
  image_b64: string;
  /** 0..1 — only used by providers that support per-ref weighting. */
  weight?: number;
}

export interface MultiImageGenInput {
  /** Composed prompt (already merged with Bible canon and shot details). */
  prompt: string;
  references: MultiImageRef[];
  /**
   * 0..1 text↔image balance. Higher = follow references more closely.
   * Lower = follow text prompt more (loosens identity-lock so emotion/action
   * can override the anchor's stoic baseline). Provider-specific:
   *   - openai-edits-multi : ignored (parameter not exposed by API)
   *   - flux-pro-ultra-fal : `image_prompt_strength`, default 0.6
   */
  strength?: number;
  /**
   * Output size hint. EREF default `1024x1024`. 4K is delivered by the
   * separate upscale provider (Phase E.5), not by the gen provider.
   */
  size?: '1024x1024' | '1024x1536' | '1536x1024' | '2048x2048' | '2752x1536' | '1536x2752';
  quality?: 'low' | 'medium' | 'high';
}

export interface MultiImageGenResult {
  /** Base64 PNG/JPEG (no `data:` URI prefix). */
  b64_data: string;
  cost_usd: number;
  width: number;
  height: number;
  /** Provider id, e.g. 'openai-edits-multi' or 'flux-pro-1.1-ultra'. */
  provider_id: string;
  /** Underlying model identifier — for telemetry / activity feed. */
  model: string;
  /** Provider may rewrite the prompt internally; surface here for debug. */
  revised_prompt?: string;
}

export interface MultiImageGenCapabilities {
  /** Maximum simultaneous reference images the provider accepts. */
  max_references: number;
  /** True if `strength` parameter is honoured. */
  supports_strength: boolean;
  /** True if per-reference `weight` is honoured. */
  supports_per_ref_weight: boolean;
  /**
   * Default text↔image strength when `MultiImageGenInput.strength` is
   * omitted. Providers that ignore strength should still expose a number
   * for consistency.
   */
  default_strength: number;
}

export interface MultiImageGenProvider {
  /** Stable id used in `app_config` and asset metadata. */
  id: string;
  capabilities: MultiImageGenCapabilities;
  generate(input: MultiImageGenInput): Promise<MultiImageGenResult>;
}

export class MultiImageGenError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MultiImageGenError';
  }
}
