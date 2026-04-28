import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';

export default function BudgetPage() {
  return (
    <StudioContentFrame>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Budget</h1>
        <p className="text-sm text-text-secondary mt-1">
          Per-call log, cumulative chart, hard ceilings.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Coming in Phase 6</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-text-secondary">
            Reads from <code className="text-text-primary">budget_log</code> (already in schema).
            BOARD-FIN enforces the hard ceilings from <code className="text-text-primary">.env</code>.
          </p>
        </CardBody>
      </Card>
    </StudioContentFrame>
  );
}
