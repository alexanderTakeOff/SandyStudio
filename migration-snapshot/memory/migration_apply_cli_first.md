---
name: Migration apply — supabase db push first, never ask Director
description: Canonical SandyStudio migration apply path is `supabase db push` via the linked CLI. Director should never have to apply migrations manually — that's a workflow failure on Claude's side.
type: feedback
originSessionId: d2c7c2aa-d0ab-49d6-b57e-0c269bbd4e86
---
When schema changes land, apply migrations via the local Supabase CLI immediately. **Do not ask Director, do not escalate, do not block on MCP `apply_migration`.**

Canonical sequence from `webapp/`:

```bash
npx supabase migration list       # confirm what's pending
echo y | npx supabase db push     # apply
npx supabase gen types typescript --project-id akstennzrnkvexjgzhxv --schema public \
  > webapp/lib/supabase/types.gen.ts
# strip trailing CLI version banner from types.gen.ts (last 2 lines)
```

The CLI is **already linked and authenticated** (`supabase projects list` shows LINKED). No password prompt needed — CLI uses its stored session.

**Why:** Director's 2026-05-14 correction. I had `supabase_project_ref.md` memory line 19 stating this path explicitly, plus we've done many migrations this way already. I anchored on a misleading 2026-05-13 ambient session note saying "apply_migration MCP denied" and asked Director to apply manually via Dashboard — wasted turns, Director had to course-correct. The MCP-denied fact is true and irrelevant: CLI is the production path, MCP is a never-used fallback.

**How to apply:**
- Schema change needed → write migration file → run the 3-step CLI sequence above. Done.
- Only ask Director if `supabase db push` itself errors with something operational (auth lost, schema conflict, etc).
- Never offer "I'll prepare the migration, you apply it" as a default. That's a workflow regression.
- The `types.gen.ts` trailing CLI banner is a known quirk — strip it inline with `head -N` before tsc.
