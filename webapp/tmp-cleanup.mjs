// Cleanup: delete 5 obsolete episodes + 3 obsolete series.
// Modes:
//   --dry-run (default): preview counts, no writes.
//   --confirm: actually DELETE.
// FK constraints (verified from migrations):
//   - assets/jobs/activity_events: episode_id FK with ON DELETE CASCADE
//   - approval_authority_matrix.series_id, assets.series_id: FK with ON DELETE CASCADE
//   - episodes.series_id: TEXT (no FK) — episodes orphaned if series deleted first → delete episodes first

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = fs.readFileSync('.env.local', 'utf8')
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.+)$`, 'm'))
  return m ? m[1].trim() : null
}
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const DRY = !process.argv.includes('--confirm')
const tag = DRY ? '[DRY-RUN]' : '[CONFIRM]'

const EPISODES_TO_DELETE = [
  { id: '3a4be629-0ca6-4e6b-af2c-54a91a79f5ae', label: 'SS-S01-E01 The Red Carpet' },
  { id: '1c150b6d-3320-48a0-b444-9ad832de77a5', label: 'SS-S01-E02 sandyTest05' },
  { id: '9ac758b2-641b-4bcb-afd8-2fe482e60566', label: 'SS-S05-E01 INVITE SANDY' },
  { id: '34aa2a7a-d9d2-4fa5-85a4-eb4019a0f344', label: 'SS-S03-E01 INVITEING SANDY' },
  { id: '63ba7f1b-b8b3-4cdb-81d5-3d4c70bc23dd', label: 'SS-S09-E01 Series Bible test 1' },
]

const SERIES_TO_DELETE = [
  { id: '52dd30ed-c60d-441e-9014-be47334027df', label: 'SS-S01 sandytest03' },
  { id: '4585c96d-3271-4653-b0a5-bce236ad834d', label: 'SS-S03 Sandy03' },
  { id: '002a7d41-e7cb-4f0b-8033-6adf9c99bba6', label: 'SS-S05 SandyTest05' },
]

const KEEP_SERIES = [
  { code: 'SS-S09', id: '7acf94f2-d4de-47ac-acf1-b81ec1aa408b', why: 'Sandy Bible — keep 10 SBL as reference' },
  { code: 'SS-S14', id: 'd1dfa060-748d-4713-ad55-ec30d3214f73', why: 'Sandy Chronicles — host of Perfume Vial baseline' },
]
const KEEP_EPISODE = { id: '4809684a-3740-4d20-85fa-b24d76340074', label: 'SS-S14-E01 Perfume Vial' }

console.log(`\n${tag} === SandyStudio cleanup ===`)
console.log('Mode:', DRY ? 'DRY-RUN (no writes)' : 'CONFIRM (will DELETE)')
console.log()

console.log('To DELETE — episodes (5):')
let totalAssets = 0, totalJobs = 0, totalActs = 0
for (const e of EPISODES_TO_DELETE) {
  const { count: a } = await sb.from('assets').select('id', { count: 'exact', head: true }).eq('episode_id', e.id)
  const { count: j } = await sb.from('jobs').select('id', { count: 'exact', head: true }).eq('episode_id', e.id)
  let acts = 0
  try { const { count } = await sb.from('activity_events').select('id', { count: 'exact', head: true }).eq('episode_id', e.id); acts = count || 0 } catch {}
  totalAssets += a; totalJobs += j; totalActs += acts
  console.log(`  ${e.label.padEnd(40)} | assets=${a} jobs=${j} acts=${acts}`)
}
console.log(`  TOTAL CASCADE: assets=${totalAssets} jobs=${totalJobs} activity_events=${totalActs}`)
console.log()

console.log('To DELETE — series (3):')
for (const s of SERIES_TO_DELETE) {
  const { count: aam } = await sb.from('approval_authority_matrix').select('series_id', { count: 'exact', head: true }).eq('series_id', s.id)
  const { count: sbl } = await sb.from('assets').select('id', { count: 'exact', head: true }).eq('series_id', s.id)
  console.log(`  ${s.label.padEnd(40)} | approval_authority=${aam} series-level assets=${sbl}`)
}
console.log()

console.log('TO KEEP:')
console.log(`  ${KEEP_EPISODE.label} — full episode (108 assets, 79 jobs, 188 activity)`)
for (const s of KEEP_SERIES) console.log(`  ${s.code} (${s.why})`)
console.log()

if (DRY) {
  console.log(`${tag} END — no rows changed. Re-run with --confirm to execute.`)
  process.exit(0)
}

// === REAL DELETE ===
console.log('[CONFIRM] Executing DELETE...')

// 1. Delete episodes (cascades assets/jobs/activity_events)
const epIds = EPISODES_TO_DELETE.map(e => e.id)
const { error: epErr, count: epDel } = await sb.from('episodes').delete({ count: 'exact' }).in('id', epIds)
if (epErr) { console.error('episodes delete:', epErr); process.exit(1) }
console.log(`  episodes deleted: ${epDel}`)

// 2. Delete series (cascades approval_authority_matrix + any SBL assets)
const sIds = SERIES_TO_DELETE.map(s => s.id)
const { error: sErr, count: sDel } = await sb.from('series').delete({ count: 'exact' }).in('id', sIds)
if (sErr) { console.error('series delete:', sErr); process.exit(1) }
console.log(`  series deleted: ${sDel}`)

// 3. Verify
const { data: epsAfter } = await sb.from('episodes').select('id,episode_code')
const { data: sAfter } = await sb.from('series').select('code,title')
console.log()
console.log('Post-delete state:')
console.log(`  episodes remaining: ${epsAfter?.length} ${epsAfter?.map(e=>e.episode_code).join(', ')}`)
console.log(`  series remaining: ${sAfter?.length} ${sAfter?.map(s=>s.code).join(', ')}`)
console.log()
console.log('[CONFIRM] DONE.')
