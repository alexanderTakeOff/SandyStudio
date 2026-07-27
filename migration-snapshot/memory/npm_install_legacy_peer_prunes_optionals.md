---
name: npm-install-legacy-peer-prunes-optionals
description: "`npm install <pkg> --legacy-peer-deps` in webapp can prune optional platform binaries (esbuild/sharp) → breaks tsx dev-scripts."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a91c8405-c7f2-425d-9a0b-da945dc1d395
---

Running `npm install <single-pkg> --legacy-peer-deps` in `C:\SandyStudio\webapp` can silently **prune optional platform binaries** — observed 2026-07-05: it removed `@esbuild/win32-x64` and un-marked sharp optionals (`optional: true` flipped in package-lock), which **broke `tsx`** (standalone dev-script runner uses esbuild) with `The package "@esbuild/win32-x64" could not be found`. `tsc`, `vitest`, and `next` kept working (own toolchains), so it's easy to miss.

**Why:** SandyStudio webapp has a pre-existing peer conflict (`@react-three/fiber` v8 vs `@react-three/drei`) so plain `npm install` fails → the repo installs with `--legacy-peer-deps`. But a *targeted* `npm install <pkg> --legacy-peer-deps` re-resolves the whole tree and can drop optionals not currently "needed" by the resolver.

**How to apply:**
- Prefer a FULL `npm install` (no targeted single-pkg) to reconcile node_modules to package.json+lock, or `npm ci` on a clean checkout.
- After ANY `git pull` / branch-switch that changed package.json — run `npm install` **before** starting servers. The 2026-07-05 E15 outage root cause was exactly this: `@anthropic-ai/sdk` was in package.json+lock but never installed into node_modules → `/api/inngest` 500 → whole Inngest dispatch dead.
- If `tsx` suddenly errors with a missing `@esbuild/*` platform pkg, run `npm install` to restore the optional binary; don't hand-hack.
- **Never blind `npm install` under a LIVE `next dev`** — it crashed :3000 mid-session (changing node_modules under a running watcher). Stop the dev server first, install, restart.

Related: [[dev_workflow_no_build_during_dev]] (build corrupts .next), [[webapp_local_dev_two_terminals]].
