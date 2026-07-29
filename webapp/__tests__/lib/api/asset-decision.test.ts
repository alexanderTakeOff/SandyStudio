// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/api/asset-decision.test.ts
// The client-side half of the critic-verdict gate (E33 audit, 2026-07-29).
//
// What must hold: a refusal is never swallowed, a critic-verdict refusal is
// distinguishable from every other refusal (so the UI can offer the deliberate
// override instead of a red string), and the override rides the SAME body the
// Director already submitted — it must not quietly drop skip_upscale or the note.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  postAssetDecision,
  withCriticOverride,
  CriticVerdictBlockedError,
  type AssetDecisionBody,
} from '@/lib/api/asset-decision';

const ORIG_FETCH = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  globalThis.fetch = ORIG_FETCH;
  vi.restoreAllMocks();
});

describe('postAssetDecision', () => {
  it('resolves and posts the body to the asset approve route', async () => {
    let seenUrl = '';
    let seenBody: unknown = null;
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ success: true, data: {} });
    }) as unknown as typeof fetch;

    await postAssetDecision('asset-1', { decision: 'APPROVE', preview_acknowledged: true });

    expect(seenUrl).toBe('/api/assets/asset-1/approve');
    expect(seenBody).toEqual({ decision: 'APPROVE', preview_acknowledged: true });
  });

  it('throws a plain Error carrying the server message on a non-critic refusal', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ success: false, error: 'Governance gate refused' }, 409),
    ) as unknown as typeof fetch;

    await expect(postAssetDecision('asset-1', { decision: 'APPROVE' })).rejects.toThrow(
      'Governance gate refused',
    );
    await expect(
      postAssetDecision('asset-1', { decision: 'APPROVE' }),
    ).rejects.not.toBeInstanceOf(CriticVerdictBlockedError);
  });

  it('throws CriticVerdictBlockedError with the critic verdicts when the gate holds the asset', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(
        {
          success: false,
          error: 'SS-S01-E33-IMG-... did not clear its own critics',
          details: {
            critic_failures: [
              {
                critic: 'Reference critic',
                verdict: 'REGENERATE',
                detail: 'CRITICAL: lighting is daytime',
              },
              { critic: 'On-model gate (strict)', verdict: 'FAIL', detail: 'silhouette drift' },
            ],
          },
        },
        400,
      ),
    ) as unknown as typeof fetch;

    const err = await postAssetDecision('asset-1', { decision: 'APPROVE' }).catch((e) => e);

    expect(err).toBeInstanceOf(CriticVerdictBlockedError);
    expect((err as CriticVerdictBlockedError).failures).toEqual([
      { critic: 'Reference critic', verdict: 'REGENERATE', detail: 'CRITICAL: lighting is daytime' },
      { critic: 'On-model gate (strict)', verdict: 'FAIL', detail: 'silhouette drift' },
    ]);
  });

  it('falls back to a plain Error when details.critic_failures is malformed', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ success: false, error: 'nope', details: { critic_failures: [42] } }, 400),
    ) as unknown as typeof fetch;

    const err = await postAssetDecision('asset-1', { decision: 'APPROVE' }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(CriticVerdictBlockedError);
  });
});

describe('withCriticOverride', () => {
  it('sets the override flag without dropping the rest of the decision', () => {
    const body: AssetDecisionBody = {
      decision: 'APPROVE',
      note: 'ship it',
      preview_acknowledged: true,
      eref_options: { skip_upscale: true },
    };

    expect(withCriticOverride(body)).toEqual({
      decision: 'APPROVE',
      note: 'ship it',
      preview_acknowledged: true,
      eref_options: { skip_upscale: true, override_critic_verdict: true },
    });
    // Immutable — the original body is what the surfaces keep for a retry.
    expect(body.eref_options).toEqual({ skip_upscale: true });
  });

  it('does NOT ride on directorConfirm (Polina always sends it true)', () => {
    const overridden = withCriticOverride({ decision: 'APPROVE', directorConfirm: true });
    expect(overridden.eref_options?.override_critic_verdict).toBe(true);

    const plain = { decision: 'APPROVE', directorConfirm: true } as AssetDecisionBody;
    expect(plain.eref_options?.override_critic_verdict).toBeUndefined();
  });
});
