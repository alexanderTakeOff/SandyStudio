// ──────────────────────────────────────────────────────────────────────────────
// components/jobs/JobsActionsBar.tsx
// Send-ping + refresh actions for the Jobs page (Phase 3 smoke test).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function JobsActionsBar() {
  const router = useRouter();
  const [pinging, setPinging] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function sendPing() {
    setPinging(true);
    setError(null);
    try {
      const res = await fetch('/api/jobs/ping', { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text || 'unknown'}`);
      }
      // Give Inngest ~700 ms to ack + insert the row, then refresh.
      setTimeout(() => startTransition(() => router.refresh()), 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'send failed');
    } finally {
      setPinging(false);
    }
  }

  return (
    <div className="flex items-end gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
      >
        <RefreshCcw size={14} className={pending ? 'animate-spin' : ''} />
        Refresh
      </Button>
      <Button onClick={sendPing} size="sm" disabled={pinging || pending}>
        <Send size={14} />
        {pinging ? 'Sending…' : 'Send ping'}
      </Button>
      {error && (
        <span className="text-xs text-[var(--accent-danger)] ml-2 self-center">{error}</span>
      )}
    </div>
  );
}
