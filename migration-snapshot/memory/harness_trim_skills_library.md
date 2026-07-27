---
name: harness-trim-skills-library
description: ECC harness trimmed 2026-06-01 — off-stack/off-domain skills/agents/commands moved out of autoload into ~/.claude/*-library/ dirs
metadata: 
  node_type: memory
  type: project
  originSessionId: 9dbba1bd-3fc5-4213-80e4-5bf87abf3672
---

On 2026-06-01 (Director directive, context-bloat fix) the global ECC install was trimmed via `agent-sort` + `harness-audit`. Off-stack and off-domain surfaces were MOVED (not deleted) out of the auto-scanned dirs so their descriptions stop being injected every turn.

**Where things went (sibling `-library` dirs, NOT scanned by Claude Code):**
- `~/.claude/skills-library/` — 75 skills (off-stack langs: python/go/rust/kotlin/swift/java/cpp/csharp/dart-flutter/perl/laravel/django/springboot/nestjs/clickhouse + off-domain ops: logistics/healthcare/finance/customs/energy/inventory/investor/jira/email/seo/crypto)
- `~/.claude/agents-library/` — 19 agents (off-lang reviewers + build-resolvers + healthcare-reviewer + opensource-*)
- `~/.claude/commands-library/` — 18 commands (off-lang review/build/test + jira)

**Result:** skills 149→74, agents 48→29, commands 82→64. Biggest per-turn context lever (MCP tool schemas are already deferred by the harness, so they were NOT the bloat).

**KEPT as DAILY:** all SandyStudio skills (animator, storyboarder-*, seedance-prompting, sandystudio-archivist, episode-serialization, eref-*, library-style-first, sandy-gag-library), TS/Next/React/Supabase stack (typescript-reviewer, database-reviewer, frontend-*, backend-patterns, postgres-patterns), AI-media (fal-ai-media, claude-api, remotion-video-creation), session/ops surfaces.

**To restore any item:** `Move-Item ~/.claude/skills-library/<name> ~/.claude/skills/` (or agents-library/commands-library with `.md`). ECC re-install may repopulate the originals — re-run the trim if so.

**MCP connectors:** Director kept Figma (real UI/dev tool); decided to DROP Gmail, Google Calendar, Google Drive, Vercel, Gamma, Canva via in-session `/mcp` → Disconnect. These are account-global connectors → disconnect affects every project, not just SandyStudio. Trim script lives inline in the 2026-06-01 session; not saved to a file. Related: [[plan-md-living-anchor]].
