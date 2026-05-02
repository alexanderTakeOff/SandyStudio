# SandyStudio — Storage Configuration
## specs/system/storage_configuration.md | v0.1 | DRAFT

> **Status:** Phase 5a UX architecture spec — defines UX and contract.
> Implementation: API contract lands in Phase 5b, UI lands in Phase 5c.

---

## 0. Purpose

This file defines how the Director sets, validates, and edits SandyStudio's two
storage paths through the UI:

1. **`project_root`** — where film project folders live (Tier 2 per `CLAUDE.md §2`).
2. **`media_storage_root`** — where heavy media binaries live (Tier 3).

It is referenced from:
- `specs/system/onboarding.md` — first-run wizard step 1 (storage configuration).
- `specs/system/uiux.md` v0.3 — Settings → Storage tab.
- `specs/system/webapp.md` §5 — `/api/storage/*` route contracts (5b).

---

## 1. Source of Truth — `CLAUDE.md §2` (3-Tier Architecture)

The 3-tier rule is non-negotiable:

| Tier | Purpose | Default path |
|------|---------|--------------|
| 1 | Studio (this repo) | `C:\SandyStudio\` — never holds film content |
| 2 | Film project folders | `C:\SandyStudio\FILMS\<series>\<season>\` |
| 3 | Heavy media binaries | `H:\My Drive\SandyStudio_Media\<series_id>\` |

Storage configuration UX writes only Tiers 2 and 3. Tier 1 is not user-editable
because the studio repo is fixed at install time.

---

## 2. Storage Keys in `app_config`

Two keys, scope `'storage'`. Both are global to the workstation, not per-series
(per-series overrides live in each project's `PROJECT.md`, see `CLAUDE.md §2`).

```
app_config (scope='storage'):
  project_root           → string absolute path
  media_storage_root     → string absolute path
  project_root_writable  → boolean (cached probe result)
  media_root_writable    → boolean (cached probe result)
  last_validated_at      → timestamptz (last successful write-test)
  last_validated_by      → uuid (user who ran the test)
```

### Defaults (used if keys absent)

```
project_root        = "C:\\SandyStudio\\FILMS\\"
media_storage_root  = "H:\\My Drive\\SandyStudio_Media\\"
```

These are the values pre-filled in the first-run wizard. The Director can edit them.

---

## 3. UX — First-Run Wizard (Step 1 of 4)

Reached during onboarding when `series.count === 0`. Cannot be skipped if a
default path fails its write-test; the Director must either fix the path or
explicitly choose a writable one.

### 3.1 Visual mockup

```
┌────────────────────────────────────────────────────────────┐
│ Welcome to SandyStudio.                  [Step 1 of 4]      │
│                                                             │
│  STORAGE LOCATIONS                                          │
│  Where should SandyStudio write your films?                │
│                                                             │
│  Project root        (scripts, briefs, bibles, reviews)     │
│   ┌──────────────────────────────────────┐                  │
│   │ C:\SandyStudio\FILMS\               │  [Browse…]        │
│   └──────────────────────────────────────┘                  │
│   ✓ writable · last tested 2026-04-29 14:02                 │
│                                                             │
│  Media storage       (images, video, audio)                 │
│   ┌──────────────────────────────────────┐                  │
│   │ H:\My Drive\SandyStudio_Media\       │  [Browse…]        │
│   └──────────────────────────────────────┘                  │
│   ✓ writable · ⓘ Google Drive folder detected               │
│                                                             │
│  ─ Test paths now ─                                         │
│   [ Run write-test ]   ← runs probe on both paths           │
│                                                             │
│                          [ Skip — use defaults ]            │
│                          [ Continue → ]                     │
└────────────────────────────────────────────────────────────┘
```

### 3.2 Behaviour

- **Pre-fill** with values from `app_config` if present, otherwise the defaults
  in §2.
- **`[Browse…]`** opens a native folder-picker dialog. Where the platform does
  not surface one (web sandbox), the field stays a plain text input — Director
  pastes the path. Phase 5c chooses one of: Tauri folder picker, Electron-style
  IPC bridge, or text-only fallback.
- **`[Run write-test]`** runs the probe described in §4. Result inline below
  each path: `✓ writable` (green) or `✗ <reason>` (red, expanded message).
- **`[Continue →]`** is disabled until both paths pass write-test. The button
  shows the failing path's name when disabled.
- **`[Skip — use defaults]`** is allowed only when both default paths already
  pass the probe; otherwise it is replaced with `[Use defaults — verify]`,
  which runs the probe and surfaces failure inline.

### 3.3 Drive folder detection

If a path matches `^[A-Z]:\\My Drive\\` or contains a `.tmp.driveupload` marker
file in any ancestor, surface an info chip `ⓘ Google Drive folder detected`.
This is purely informational in v0.1. Phase 8 may add Drive Picker integration.

---

## 4. Write-Test Contract (Probe)

The probe creates and deletes a 0-byte file. It is the single source of truth
for "writable":

```
1. Compute probe filename: `.sandystudio_probe_<uuid>`
2. Open <path>/<probe_filename> for write
3. Write 0 bytes, fsync, close
4. Read back filesize → must be 0
5. Unlink <path>/<probe_filename>
6. Return success
```

### 4.1 Failure surfacing

Return the original error verbatim (do not paraphrase). Examples surfaced to UI:

| Probe failure | UI message |
|---------------|------------|
| `EACCES` / permission denied | `Permission denied. Run SandyStudio as the user that owns this folder, or grant write access.` |
| `ENOENT` / parent missing | `Folder does not exist. Create it manually or pick a different path.` |
| `EROFS` / read-only mount | `Read-only filesystem. Pick a writable drive (HDD/SSD/Drive sync).` |
| Drive sync paused | `Google Drive is paused. Resume Drive sync, then re-run the test.` |
| Disk full | `No free space on this drive.` |
| Path is a file, not a directory | `Path points to a file, not a folder.` |

### 4.2 Caching

A successful probe writes `last_validated_at` and `last_validated_by`. UI shows
relative time (`✓ writable · last tested 8m ago`). If older than 24 h on the
Settings → Storage tab, show a `[ Re-test ]` button next to each path.

---

## 5. UX — Settings → Storage Tab (Post First-Run)

Reached from `/settings`. Visual structure mirrors the wizard step.

```
┌────────────────────────────────────────────────────────────┐
│ Settings · Storage                                          │
├────────────────────────────────────────────────────────────┤
│ Project root          C:\SandyStudio\FILMS\        [Edit]  │
│   ✓ writable · last tested 8m ago                           │
│                                                             │
│ Media storage         H:\My Drive\SandyStudio_Media\ [Edit]│
│   ✓ writable · ⓘ Google Drive                               │
│                                                             │
│   [ Re-test all paths ]                                     │
│                                                             │
│ ⚠ Changing storage paths does not move existing content.    │
│   New writes go to the new path. Existing series stay where │
│   they are (their `PROJECT.md` is the authoritative anchor).│
└────────────────────────────────────────────────────────────┘
```

`[Edit]` opens the same picker dialog as the wizard. Saving runs the probe and
either accepts or rejects the change with the same inline messaging.

### 5.1 Migration of existing content

Out of scope in Phase 5a. The spec explicitly states existing content is **not
moved** when paths change. New writes follow the new path. Phase 8 may add a
"Move existing series" tool.

---

## 6. API Contract Summary (for Phase 5b)

The following endpoints will be implemented in Phase 5b. They are listed here
so the contract is fixed in 5a.

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| GET    | `/api/storage/config` | Read both paths + writable flags + last_validated_at | Director |
| POST   | `/api/storage/config` | Write new paths. Body validated. Probe runs server-side before persisting. | Director |
| POST   | `/api/storage/test-write` | Run probe on a candidate path without persisting. Body: `{ path: string, kind: 'project_root' \| 'media_storage_root' }`. | Director |

All three are Director-only (no delegation). Hard-limit category: storage
configuration touches the contract between studio and disk; agents must never
move it.

### 6.1 Response envelope (matches `rules/typescript/patterns.md`)

```ts
GET /api/storage/config → {
  success: true,
  data: {
    project_root: string,
    media_storage_root: string,
    project_root_writable: boolean,
    media_root_writable: boolean,
    last_validated_at: string | null,   // ISO 8601
    last_validated_by: string | null,   // uuid
  }
}

