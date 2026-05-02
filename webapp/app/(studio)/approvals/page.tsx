// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/approvals/page.tsx — redirect to /inbox.
// In Phase 5c the Approval Queue was renamed to Director Inbox per
// director_inbox.md. This stub keeps the old URL working as a 308 redirect.
// ──────────────────────────────────────────────────────────────────────────────

import { redirect } from 'next/navigation';

export default function ApprovalsRedirect() {
  redirect('/inbox');
}
