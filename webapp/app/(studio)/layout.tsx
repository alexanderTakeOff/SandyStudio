// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/layout.tsx
// Wraps every authenticated studio route in the StudioShell. Auth is enforced
// by middleware.ts; this layout assumes the user is signed in.
//
// Reads system_mode and governance_mode_default from app_config (scope=system).
// Falls back to ===1=== / Mode 1 if app_config is missing.
// ──────────────────────────────────────────────────────────────────────────────

import { StudioShell } from '@/components/studio-shell/StudioShell';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  let governanceMode: 1 | 2 | 3 | 4 = 1;
  let systemMode: '===1===' | '===5===' = '===1===';
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('app_config')
      .select('key,value')
      .eq('scope', 'system');
    for (const row of data ?? []) {
      const r = row as { key: string; value: unknown };
      if (r.key === 'governance_mode_default' && typeof r.value === 'number' && r.value >= 1 && r.value <= 4) {
        governanceMode = r.value as 1 | 2 | 3 | 4;
      }
      if (r.key === 'system_mode' && (r.value === '===1===' || r.value === '===5===')) {
        systemMode = r.value;
      }
    }
  } catch {
    // app_config may not be seeded yet
  }

  return (
    <StudioShell governanceMode={governanceMode} systemMode={systemMode}>
      {children}
    </StudioShell>
  );
}
