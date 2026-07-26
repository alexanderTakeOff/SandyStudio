# SandyStudio — YouTube Distribution Spec
## specs/distribution/youtube.md | v0.1 | DRAFT

> Defines how episodes are uploaded, scheduled, and published to YouTube.
> Used by: EXEC-PUB
> Requires: YouTube Data API v3 credentials (see specs/system/auth.md)

---

## CHANNEL SETUP

| Parameter | Value |
|-----------|-------|
| Channel name | [REQUIRED — to be defined] |
| Channel type | Standard YouTube channel |
| Content type | Animated comedy series |
| Upload cadence | [REQUIRED — e.g. weekly, bi-weekly] |
| Default privacy | `private` on upload → `public` on scheduled release |

---

## UPLOAD CHECKLIST

Before EXEC-PUB uploads, all of the following must be APPROVED:

- [ ] Episode video file: `SS-S[NN]-E[NN]-VID-final_cut-v[NN]-APPROVED.mp4`
- [ ] Metadata file: `SS-S[NN]-E[NN]-SPC-metadata-v[NN]-APPROVED.md` (from EXEC-COPY)
- [ ] Thumbnail: `SS-S[NN]-E[NN]-IMG-thumbnail-v[NN]-APPROVED.png` (from EXEC-THUMB)
- [ ] Director explicit publish approval (Hard Limit — always Director/CEO, all governance modes)

If any item is missing: EXEC-PUB enters BLOCKED state and notifies Director.

---

## UPLOAD PARAMETERS (YouTube Data API v3)

```json
{
  "snippet": {
    "title": "[from metadata.title — max 100 characters]",
    "description": "[from metadata.description]",
    "tags": "[from metadata.tags — array]",
    "categoryId": "[from channel passport publish_defaults.category_id — fallback '23' Comedy]",
    "defaultLanguage": "[from publish_defaults.default_language — omitted when unset]",
    "defaultAudioLanguage": "[same as defaultLanguage]"
  },
  "status": {
    "privacyStatus": "private",
    "publishAt": "[ISO 8601 scheduled publish time]",
    "selfDeclaredMadeForKids": "[from publish_defaults.made_for_kids — fallback false]"
  }
}
```

**Category / language / kids-flag come from the channel passport** —
`channels.metadata.publish_defaults` (multi-channel Phase 4e), editable in
Settings → Channels. Code fallback when unset: categoryId `'23'` (Comedy),
madeForKids `false`, language omitted.

---

## SCHEDULING RULES

| Rule | Detail |
|------|--------|
| Upload day | [REQUIRED — e.g. Monday] |
| Upload time (local) | Upload video at least 24 hours before scheduled publish |
| Publish time | [REQUIRED — e.g. Tuesday 18:00 GMT+3] |
| Privacy on upload | Always `private` — never upload as `public` directly |
| Minimum review window | Director must have 24 hours to review published-ready video before it goes live |

**Scheduling process:**
1. EXEC-PUB uploads video as `private`
2. EXEC-PUB sets `publishAt` to scheduled release time
3. EXEC-PUB sends Director the YouTube Studio link for final check
4. If Director says "go" within 24-hour window → video publishes automatically at scheduled time
5. If Director has concerns → EXEC-PUB cancels schedule, video stays private

---

## VIDEO TECHNICAL REQUIREMENTS (YouTube)

| Parameter | Requirement |
|-----------|------------|
| Format | MP4 |
| Codec | H.264 |
| Resolution | 1920×1080 minimum |
| Frame rate | 24 fps |
| Max file size | 256 GB (YouTube limit) |
| Max duration | 15 minutes (standard account) |
| Audio | AAC, stereo, 48kHz |

All requirements met by `specs/system/media_formats.md` standard export.

---

## YOUTUBE SHORTS

If an episode is produced in 9:16 format (≤60 seconds):

| Parameter | Value |
|-----------|-------|
| Title | Must include "#Shorts" |
| Resolution | 1080×1920 |
| Duration | ≤60 seconds |
| Upload | Separate upload from main episode |

Shorts may be excerpts from full episodes or standalone content.
Director decides Shorts strategy per episode.

---

## POST-UPLOAD LOG

EXEC-PUB writes an upload log after each publish:

```
SS-S[NN]-E[NN]-REV-publish_log-v01-DRAFT.md → reviews/

Contents:
  - YouTube video ID
  - Upload timestamp
  - Scheduled publish time
  - Actual publish time (confirmed post-publish)
  - Video URL
  - Initial public stats (views at T+1h, T+24h)
  - Any upload errors or warnings
```

This log is the trigger for EXEC-ANAL to begin analytics collection.

---

*SandyStudio youtube.md | v0.1 | Status: APPROVED*
