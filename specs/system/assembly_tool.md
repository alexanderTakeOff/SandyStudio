# SandyStudio — Assembly Tool Spec
## specs/system/assembly_tool.md | v0.2 | APPROVED

> **✅ DIRECTOR DECISION: B4 FFmpeg**
> Primary assembly: FFmpeg (fully automated via Claude Code / EXEC-ORCH).
> Optional colour pass: DaVinci Resolve (manual, Director-only step).
> Approved by Director (Sandy) on 2026-04-24.

---

## PURPOSE

The assembly tool is the software used to combine all generated shots and music tracks
into a final episode file. This decision determines:
- What format EXEC-VGEN must export video files (codec, resolution, frame rate)
- What format EXEC-MGEN must export audio files
- How the assembly process works (manual, semi-automated, or fully automated)
- What technical skills or infrastructure are needed

This decision must be locked before `specs/system/media_formats.md` is finalised.

---

## THE FOUR OPTIONS

### B1 — DaVinci Resolve

**What it is:** Professional non-linear video editor by Blackmagic Design. Free version
available with full editing and colour grading capabilities.

**Assembly process:** Manual — Sandy (or a Producer) imports assets into a timeline,
arranges shots per storyboard order, syncs music, exports.

**Automation potential:** Medium — DaVinci has scripting (Python/Lua) that could
partially automate timeline assembly from a structured file (e.g. EDL or XML).
EXEC-ORCH could generate an EDL file from the storyboard, which DaVinci imports.

**Input requirements:**
- Video: H.264 or ProRes preferred, 1920×1080 or 4K
- Audio: WAV or AIFF, 48kHz, 24-bit

**Output:** H.264 or H.265 MP4, or ProRes for archival

**Pros:**
- Professional quality colour grading built-in
- Free (Resolve Studio paid version not required for this use case)
- Industry-standard format
- Strong community and documentation

**Cons:**
- Requires installation on Sandy's machine
- Manual assembly for each episode (2–4 hours per episode)
- Partial automation only via EDL

**Recommended if:** Quality and colour grading are priorities; manual assembly is acceptable.

---

### B2 — Adobe Premiere Pro

**What it is:** Industry-standard NLE (Non-Linear Editor) by Adobe. Subscription required.

**Assembly process:** Manual — same as DaVinci. Premiere has stronger ecosystem
integration (After Effects, Audition) for post-production effects.

**Automation potential:** Medium — Premiere scripting (ExtendScript, UXP) allows
timeline creation from structured data.

**Input requirements:**
- Video: H.264, H.265, or ProRes
- Audio: WAV, MP3, AAC

**Pros:**
- Industry standard, excellent format support
- Adobe ecosystem (if AE effects needed later)
- Strong scripting for partial automation

**Cons:**
- Monthly subscription cost (~$55/month)
- Requires installation
- Similar manual effort to DaVinci

**Recommended if:** Adobe ecosystem already in use; post-effects likely in future.

---

### B3 — CapCut

**What it is:** Consumer video editor by ByteDance. Free tier available, Pro subscription for advanced features.

**Assembly process:** Manual — simpler interface, fewer professional features.

**Automation potential:** Low — no scripting API.

**Input requirements:**
- Video: MP4 (H.264)
- Audio: MP3, WAV

**Pros:**
- Extremely easy to use
- Fast for simple edits
- Built-in effects and transitions
- Free

**Cons:**
- Not suitable for professional colour grading
- No automation possible
- Limited format support
- Output quality ceiling lower than B1/B2
- Not appropriate if distributing to YouTube at high quality

**Recommended if:** Speed and simplicity are the only priorities; quality secondary.

---

### B4 — FFmpeg (CLI automation)

**What it is:** Open-source command-line tool for video processing. Fully automatable.
Assembly would be scripted by Claude Code (or a Developer) using FFmpeg commands.

**Assembly process:** Fully automated — EXEC-ORCH generates an assembly script
(a sequence of FFmpeg commands) from the approved storyboard. Script runs, produces episode.

**Automation potential:** Full — this is the only option where assembly can be
completely automated, including:
- Ordering shots per storyboard
- Concatenating clips
- Mixing music with video
- Applying shot durations
- Outputting to any format

**Input requirements:**
- Video: Any (FFmpeg supports all common formats)
- Audio: Any

**Output:** Any format (H.264 MP4 recommended for YouTube)

**Pros:**
- Full automation — no manual assembly step
- No subscription cost
- Maximum reproducibility
- Fits AUTOPILOT MODE perfectly

**Cons:**
- No visual timeline — Sandy cannot "see" the edit during assembly
- Complex transitions require scripting
- No built-in colour grading (would need separate tool)
- Errors produce silent failures without monitoring
- Requires Developer to write and maintain assembly scripts

**Recommended if:** Automation is the highest priority; manual review of cut is
acceptable post-generation; technical resource available.

---

## SECTION 2 — DIRECTOR DECISION

**Choose one tool:**

| Option | Tool | Automation | Cost | Quality ceiling |
|--------|------|-----------|------|----------------|
| **B1** | DaVinci Resolve | Partial | Free | Professional |
| **B2** | Adobe Premiere Pro | Partial | ~$55/mo | Professional |
| **B3** | CapCut | None | Free/Pro | Consumer |
| **B4** | FFmpeg | Full | Free | Professional |

**Recommendation:** B4 for maximum automation alignment with SandyStudio's AI-first model.
If colour grading is important: B1 DaVinci for human review step, B4 for initial assembly.
Hybrid possible: FFmpeg assembles raw cut → DaVinci for colour and final export.

**Sandy's choice:** ✅ **B4 FFmpeg** — fully automated assembly + optional DaVinci colour pass

---

## SECTION 3 — IMPLEMENTATION (fills in after decision)

*This section will be completed once Director selects a tool.*

### If B4 (FFmpeg) selected:

```
EXEC-ORCH generates assembly manifest from approved storyboard:
  - Shot list in order (file paths + durations)
  - Music track assignments per scene
  - Transition types (cut / fade)

Developer writes FFmpeg assembly script template.
EXEC-ORCH populates template per episode → runs assembly → outputs to raw/video/

Output naming: SS-S01-E[NN]-VID-assembly_cut-v01-DRAFT.mp4
```

### If B1 or B2 selected:

```
EXEC-ORCH generates EDL (Edit Decision List) from approved storyboard.
Sandy (or Producer) imports EDL into DaVinci/Premiere.
Manual assembly: arrange, sync music, colour grade, export.
Output: SS-S01-E[NN]-VID-final_cut-v01-DRAFT.mp4
```

---

*SandyStudio assembly_tool.md | v0.1 | Status: DRAFT — awaiting Director decision*
