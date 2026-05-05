// ──────────────────────────────────────────────────────────────────────────────
// components/assets/AssetProvenanceChip.tsx
// Renders the provenance line(s) at the top of AssetDrawer.
// Shows: who created (🤖 agent / 👤 director / ⚙️ system) · when · source
//        + last edited (if any) · mode_at_time icon for both
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import type { AssetProvenance } from '@/lib/api/series-bible';

/** ISO date → "2026-05-02 14:32" */
function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

const KIND_ICON: Record<'agent' | 'director' | 'system', string> = {
  agent: '🤖',
  director: '👤',
  system: '⚙️',
};

function modeBadge(mode: number | undefined): string {
  if (mode === 1) return ' · Mode 1';
  if (mode === 2) return ' · Mode 2';
  if (mode === 3) return ' · Mode 3';
  if (mode === 4) return ' · Mode 4';
  return '';
}

export function AssetProvenanceChip({ prov }: { prov: AssetProvenance | undefined }) {
  if (!prov) {
    return (
      <div className="text-xs text-text-muted italic">
        No provenance recorded (legacy asset)
      </div>
    );
  }
  const createdIcon = KIND_ICON[prov.created_by_kind];
  const editedIcon = prov.last_modified_by_kind ? KIND_ICON[prov.last_modified_by_kind] : '';
  return (
    <div className="space-y-1 text-xs text-text-secondary">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span>{createdIcon}</span>
        <span>
          Created by <span className="text-text-primary font-medium">{prov.created_by}</span>
        </span>
        <span className="text-text-muted">·</span>
        <span className="font-mono">{fmtDate(prov.created_at)}</span>
        <span className="text-text-muted">·</span>
        <span className="text-text-muted">
          {prov.source.replace(/_/g, ' ')}
          {modeBadge(prov.mode_at_time)}
        </span>
      </div>
      {prov.last_modified_at && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span>{editedIcon}</span>
          <span>
            Last edited by{' '}
            <span className="text-text-primary font-medium">{prov.last_modified_by ?? '—'}</span>
          </span>
          <span className="text-text-muted">·</span>
          <span className="font-mono">{fmtDate(prov.last_modified_at)}</span>
          <span className="text-text-muted">{modeBadge(prov.last_modified_mode)}</span>
        </div>
      )}
    </div>
  );
}
