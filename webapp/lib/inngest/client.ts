// ──────────────────────────────────────────────────────────────────────────────
// lib/inngest/client.ts
// Inngest client singleton — server-side only.
// Local-first per webapp.md §2: in dev, the Inngest dev server (npx inngest-cli
// dev) runs on http://localhost:8288 and signs requests itself; INNGEST_*
// keys are only required for production cloud Inngest.
// ──────────────────────────────────────────────────────────────────────────────

import { Inngest, EventSchemas } from 'inngest';

/**
 * All studio events live under the `sandystudio/*` namespace per webapp.md §4.1.
 * Add new events to this map as agent functions land in Phase 4.
 */
type Events = {
  'sandystudio/ping': {
    data: {
      note?: string;
      episodeId?: string | null;
    };
  };
};

export const inngest = new Inngest({
  id: 'sandystudio',
  schemas: new EventSchemas().fromRecord<Events>(),
});
