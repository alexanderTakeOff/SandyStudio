// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/settings/page.tsx
// Settings — Appearance + Storage tabs.
// ──────────────────────────────────────────────────────────────────────────────

import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { AppearanceSettings } from '@/components/settings/AppearanceSettings';
import { StorageSettings } from '@/components/settings/StorageSettings';
import { ProviderSettings } from '@/components/settings/ProviderSettings';

export default function SettingsPage() {
  return (
    <StudioContentFrame maxWidth="standard">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Appearance, providers, storage paths. Authority Matrix lands in Phase 7.
        </p>
      </header>

      <div className="space-y-5">
        <AppearanceSettings />
        <ProviderSettings />
        <StorageSettings />
      </div>
    </StudioContentFrame>
  );
}
