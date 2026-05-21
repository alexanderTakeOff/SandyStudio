// One-off status check after /clear resume for SS-S15-E01.
// Reports: STB v04 state, recent activity_events, Designer SPC-ref_plan assets, concierge auto_react turns.
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[line.slice(0, eq).trim()] = val;
  }
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function fmt(d: string | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

(async () => {
  console.log('\n=== 1. STB assets for SS-S15-E01 (latest 6) ===');
  {
    const { data, error } = await sb
      .from('assets')
      .select('id,filename,status,created_at,description')
      .like('filename', 'SS-S15-E01-STB-storyboard-%')
      .order('created_at', { ascending: false })
      .limit(6);
    if (error) console.error(error);
    else if (!data || data.length === 0) console.log('  (no rows)');
    else {
      for (const r of data) {
        const desc = (r.description ?? '') as string;
        const opus = desc.includes('claude-opus-4-7') ? 'OPUS' : desc.includes('sonnet-4-6') ? 'sonnet' : '?';
        console.log(`  ${fmt(r.created_at)}  ${r.status.padEnd(10)} ${opus.padEnd(7)} ${r.filename}`);
      }
    }
  }

  console.log('\n=== 2. Activity events (last 30) ===');
  {
    const { data, error } = await sb
      .from('activity_events')
      .select('created_at,event_type,actor,asset_id,title,description,metadata')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) console.error(error);
    else if (!data || data.length === 0) console.log('  (no rows)');
    else {
      for (const r of data) {
        const ev = r.event_type as string;
        const actor = (r.actor ?? '-') as string;
        const aid = r.asset_id ? String(r.asset_id).slice(0, 8) : '-       ';
        const title = String(r.title ?? '').slice(0, 50);
        console.log(`  ${fmt(r.created_at)}  ${ev.padEnd(22)} ${actor.padEnd(25)} a:${aid}  ${title}`);
      }
    }
  }

  console.log('\n=== 3. Designer SPC-ref_plan assets for SS-S15-E01 ===');
  {
    const { data, error } = await sb
      .from('assets')
      .select('id,filename,status,file_type,created_at')
      .like('filename', 'SS-S15-E01-SPC-ref_plan-%')
      .order('created_at', { ascending: false })
      .limit(25);
    if (error) console.error(error);
    else if (!data || data.length === 0) console.log('  (no rows — Designer not yet retriggered)');
    else {
      for (const r of data) {
        console.log(`  ${fmt(r.created_at)}  ${(r.status as string).padEnd(10)} ${r.filename}`);
      }
    }
  }

  console.log('\n=== 4. concierge_turns (last 15) ===');
  {
    const { data, error } = await sb
      .from('concierge_turns')
      .select('created_at,role,content,metadata')
      .order('created_at', { ascending: false })
      .limit(15);
    if (error) console.error(error);
    else if (!data || data.length === 0) console.log('  (no rows)');
    else {
      for (const r of data) {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        const autoReact = meta.auto_react ? 'AUTO' : '    ';
        const agent = (meta.agent_id as string | undefined) ?? '-';
        const preview = String(r.content ?? '').replace(/\s+/g, ' ').slice(0, 80);
        console.log(`  ${fmt(r.created_at)}  ${(r.role as string).padEnd(9)} ${autoReact} a:${agent.padEnd(20)} ${preview}`);
      }
    }
  }

  console.log('\n=== 5. Designer fanout pending (on REV-world_check / REV-script_qa assets) ===');
  {
    // The fanout pending list lives on the parent REV asset's metadata after approve.
    const { data, error } = await sb
      .from('assets')
      .select('id,filename,status,metadata,updated_at')
      .like('filename', 'SS-S15-E01-REV-%')
      .order('updated_at', { ascending: false })
      .limit(10);
    if (error) console.error(error);
    else if (!data || data.length === 0) console.log('  (no REV rows)');
    else {
      for (const r of data) {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        const pending = (meta.designer_fanout_pending as string[] | undefined) ?? null;
        const pilots = meta.designer_pilot_count;
        const total = meta.designer_fanout_total;
        console.log(`  ${fmt(r.updated_at)}  ${(r.status as string).padEnd(10)} ${r.filename}`);
        if (pending !== null) {
          console.log(`    pending=${pending.length} pilots=${pilots} total=${total}`);
          if (pending.length > 0) console.log(`    first 3 shotIds: ${pending.slice(0, 3).join(', ')}`);
        }
      }
    }
  }

  process.exit(0);
})();
