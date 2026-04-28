// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/page.tsx — Dashboard placeholder.
// Real implementation lands in Phase 6 (uiux.md §9).
// ──────────────────────────────────────────────────────────────────────────────

import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';

const SECTIONS = [
  { title: 'Active Episodes',    body: 'Pipeline view of every in-flight episode.' },
  { title: 'Pending Approvals',  body: 'Items waiting on a Director or delegate decision.' },
  { title: 'Budget Snapshot',    body: 'Per-episode spend vs. ceiling.' },
  { title: 'Recent Jobs',        body: 'Latest Inngest runs, success/failure rate.' },
  { title: 'Output Queue',       body: 'Assets queued for staging or publish.' },
  { title: 'System Health',      body: 'Provider availability, gateway status.' },
];

export default function DashboardPage() {
  return (
    <StudioContentFrame>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-secondary mt-1">
          Production overview. Real data wires up in Phase 5–6.
        </p>
      </header>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECTIONS.map((s) => (
          <Card key={s.title}>
            <CardHeader>
              <CardTitle>{s.title}</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-text-secondary leading-relaxed">{s.body}</p>
              <p className="mt-3 text-[10px] uppercase tracking-wider text-text-muted">
                Placeholder · Phase 6
              </p>
            </CardBody>
          </Card>
        ))}
      </div>
    </StudioContentFrame>
  );
}
