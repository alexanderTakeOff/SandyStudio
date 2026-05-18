// Fire Storyboard Artist re-run after revise-stb-with-notes flipped status.
// Send via the inngest dev server's events endpoint.
import { Inngest } from 'inngest';
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
const inngest = new Inngest({ id: 'sandystudio', eventKey: process.env.INNGEST_EVENT_KEY ?? 'local' });
(async () => {
  const r = await inngest.send({
    name: 'sandystudio/exec-sb/create-storyboard',
    data: { episodeId: '21f7bd6a-f52c-4ae0-bd47-06ff328ec6e7' },
  });
  console.log('fired:', JSON.stringify(r));
})();
