// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/approvals/page.tsx — Approval Queue placeholder.
// Real implementation per uiux.md §10 lands in Phase 6 (W-003 priority).
// ──────────────────────────────────────────────────────────────────────────────

import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function ApprovalQueuePage() {
  return (
    <StudioContentFrame>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Approval Queue</h1>
          <p className="text-sm text-text-secondary mt-1">
            Sprint priority — full implementation in Phase 6 per uiux.md §10.
          </p>
        </div>
        <Badge cssVar="--accent-warning">0 pending</Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Preview · Context · Decision</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-text-secondary leading-relaxed">
            This page becomes the Director&apos;s decision cockpit:
          </p>
          <ul className="mt-3 text-sm text-text-secondary list-disc list-inside space-y-1">
            <li>Left/center: rendered asset preview (markdown, image, video, audio).</li>
            <li>Right: context panel — episode, version, agent, governance, related job.</li>
            <li>Bottom: APPROVE · REQUEST REVISION · REJECT · MARK NEEDS HUMAN TWEAK.</li>
          </ul>
          <p className="mt-4 text-[10px] uppercase tracking-wider text-text-muted">
            Awaiting agent jobs (Phase 4) and API endpoints (Phase 5).
          </p>
        </CardBody>
      </Card>
    </StudioContentFrame>
  );
}
