import { readFileSync } from 'node:fs';
for (const raw of readFileSync('.env.local', 'utf-8').split('\n')) {
  const l = raw.trim(); if (!l || l.startsWith('#')) continue;
  const e = l.indexOf('='); if (e <= 0) continue;
  let v = l.slice(e + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[l.slice(0, e).trim()] = v;
}
const EP = 'c3934ee2-c135-43e9-9a56-58b6bdc1f98b'; // E31
(async () => {
  const res = await fetch(`http://localhost:3000/api/episodes/${EP}`, {
    headers: { Authorization: `Bearer ${process.env.EXEC_DIR_AI_TOKEN}` },
  });
  const j = await res.json() as { data?: { jobs?: Array<{ agent_id?: string; status?: string; metadata?: { shot_id?: string } }> } };
  const jobs = j?.data?.jobs ?? [];
  const live = jobs.filter((x) => x.status === 'RUNNING' || x.status === 'QUEUED');
  const video = live.filter((x) => ['EXEC-VANIM', 'EXEC-VGEN', 'EXEC-VPREV'].includes(x.agent_id ?? ''));
  const byAgent: Record<string, number> = {};
  for (const x of live) byAgent[x.agent_id ?? '?'] = (byAgent[x.agent_id ?? '?'] ?? 0) + 1;
  console.log('E31 total jobs in payload:', jobs.length);
  console.log('LIVE (RUNNING/QUEUED):', live.length, JSON.stringify(byAgent));
  console.log('LIVE VIDEO (VANIM/VGEN/VPREV):', video.length, video.length === 0 ? '=> NO CHURN' : '=> CHURN ACTIVE');
})().catch((e) => { console.error(e); process.exit(1); });
