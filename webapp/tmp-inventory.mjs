// Inventory: episodes + per-episode counts (assets, jobs, activity).
// Read-only.

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = fs.readFileSync('.env.local', 'utf8')
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.+)$`, 'm'))
  return m ? m[1].trim() : null
}
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const { data: eps } = await sb.from('episodes').select('id,episode_code,title_working,status,governance_mode,series_id,budget_spent,created_at').order('created_at')
const { data: series } = await sb.from('series').select('id,code,title')
const sMap = Object.fromEntries((series||[]).map(s => [s.id, s]))

console.log('=== ALL EPISODES (' + (eps?.length||0) + ') ===\n')
for (const e of eps || []) {
  const s = sMap[e.series_id]
  const seriesCode = s?.code || e.series_id
  const { count: assetCount } = await sb.from('assets').select('id', { count: 'exact', head: true }).eq('episode_id', e.id)
  const { count: jobCount } = await sb.from('jobs').select('id', { count: 'exact', head: true }).eq('episode_id', e.id)
  let actCount = 0
  try {
    const { count } = await sb.from('activity_events').select('id', { count: 'exact', head: true }).eq('episode_id', e.id)
    actCount = count || 0
  } catch {}
  console.log(
    `[${seriesCode}] ${e.episode_code.padEnd(13)} | ${(e.title_working||'-').slice(0,30).padEnd(30)} | ${String(e.status).padEnd(22)} | mode ${e.governance_mode} | $${(e.budget_spent||0).toFixed(2).padStart(6)} | assets=${String(assetCount).padStart(3)} jobs=${String(jobCount).padStart(3)} acts=${String(actCount).padStart(3)} | created ${e.created_at?.slice(0,10)} | id=${e.id}`
  )
}

console.log('\n=== ALL SERIES (' + (series?.length||0) + ') ===\n')
for (const s of series || []) {
  const { count: epCount } = await sb.from('episodes').select('id', { count: 'exact', head: true }).eq('series_id', s.id)
  const { count: sblCount } = await sb.from('assets').select('id', { count: 'exact', head: true }).eq('series_id', s.id).is('episode_id', null)
  console.log(`${s.code.padEnd(8)} | ${(s.title||'-').padEnd(25)} | episodes=${epCount} | series-level assets (SBL etc.)=${sblCount} | id=${s.id}`)
}
