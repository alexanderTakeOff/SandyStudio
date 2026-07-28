// ──────────────────────────────────────────────────────────────────────────────
// components/assets/StyleGuardianBadge.tsx
// Small inline chip rendered in the prompt section of AssetDrawer to show
// the latest Style Guardian verdict for the current prompt+asset.
//
// Pre-flights through POST /api/style-check and renders:
//   PASS — green check chip (collapsed unless hovered)
//   WARN — amber chip with first issue note
//   FAIL — red chip + reason (and Override hint if mode=strict)
//
// Polls when prompt or assetId changes (debounced). Skips when seriesId is null.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Loader2 } from 'lucide-react';
import type { StyleCheckResult } from '@/lib/agents/runners/style-check';
import type { StyleGuardianMode } from '@/lib/api/style-guardian-config';

/**
 * Exactly what POST /api/style-check returns: the runner's result spread, plus
 * the current guardian mode. Composed from the two sources of truth instead of
 * being re-declared — the hand-copied version had drifted, still carrying the
 * deleted `suggested_prompt` field and an `auto_rewrite` mode that no longer
 * exists (E33 P0 #1 removed both). Type-only imports: nothing ships to the client.
 */
type StyleCheckResponse = StyleCheckResult & {
  style_guardian_mode: StyleGuardianMode;
};

export interface StyleGuardianBadgeProps {
  prompt: string;
  assetType: string;
  seriesId: string | null;
}

export function StyleGuardianBadge({ prompt, assetType, seriesId }: StyleGuardianBadgeProps) {
  const [result, setResult] = useState<StyleCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seriesId || !prompt.trim()) {
      setResult(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/style-check', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt, asset_type: assetType, series_id: seriesId }),
        });
        if (!res.ok) {
          if (!cancelled) setError(`HTTP ${res.status}`);
          return;
        }
        const j = (await res.json()) as { data: StyleCheckResponse };
        if (!cancelled) setResult(j.data);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 800); // debounce
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [prompt, assetType, seriesId]);

  if (!seriesId) return null;

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
        <Loader2 size={11} className="animate-spin" />
        style guardian…
      </span>
    );
  }

  if (error) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-text-muted" title={error}>
        <Shield size={11} />
        guardian unavailable
      </span>
    );
  }

  if (!result) return null;
  if (result.skipped) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] text-text-muted"
        title={result.skipped_reason ?? 'Skipped'}
      >
        <Shield size={11} />
        guardian skipped
      </span>
    );
  }

  const COLOR: Record<string, string> = {
    PASS: 'var(--accent-success)',
    WARN: 'var(--accent-warning, #d97706)',
    FAIL: 'var(--accent-danger)',
  };
  const Icon = result.verdict === 'PASS' ? ShieldCheck : ShieldAlert;
  const c = COLOR[result.verdict];

  const tooltip =
    result.issues.length === 0
      ? `Style guardian: ${result.verdict} (${result.score}/100). No issues.`
      : `Style guardian: ${result.verdict} (${result.score}/100)\n\n` +
        result.issues
          .slice(0, 5)
          .map((i) => `• [${i.severity}] ${i.field}: ${i.note}`)
          .join('\n');
  const blockingHint =
    result.verdict === 'FAIL' && result.style_guardian_mode === 'strict'
      ? ' · regenerate would be blocked'
      : '';
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium"
      style={{ color: c }}
      title={tooltip}
    >
      <Icon size={11} />
      guardian: {result.verdict.toLowerCase()} {result.score}{blockingHint}
    </span>
  );
}
