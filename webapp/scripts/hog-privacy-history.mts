import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ids из аргументов командной строки; без аргументов — список по умолчанию
const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['iXlrtsPbpJg', 'sp9Q06AZPu8', 'G3I_kR-Y9Tk']

for (const id of ids) {
  const { data, error } = await sb
    .from('channel_snapshots')
    .select('captured_at, views, privacy')
    .eq('scope', 'video')
    .eq('video_id', id)
    .order('captured_at', { ascending: true })
  if (error) { console.error(id, error.message); continue }
  const rows = data ?? []
  console.log(`\n=== ${id} — ${rows.length} снимков ===`)
  if (!rows.length) continue
  let prev: string | null = null
  for (const r of rows) {
    if (r.privacy !== prev) {
      console.log(`  ${r.captured_at}  privacy=${r.privacy}  views=${r.views}`)
      prev = r.privacy as string
    }
  }
  // хвост кривой: видно, ровный ли ноль или счётчик просто не доехал
  for (const r of rows.slice(-8)) {
    console.log(`  TAIL ${r.captured_at}  privacy=${r.privacy}  views=${r.views}`)
  }
}
