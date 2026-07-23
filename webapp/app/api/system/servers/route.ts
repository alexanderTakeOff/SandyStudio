// ──────────────────────────────────────────────────────────────────────────────
// app/api/system/servers/route.ts
// Emergency server controls (2026-07-23, E31 churn storm).
//
// The definitive churn stop is server-level, not job-row-level: the storm is
// event-driven via Inngest re-fire, and durable Inngest RESUMES un-finished
// runs on the next start unless its SQLite state is parked. Both actions run
// the repo-root launcher scripts (the same ones the desktop shortcut uses):
//
//   stop    → stop-stack.ps1 -Wipe   kill Inngest first, then the app, park
//             the durable DB so the storm cannot resume. Kills THIS app too —
//             the response may never flush; the UI treats that as success.
//   restart → start-stack.ps1        stops whatever runs, starts app+Inngest,
//             re-syncs functions. (No -Build: rebuilding under a live click is
//             a different, deliberate operation.)
//
// Spawned DETACHED (own process group, stdio ignored) so the script survives
// the request — and survives the app it is about to kill.
// ──────────────────────────────────────────────────────────────────────────────

import { spawn } from 'node:child_process';
import path from 'node:path';
import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { logEvent } from '@/lib/api/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  action: z.enum(['stop', 'restart']),
});

// Launcher scripts live at the repo root; the app runs with cwd = webapp/.
const REPO_ROOT = path.resolve(process.cwd(), '..');
const SCRIPT_BY_ACTION: Record<'stop' | 'restart', { file: string; args: string[] }> = {
  stop: { file: 'stop-stack.ps1', args: ['-Wipe'] },
  restart: { file: 'start-stack.ps1', args: [] },
};

export const POST = withApiHandler(async (req) => {
  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, Body);

  const script = SCRIPT_BY_ACTION[body.action];
  const scriptPath = path.join(REPO_ROOT, script.file);

  // Log BEFORE spawning — on 'stop' this process dies moments later.
  await logEvent(supabase, {
    event_type: 'manual_trigger',
    severity: 'warning',
    title: body.action === 'stop' ? 'STOP servers (emergency)' : 'Restart servers',
    description:
      body.action === 'stop'
        ? `Director ${user.email ?? user.id} pressed STOP servers — killing Inngest + app, parking the durable queue (churn cannot resume).`
        : `Director ${user.email ?? user.id} pressed Restart servers — stop + start via start-stack.ps1.`,
    actor: user.id,
    metadata: { kind: 'server_control', action: body.action, script: script.file },
  });

  const child = spawn(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...script.args],
    { cwd: REPO_ROOT, detached: true, stdio: 'ignore', windowsHide: true },
  );
  child.unref();

  return apiOk({ action: body.action, spawned: true });
});
