import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';

export default function JobsPage() {
  return (
    <StudioContentFrame>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Jobs</h1>
        <p className="text-sm text-text-secondary mt-1">
          Live Inngest run state per agent.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Coming in Phase 5–6</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-text-secondary">
            Reads from <code className="text-text-primary">jobs</code> table; live updates via
            Supabase Realtime once Inngest worker lands in Phase 3.
          </p>
        </CardBody>
      </Card>
    </StudioContentFrame>
  );
}
