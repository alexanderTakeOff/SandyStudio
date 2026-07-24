// ──────────────────────────────────────────────────────────────────────────────
// components/studio-shell/StudioTopbar.tsx
// The non-scrolling top bar. Per the 2026-07-24 UI cleanup it is no longer global
// chrome: it is a CONTEXTUAL PAGE HEADER host. Each page portals its own identity
// + actions into `#studio-topbar-slot` (see the episode page for the pattern).
// When a page portals nothing, the bar is simply empty.
// History: search mockup + system-mode (ANALYTICS/EDIT) chip removed 2026-07-24;
// governance-mode lever moved into Episode Settings in the same cleanup (Chunk 2c).
// ──────────────────────────────────────────────────────────────────────────────

export function StudioTopbar() {
  return (
    <header className="relative z-20 flex items-center gap-3 h-14 px-4 border-b border-glass bg-panel-glass backdrop-blur-md">
      {/* Contextual page-header slot — pages portal `code · title · budget · ⋯`
          (or their own identity) into this by id. Empty on pages that don't. */}
      <div id="studio-topbar-slot" className="flex-1 min-w-0 flex items-center gap-3" />
    </header>
  );
}
