# SandyStudio — Media Formats Spec
## specs/system/media_formats.md | v0.2 | APPROVED

> **⚠️ PARTIALLY DEPENDENT ON DECISION D-002 (Assembly Tool)**
> Export settings in Section 4 will be completed after assembly_tool.md is APPROVED.
> All other sections are final.

---

## PURPOSE

Defines the exact technical specifications for all media files produced by SandyStudio.
Every generated file must conform to these specs. Deviation causes assembly failures.
EXEC-VGEN, EXEC-MGEN, and EXEC-THUMB check their output against this spec before
submitting to QA.

---

## 1. VIDEO — GENERATED SHOTS

These are the individual shot clips produced by EXEC-VGEN.

| Parameter | Value |
|-----------|-------|
| Format | MP4 (MPEG-4 container) |
| Video codec | H.264 (AVC) — baseline for compatibility |
| Resolution | 1920 × 1080 (1080p, 16:9) |
| Frame rate | 24 fps (film standard for animation) |
| Bit rate | Minimum 8 Mbps |
| Color space | sRGB |
| Duration | 1.5 – 8.0 seconds per shot |
| Audio | None (no audio in shot clips — music added in assembly) |
| Naming | `SS-[S]-[E]-VID-shot_[shot_id]-v[NN]-[STATUS].mp4` |
| Storage | `H:\My Drive\SandyStudio_Media\raw\video\` |

**YouTube Shorts variant:**
| Parameter | Value |
|-----------|-------|
| Resolution | 1080 × 1920 (1080p, 9:16 vertical) |
| All other params | Same as above |

---

## 2. VIDEO — ASSEMBLED EPISODE

The final episode file after assembly.

| Parameter | Value |
|-----------|-------|
| Format | MP4 |
| Video codec | H.264 (AVC) for delivery; ProRes 422 for archival master |
| Resolution | 1920 × 1080 |
| Frame rate | 24 fps |
| Bit rate | Minimum 12 Mbps (delivery); lossless for archival |
| Audio codec | AAC |
| Audio sample rate | 48000 Hz |
| Audio bit depth | 24-bit |
| Audio channels | Stereo (2.0) |
| Target duration | 3–8 minutes (per series format in Master Plan) |
| Naming | `SS-[S]-[E]-VID-final_cut-v[NN]-[STATUS].mp4` |
| Storage (draft) | `H:\My Drive\SandyStudio_Media\raw\video\` |
| Storage (approved) | `H:\My Drive\SandyStudio_Media\approved\video\` |

---

## 3. AUDIO — MUSIC TRACKS

Individual music tracks produced by EXEC-MGEN.

| Parameter | Value |
|-----------|-------|
| Format | WAV (preferred for assembly) or MP3 (192kbps minimum) |
| Sample rate | 48000 Hz |
| Bit depth | 24-bit (WAV) |
| Channels | Stereo (2.0) |
| Duration | Must match scene duration from storyboard ± 2 seconds |
| Headroom | -6 dB peak maximum (leave room for mixing) |
| Naming | `SS-[S]-[E]-AUD-music_[scene_description]-v[NN]-[STATUS].wav` |
| Storage | `H:\My Drive\SandyStudio_Media\raw\audio\` |

**Music track taxonomy:**
Each episode may have multiple tracks:
- `main_theme` — opening (if applicable)
- `act[N]_scene[M]` — per-scene background music
- `sting_[description]` — short comic stings for gags
- `outro` — closing music

---

## 4. IMAGES — THUMBNAILS

| Parameter | Value |
|-----------|-------|
| Format | PNG (lossless) |
| Resolution | 1280 × 720 (YouTube recommended minimum) |
| Color space | sRGB |
| File size | Under 2 MB (YouTube limit) |
| Naming | `SS-[S]-[E]-IMG-thumbnail-v[NN]-[STATUS].png` |
| Storage | `H:\My Drive\SandyStudio_Media\raw\images\` |

---

## 5. IMAGES — CHARACTER REFERENCES

Canonical reference images for character consistency.

| Parameter | Value |
|-----------|-------|
| Format | PNG (lossless) |
| Resolution | 1024 × 1024 (square — standard for AI model input) |
| Background | Transparent or neutral grey (#C0C0C0) |
| Variants | Front-facing (mandatory), 3/4 view (recommended), profile (optional) |
| Naming | `[character_id]-reference-v[NN]-APPROVED.png` |
| Storage | `bibles/characters/references/` |

---

## 6. ASSEMBLY EXPORT SETTINGS

Assembly tool: **FFmpeg** (Decision D-002 — APPROVED 2026-04-24)
Full tool spec: `specs/system/assembly_tool.md`

```bash
# Final episode export — primary command
ffmpeg -i concat_list.txt -i music_mix.wav \
  -c:v libx264 -preset slow -crf 18 \
  -c:a aac -b:a 192k -ar 48000 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  output_episode.mp4
```

| Parameter | Value |
|-----------|-------|
| Video codec | libx264 (H.264) |
| Preset | slow (quality over speed) |
| CRF | 18 (visually lossless) |
| Audio codec | AAC |
| Audio bitrate | 192 kbps |
| Audio sample rate | 48000 Hz |
| Pixel format | yuv420p (max compatibility) |
| Fast start | enabled (streaming-optimised) |

**Archival master** (kept alongside delivery file):
```bash
ffmpeg -i concat_list.txt -i music_mix.wav \
  -c:v prores_ks -profile:v 3 \
  -c:a pcm_s24le -ar 48000 \
  output_episode_MASTER.mov
```

---

## 7. FILE SIZE GUIDELINES

| Asset type | Expected size range |
|-----------|-------------------|
| Individual shot (3–5 sec) | 10–50 MB |
| Episode (4–6 min) | 400 MB – 1.5 GB |
| Music track (30–120 sec) | 5–30 MB (WAV) / 1–5 MB (MP3) |
| Thumbnail | Under 2 MB |
| Character reference | Under 5 MB |

Total media storage per episode: approximately 4–10 GB (raw) + 500 MB–1.5 GB (final)

---

## 8. GOOGLE DRIVE ORGANISATION

```
H:\My Drive\SandyStudio_Media\
├── raw\
│   ├── video\
│   │   ├── shots\        ← individual generated shot files
│   │   └── assembly\     ← assembled episode drafts
│   ├── images\
│   │   ├── thumbnails\
│   │   └── references\   ← character reference images
│   └── audio\
│       ├── music\        ← scene music tracks
│       └── stings\       ← short comic music stings
├── reviewed\             ← passed QA
└── approved\             ← Director-approved final assets
    ├── video\
    ├── images\
    └── audio\
```

---

*SandyStudio media_formats.md | v0.2 | Status: APPROVED*
*Changes: Section 6 completed with FFmpeg settings (D-002 APPROVED) · non-chosen assembly options removed*
