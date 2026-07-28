// ──────────────────────────────────────────────────────────────────────────────
// lib/api/asset-decision.ts
// One client-side entry point for POST /api/assets/[id]/approve, plus the shared
// shape of the critic-verdict block that route can answer with.
//
// Why this exists (E33 audit, 2026-07-29): the approve route now REFUSES an EREF
// image whose own critic froze `REGENERATE` / on-model `FAIL`. That gate is
// correct, but every Director-facing surface had its own bare `fetch` — two of
// them (Inbox page, dashboard Inbox zone) never even read `res.ok`, so the
// refusal was swallowed and Approve simply did nothing. A gate the human cannot
// see is indistinguishable from a broken button.
//
// So: ONE poster that (a) always surfaces the server's reason, and (b) raises a
// typed `CriticVerdictBlockedError` carrying the critic's own words, which the
// surfaces render through `CriticVerdictOverrideModal`. The escape hatch —
// `eref_options.override_critic_verdict` — is reachable ONLY after that refusal
// has been shown, and is recorded in the `approval_granted` event metadata.
//
// NOTE: the override flag is deliberately NOT `directorConfirm`. Polina's
// `approveAsset` tool always sends `directorConfirm: true`, so riding on it
// would leave the bypass permanently on — the exact defect this gate closes.
// ──────────────────────────────────────────────────────────────────────────────

export type AssetDecisionVerb =
  | 'APPROVE'
  | 'REQUEST_REVISION'
  | 'REJECT'
  | 'NEEDS_HUMAN_TWEAK';

/** One frozen critic verdict that holds an asset back, in Director-facing words. */
export interface CriticFailure {
  /** Which critic froze it, e.g. "Reference critic" / "On-model gate (strict)". */
  critic: string;
  /** The frozen verdict token, e.g. `REGENERATE` / `FAIL`. */
  verdict: string;
  /** What the critic actually wrote. Empty when it left no text. */
  detail: string;
}

/** Thrown when the approve route refused because a critic verdict says "do not ship". */
export class CriticVerdictBlockedError extends Error {
  readonly failures: readonly CriticFailure[];

  constructor(message: string, failures: readonly CriticFailure[]) {
    super(message);
    this.name = 'CriticVerdictBlockedError';
    this.failures = failures;
  }
}

export interface AssetDecisionBody {
  decision: AssetDecisionVerb;
  note?: string;
  preview_acknowledged?: boolean;
  directorConfirm?: boolean;
  eref_options?: {
    skip_upscale?: boolean;
    /** Deliberate, recorded override of a failed critic verdict. */
    override_critic_verdict?: boolean;
  };
}

/**
 * POST the Director's decision. Resolves on success; throws
 * `CriticVerdictBlockedError` when a critic verdict holds the asset, and a plain
 * `Error` (carrying the server's message) for every other refusal.
 */
export async function postAssetDecision(
  assetId: string,
  body: AssetDecisionBody,
): Promise<void> {
  const res = await fetch(`/api/assets/${encodeURIComponent(assetId)}/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return;
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    details?: unknown;
  };
  const message = json.error ?? `${body.decision} failed (${res.status})`;
  const failures = readCriticFailures(json.details);
  if (failures) throw new CriticVerdictBlockedError(message, failures);
  throw new Error(message);
}

/** The same decision, re-sent knowingly over the critics' verdict. */
export function withCriticOverride(body: AssetDecisionBody): AssetDecisionBody {
  return {
    ...body,
    eref_options: { ...body.eref_options, override_critic_verdict: true },
  };
}

/** Read `details.critic_failures` off the error envelope. Null when absent/malformed. */
function readCriticFailures(details: unknown): CriticFailure[] | null {
  if (!details || typeof details !== 'object') return null;
  const raw = (details as { critic_failures?: unknown }).critic_failures;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const failures = raw.flatMap((entry): CriticFailure[] => {
    if (!entry || typeof entry !== 'object') return [];
    const { critic, verdict, detail } = entry as Record<string, unknown>;
    if (typeof critic !== 'string' || typeof verdict !== 'string') return [];
    return [{ critic, verdict, detail: typeof detail === 'string' ? detail : '' }];
  });
  return failures.length > 0 ? failures : null;
}
