import { sb } from './scripts/run/_env'

const EP = '093497fa-92a1-4618-a309-10e08a59232f'
const BASE = 2 // кадров было на момент запуска ожидания

async function count(): Promise<{ n: number; rows: any[] }> {
  const { data } = await sb
    .from('assets')
    .select('filename,status,created_at')
    .eq('episode_id', EP)
    .ilike('file_type', 'IMG%')
    .order('created_at')
  return { n: (data ?? []).length, rows: data ?? [] }
}

async function main() {
  for (let i = 0; i < 45; i++) {
    const { n, rows } = await count()
    if (n > BASE) {
      console.log('=== НОВЫЕ КАДРЫ ПОЯВИЛИСЬ ===')
      rows.forEach((r: any) => console.log(' ', r.created_at.slice(11, 19), r.status, r.filename))
      return
    }
    await new Promise((r) => setTimeout(r, 60_000))
  }
  console.log('=== за 45 минут новых кадров не появилось ===')
}

main()
