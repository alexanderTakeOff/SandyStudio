---
name: supabase_data_api_grant_rule
description: Post-2026-05-30 Supabase Data API change — new public tables need explicit GRANT; our project not affected but future migrations must GRANT
metadata: 
  node_type: memory
  type: project
  originSessionId: 1de6e088-39e5-4025-bc4c-945866269b1e
---

Supabase changed the Data API default on **2026-05-30**: new projects no longer auto-expose `public`-schema tables to the Data API (supabase-js / PostgREST / GraphQL), and any table created in `public` after that date requires an explicit `GRANT` before the anon/authenticated client roles can access it.

**Our project (`akstennzrnkvexjgzhxv`) is NOT affected** as of 2026-06-02: created April 2026, latest migration `0034` (all pre-May-30), no new public tables after the threshold. App reads fine via anon key (verified: /api/health 200 + app renders).

**Forward rule — every future migration that `CREATE TABLE ... public.<name>` MUST include grants** in the same migration, e.g.:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<name> TO authenticated;
GRANT SELECT ON public.<name> TO anon;  -- only if the client (anon) must read it
```
Otherwise the table is invisible to supabase-js and the webapp silently can't query it. RLS policies still apply on top of the grant.

**Diagnostic note:** MCP `execute_sql` is **denied** for this project (`permission denied` / -32600) — same family as the denied `apply_migration` ([[migration_apply_cli_first]]). Use the Supabase CLI or the app's own behavior to verify DB/grant state, not the MCP SQL tool.

Symptom if a table lacks grants: client query returns `permission denied for table X` (NOT a missing-env error). The 2026-06-02 `Missing NEXT_PUBLIC_SUPABASE_URL` crash was unrelated — that was a missing `.env.local` in the main repo, fixed by copying from the worktree. See [[supabase_project_ref]].
