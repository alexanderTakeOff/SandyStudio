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

async function main() {
  // PostgREST RPC trick: try to invoke a hypothetical function and inspect the error to confirm we have DB access
  // Better: try using fetch-based REST to query pg_policies via PostgREST views
  // But Supabase doesn't expose pg_policies via PostgREST. We'd need a SECURITY DEFINER function.

  // Alternative: use service-role REST with header
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/__nope__`,
    {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
  );
  console.log('rpc probe:', res.status);

  // Verify policy by testing with a JWT-impersonated user.
  // Use Supabase admin API to issue a JWT for the Director user.
  // For now: test that authenticated role works via PostgREST with `Role` header set to 'authenticated'.
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Build a manual authenticated JWT — Supabase service role JWT contains `role: service_role`.
  // We need a fresh JWT signed with the JWT_SECRET containing role=authenticated.
  // Without the secret we can't forge JWT. Instead — use Supabase auth.admin.createSession or
  // probe via service-role with explicit role header.
  const queryRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/activity_events?select=id&limit=1`,
    {
      headers: {
        'apikey': anonKey,
        // Force RLS to evaluate against the 'authenticated' role even without a user.
        // This won't work with anon role — proves policy gating.
      },
    },
  );
  console.log('anon (no JWT) GET activity_events:', queryRes.status, await queryRes.text().then((t) => t.slice(0, 200)));

  // Now try to issue a JWT for Director user
  // Use auth.admin.listUsers + .updateUserById not — use signInWithPassword if we have it.
  // Or just check by inspecting the migrations table to confirm 0027 was applied.
  const { data: migs } = await sb
    .from('supabase_migrations.schema_migrations' as never)
    .select('*' as never)
    .order('version', { ascending: false } as never)
    .limit(5);
  console.log('\nrecent migrations:', migs);
}
main().catch((e) => { console.error(e); process.exit(1); });
