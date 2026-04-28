// ──────────────────────────────────────────────────────────────────────────────
// components/ui/StatusChip.tsx
// Reads STATUS_CHIP_MAP from lib/uiux/taxonomy.ts. Colors come from theme tokens.
// ──────────────────────────────────────────────────────────────────────────────

import { cn } from '@/lib/utils';
import { STATUS_CHIP_MAP } from '@/lib/uiux/taxonomy';
import type { AssetStatusCode } from '@/lib/uiux/types';

const VARIANT_VAR: Record<string, string> = {
  draft:    '--status-draft',
  review:   '--status-review',
  revision: '--status-revision',
  approved: '--status-approved',
  locked:   '--status-locked',
  warning:  '--status-warning',
  danger:   '--status-danger',
  muted:    '--status-muted',
};

interface StatusChipProps {
  status: AssetStatusCode;
  className?: string;
}

export function StatusChip({ status, className }: StatusChipProps) {
  const meta = STATUS_CHIP_MAP[status];
  const cssVar = VARIANT_VAR[meta.variant] ?? '--text-secondary';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider',
        className,
      )}
      style={{
        background: `color-mix(in oklab, var(${cssVar}) 18%, transparent)`,
        color: `var(${cssVar})`,
        border: `1px solid color-mix(in oklab, var(${cssVar}) 40%, transparent)`,
      }}
    >
      {meta.label}
    </span>
  );
}
