// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/settings/page.tsx
// Settings → Appearance per uiux.md §7. Other tabs land in later phases.
// ──────────────────────────────────────────────────────────────────────────────

import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { AppearanceSettings } from '@/components/settings/AppearanceSettings';

export default function SettingsPage() {
  return (
    <StudioContentFrame maxWidth="standard">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Studio appearance, governance, agents. More tabs land in later phases.
        </p>
      </header>

      <AppearanceSettings />
    </StudioContentFrame>
  );
}
