---
name: Supabase project ref + Director user
description: SandyStudio cloud Supabase ref is `akstennzrnkvexjgzhxv` (project name `sandystudio`). Director's user is `ostrovoy.alexander@gmail.com`.
type: project
originSessionId: 6d0edfd7-097b-42f3-ad06-4abcefe3c3d8
---
**Cloud Supabase project**
- Ref: `akstennzrnkvexjgzhxv`
- Project name: `sandystudio`
- Dashboard: https://supabase.com/dashboard/project/akstennzrnkvexjgzhxv
- API/keys page: https://supabase.com/dashboard/project/akstennzrnkvexjgzhxv/settings/api
- Auth users page: https://supabase.com/dashboard/project/akstennzrnkvexjgzhxv/auth/users

**Director account in Supabase Auth**
- Email: `ostrovoy.alexander@gmail.com`
- Auto-confirmed (not magic-link)
- Used to log into the local webapp at http://localhost:3000

**Migrations live at:** `webapp/supabase/migrations/0001..0008_*.sql`. After any schema change run `npx supabase db push` from `webapp/`, then `npm run gen:types`.

**Why save this:** the ref is non-obvious, the user is non-obvious, and recovering them mid-debug wastes a turn. The dashboard URL pattern is the same for all three pages above (just swap the suffix).