POST /api/storage/test-write → {
  success: true,
  data: { path: string, kind: 'project_root'|'media_storage_root', writable: boolean, error?: string }
}
```

---

## 7. Audit Trail

Every successful POST to `/api/storage/config` writes one row in
`activity_events`:

```
event_type   = 'storage_config_change'
severity     = 'warning'  (paths are operational infrastructure)
title        = 'Storage paths updated'
description  = 'project_root: <old> → <new>; media_root: <old> → <new>'
actor        = <director user id>
metadata     = { old: {...}, new: {...} }
```

This event surfaces in Dashboard Zone 3 (live activity feed) with a settings
icon.

---

## 8. Error Boundaries

The studio repo (`C:\SandyStudio\`) is forbidden as a write target for
project content. The naming-validator hook already enforces this for SS-*
files; the API must enforce it for storage paths too.

### 8.1 Reject rules (server-side validation)

Reject with 400 if any of:

- Path equals or is contained within `C:\SandyStudio\` *unless* it is
  `C:\SandyStudio\FILMS\` or a subdirectory of it.
- Path equals or is contained within `C:\Windows\`, `C:\Program Files\`,
  `C:\Program Files (x86)\`, or any system root.
- Path contains traversal (`..`) after normalization.
- Path is empty, whitespace-only, or longer than 240 chars.

### 8.2 Warn rules (allow but flag in UI)

- Path on a network share (`\\…`) — warn that latency may slow agents.
- Path on a removable drive (USB, SD) — warn that disconnection breaks runs.

---

## 9. Cross-References

- `CLAUDE.md §2` — 3-tier architecture, defaults, path resolution rules.
- `specs/system/onboarding.md` — first-run wizard host for this UX.
- `specs/system/uiux.md` v0.3 — Settings → Storage tab visual rules.
- `specs/system/webapp.md` §5 — Phase 5b API route contracts.
- `webapp/lib/api/auth.ts` (Phase 5b) — `requireDirector()` guard.

---

*SandyStudio storage_configuration.md | v0.1 | Status: DRAFT*
