# PROJECT — Sandy Series, Season 1
## FILMS/Sandy/S01/PROJECT.md

> This file is the anchor of a film project. Webapp/CLI agents read it to know
> where to write/read content. Lives at the project root, never moves.

---

## SETTINGS

```yaml
# Identity
project_id:         SandyS01
project_name:       "Sandy Series — Season 1"
project_type:       animated_anthology
created_date:       2026-04-25
created_from:       PILOT migration (was at SandyStudio/ root, refactored to 3-tier)

# Storage paths
project_root:       "C:/SandyStudio/FILMS/Sandy/S01/"
media_storage:      "H:/My Drive/SandyStudio_Media/SandyS01/"
staging_path:       "C:/SandyStudio/Staging/"     # shared, isolated by project_id

# Series metadata (single-season for now; new season = sibling project: FILMS/Sandy/S02/)
series_id:          S01
season_number:      1
target_runtime_seconds: 60
format:             "60-second silent physical comedy anthology"

# Studio binding
studio_root:        "C:/SandyStudio/"
studio_version:     "v0.4"

# Governance
governance_mode:    1                              # 1=MANUAL (default at session start)
approval_authority_ref: "supabase://approval_authority?project=SandyS01"

# Config overrides (optional — empty = use studio config/defaults.yaml as-is)
config_overrides:   {}

# Episodes (auto-populated as episodes are created)
episodes:
  - episode_id:     E01
    title_working:  "The Red Carpet"
    status:         STORYBOARD_APPROVED       # mock pipeline complete; awaiting real generation
    runtime_seconds: 60
    created:        2026-04-24
```

---

## DIRECTORY MAP

Files in this project are placed by filename pattern (auto-resolver, see CLAUDE.md §3):

```
FILMS/Sandy/S01/
├── PROJECT.md                              ← this file
├── bibles/                                 ← series-level (BIB type)
│   ├── world/    SS-S01-BIB-world_*
│   ├── characters/  SS-S01-BIB-character_*
│   └── style/    SS-S01-BIB-style*
├── state/                                  ← series-level (STA type)
│   └── SS-S01-STA-*
└── e01/                                    ← episode E01
    ├── briefs/      SS-S01-E01-SPC-{brief|story_brief|music_brief}-*
    ├── scripts/     SS-S01-E01-SCR-*
    ├── storyboards/ SS-S01-E01-STB-*
    ├── reviews/     SS-S01-E01-REV-*
    └── distribution/ SS-S01-E01-SPC-copy-* (and other distribution-bound specs)
```

Media (heavy binary assets) go to `media_storage`, NOT here:
```
H:/My Drive/SandyStudio_Media/SandyS01/
└── e01/
    ├── raw/{video,images,audio}/
    └── approved/{video,images,audio}/
```

Staging (pre-approval buffer) is shared across all film projects on workstation:
```
C:/SandyStudio/Staging/
└── (transient — TTL 48h)
```

---

## RULES

1. This file (`PROJECT.md`) is the only source of truth for project paths.
   If `project_root` or `media_storage` move, update this file FIRST, then
   physically move the data to match.

2. Series-level files (`bibles/`, `state/`) are written once, referenced by all episodes.

3. Each new episode auto-creates its `e<NN>/` subtree with all 5 standard subfolders.
   Empty subfolders are tolerated — agents don't have to fill them in order.

4. Films are NOT git-tracked (Director decision 2026-04-25). Backup is via filesystem
   (Google Drive sync of `media_storage`, manual snapshots of `project_root`).

5. To create a new film/season: copy this template, change `project_id`, `project_name`,
   `project_root`, `series_id`. Director chooses the new `project_root` path at creation —
   default is `C:/SandyStudio/FILMS/<series_name>/<season>/`.

---

## CHANGE LOG

| Date | Change | By |
|------|--------|----|
| 2026-04-25 | PROJECT.md created during PILOT migration to 3-tier architecture | Claude Code |
