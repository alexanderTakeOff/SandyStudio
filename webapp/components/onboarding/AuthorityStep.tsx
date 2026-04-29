// ──────────────────────────────────────────────────────────────────────────────
// components/onboarding/AuthorityStep.tsx
// Step 3 — Approval Authority Matrix per onboarding.md §6.
// Defaults already seeded by POST /api/series. This step displays/confirms.
// Phase 7 implements per-row editing UI; Phase 5c reads + advances.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { Lock, User, Bot } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface MatrixRow {
  category: string;
  approver: 'director' | 'exec_dir_ai' | 'human_delegate';
  is_locked: boolean;
}

const CATEGORY_LABEL: Record<string, { emoji: string; label: string }> = {
  character_visual: { emoji: '🖼', label: 'Character visuals' },
  location_ref:     { emoji: '🖼', label: 'Location references' },
  generated_shots:  { emoji: '🎬', label: 'Generated shots' },
  thumbnail:        { emoji: '🖼', label: 'Thumbnails' },
  script:           { emoji: '📄', label: 'Scripts' },
  storyboard:       { emoji: '📋', label: 'Storyboards' },
  music:            { emoji: '🎵', label: 'Music / audio' },
  metadata:         { emoji: '📑', label: 'Metadata / SEO copy' },
  publish:          { emoji: '📤', label: 'Publish to YouTube' },
};

const ORDER: string[] = [
  'character_visual', 'location_ref', 'generated_shots', 'thumbnail',
  'script', 'storyboard', 'music', 'metadata', 'publish',
];

interface AuthorityStepProps {
  seriesId: string;
  onAdvance: () => void;
}

export function AuthorityStep({ seriesId, onAdvance }: AuthorityStepProps) {
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch(`/api/series/${seriesId}`)
      .then((r) => r.json())
      .then((j: { data?: { authority_matrix?: MatrixRow[] } }) => {
        setRows(j.data?.authority_matrix ?? []);
      });
  }, [seriesId]);

  async function next() {
    setPending(true);
    await fetch('/api/onboarding/advance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ step: 3 }),
    });
    setPending(false);
    onAdvance();
  }

  const rowMap = new Map(rows.map((r) => [r.category, r]));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Who approves what?</h2>
        <p className="text-sm text-text-secondary mt-1">
          Set once. Override per episode later. Visual + Publish are locked to Director per
          character_consistency.md §3.3 and CLAUDE.md §6 hard limits.
        </p>
      </div>

      <div className="rounded-xl border border-glass overflow-hidden">
        {ORDER.map((cat) => {
          const row = rowMap.get(cat);
          const def = CATEGORY_LABEL[cat]!;
          const approver = row?.approver ?? 'director';
          const locked = row?.is_locked ?? false;
          return (
            <div
              key={cat}
              className="flex items-center justify-between gap-3 px-4 py-3 border-b border-glass last:border-0 bg-panel-glass-strong"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-lg shrink-0">{def.emoji}</span>
                <span className="text-sm font-medium text-text-primary">{def.label}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {approver === 'director' ? (
                  <span className="inline-flex items-center gap-1 text-text-primary">
                    <User size={12} /> Director
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[var(--accent-secondary)]">
                    <Bot size={12} /> EXEC-DIR-AI
                  </span>
                )}
                {locked && (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded uppercase tracking-wider text-[10px]"
                    style={{
                      background: 'color-mix(in oklab, var(--accent-warning) 14%, transparent)',
                      color: 'var(--accent-warning)',
                    }}
                  >
                    <Lock size={9} /> locked
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-text-muted">
        Per-row editing UI lands in Phase 7 — defaults shown here apply now. EXEC-DIR-AI
        rows act only when governance Mode is 2 (HYBRID) or 3 (DELEGATED).
      </p>

      <div className="flex justify-end pt-3">
        <Button onClick={next} disabled={pending}>
          {pending ? 'Saving…' : 'Continue →'}
        </Button>
      </div>
    </div>
  );
}
