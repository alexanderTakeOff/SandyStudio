import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const epCode = process.argv[2] ?? 'SS-S03-E01';
  const { data: ep } = await sb
    .from('episodes')
    .select('id,episode_code,status')
    .eq('episode_code', epCode)
    .maybeSingle();
  console.log('episode:', ep);
  if (!ep) return;
  const { data: jobs } = await sb
    .from('jobs')
    .select('id,agent_id,status,started_at,completed_at,error_message,error_code')
    .eq('episode_id', ep.id)
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('jobs:', JSON.stringify(jobs, null, 2));
  const { data: assets } = await sb
    .from('assets')
    .select('id,filename,file_type,status,created_at')
    .eq('episode_id', ep.id)
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('assets:', JSON.stringify(assets, null, 2));
  const { data: events } = await sb
    .from('activity_events')
    .select('event_type,severity,title,description,created_at')
    .eq('episode_id', ep.id)
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('events:', JSON.stringify(events, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
