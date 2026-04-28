import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';

export default function EpisodesPage() {
  return (
    <StudioContentFrame>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Episodes</h1>
        <p className="text-sm text-text-secondary mt-1">List of all episodes across series.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Coming in Phase 5</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-text-secondary">
            Wires to <code className="text-text-primary">/api/episodes</code> once Phase 5 lands.
          </p>
        </CardBody>
      </Card>
    </StudioContentFrame>
  );
}
