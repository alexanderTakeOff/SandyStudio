// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/layout.tsx
// Wraps every authenticated studio route in the StudioShell. Auth is enforced
// by middleware.ts; this layout assumes the user is signed in.
// ──────────────────────────────────────────────────────────────────────────────

import { StudioShell } from '@/components/studio-shell/StudioShell';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  // Read app_config for governance mode (optional — defaults shown if missing).
  let governanceMode: 1 | 2 | 3 | 4 = 1;
  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase
      .from('app_config')
      .select('value')
      .eq('scope', 'governance')
      .eq('key', 'mode')
      .maybeSingle();
    const row = result.data as { value: unknown } | null;
    const raw = row?.value;
    if (typeof raw === 'number' && raw >= 1 && raw <= 4) {
      governanceMode = raw as 1 | 2 | 3 | 4;
    }
  } catch {
    // Schema may not be seeded yet — fall back to MANUAL.
  }

  return (
    <StudioShell governanceMode={governanceMode} systemMode="===1===">
      {children}
    </StudioShell>
  );
}
