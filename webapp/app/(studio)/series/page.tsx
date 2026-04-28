import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';

export default function SeriesPage() {
  return (
    <StudioContentFrame>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Series</h1>
        <p className="text-sm text-text-secondary mt-1">
          One row per active series. Approval Authority Matrix lives here.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Coming in Phase 7</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-text-secondary">
            Approval Authority Matrix wizard launches the first time a series is created (W-005).
          </p>
        </CardBody>
      </Card>
    </StudioContentFrame>
  );
}
