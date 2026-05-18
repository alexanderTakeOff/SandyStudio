// Cancel E21 EREF fanout directly via setErefCancel + setPilotState.
// Director directive 2026-05-15: pause generation while architectural
// skill/rule consumer-mismatch is audited.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[line.slice(0, eq).trim()] = val;
  }
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const EP = '21f7bd6a-f52c-4ae0-bd47-06ff328ec6e7';

(async () => {
  // 1. Set cancel flag in app_config — runner checks this between shots.
  const cancelKey = `eref_cancel:${EP}`;
  const { error: cErr } = await sb.from('app_config').upsert(
    {
      scope: 'app',
      key: cancelKey,
      value: { cancelled: true, by: 'claude-cli', at: new Date().toISOString(), reason: 'Director directive — architectural audit pause' } as never,
      source: 'ui_edit',
    } as never,
    { onConflict: 'scope,key' },
  );
  if (cErr) throw new Error(`eref_cancel set failed: ${cErr.message}`);
  console.log('✓ eref_cancel flag set');

  // 2. Flip pilot state back to a stable value so UI doesn't show running pulsing.
  const stateKey = `eref_pilot_state:${EP}`;
  await sb.from('app_config').upsert({
    scope: 'app',
    key: stateKey,
    value: { state: 'PENDING_REVIEW', at: new Date().toISOString(), note: 'Director paused fanout for architectural audit' } as never,
    source: 'ui_edit',
  } as never, { onConflict: 'scope,key' });
  console.log('✓ pilot_state → PENDING_REVIEW (cancelled fanout)');

  // 3. Mirror into episode.metadata for UI.
  const { data: epRow } = await sb.from('episodes').select('metadata').eq('id', EP).maybeSingle();
  const prevMeta = ((epRow as { metadata?: unknown } | null)?.metadata as Record<string, unknown> | null) ?? {};
  const nextMeta = {
    ...prevMeta,
    eref_pilot_state: 'PENDING_REVIEW' as const,
    eref_pilot_state_at: new Date().toISOString(),
    eref_paused_for_audit: true,
    eref_paused_at: new Date().toISOString(),
    eref_pause_reason: 'Architectural audit — skill/rule consumer mismatch identified by Director',
  };
  await sb.from('episodes').update({ metadata: nextMeta as never }).eq('id', EP);
  console.log('✓ episode.metadata mirrored');

  // 4. Activity event for audit trail.
  await sb.from('activity_events').insert({
    event_type: 'manual_trigger',
    severity: 'warning',
    title: 'EREF fan-out paused — architectural audit',
    description: 'Director paused EREF fanout pending review of skill/rule consumer mismatch. Image-gen prompt was incorrectly receiving full skill body. Architectural audit pending.',
    actor: 'claude-cli',
    episode_id: EP,
    metadata: { kind: 'eref_pause_for_audit' },
  } as never);
  console.log('✓ activity_event logged');
  console.log('\nFanout will abort at next shot boundary. In-flight shot will finish.');
})();
