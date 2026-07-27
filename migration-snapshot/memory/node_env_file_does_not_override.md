---
name: node --env-file does NOT override existing env vars
description: On Windows, system-level env vars (e.g. an empty ANTHROPIC_API_KEY) silently win over .env.local when scripts use `node --env-file` or `tsx --env-file`. Test scripts that need .env.local to win MUST manually load it with override, or webapp dev server (Next.js loads with proper precedence).
type: gotcha
originSessionId: 063ac62d-3128-457d-96d1-b2c9907a7ad1
---
When running standalone scripts via `tsx --env-file=.env.local script.ts` or `node --env-file=.env.local script.ts` on Windows, **system-level env vars are NOT overwritten by the .env.local file.** Node treats existing `process.env` keys as already-set.

**Symptom:** Director has `ANTHROPIC_API_KEY=sk-ant-...` in `webapp/.env.local`, but `process.env.ANTHROPIC_API_KEY` is `""` (empty string) inside the script. Other keys (OPENAI, GEMINI, GOOGLE_*) work fine because the system has no prior value for them.

**Why:** Windows can have empty env vars defined at User or System scope (set previously by some installer or PowerShell session). `node --env-file` documentation states it "loads environment variables from a file" — but it skips keys that are already defined.

**How to fix in scripts:**
```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotenvOverride(filename: string): void {
  try {
    const text = readFileSync(resolve(process.cwd(), filename), 'utf-8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;  // OVERRIDE
    }
  } catch {}
}
loadDotenvOverride('.env.local');
```

Place at the very top of any test/smoke script that imports the production env-reading code.

**webapp dev/prod runtime is NOT affected** — Next.js loads `.env.local` with proper precedence over system vars. So Inngest functions running inside `npm run dev` see the right keys. Only standalone scripts have this Windows gotcha.

**Diagnostic command:**
```bash
echo "system value: '$ANTHROPIC_API_KEY' length: ${#ANTHROPIC_API_KEY}"
```
If length is 0 but key is set in .env.local — you've hit this gotcha.

**Future cleanup option:** Director can clear the system var via PowerShell:
```powershell
[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", $null, "User")
```
After a new shell session, system var is gone and `--env-file` works as intended. But the manual loader pattern is portable and idempotent — prefer it.
