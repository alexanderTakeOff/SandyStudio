// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/settings/page.tsx
// Settings — Appearance + Providers + Storage.
// Muted descriptive copy is hidden behind <PeekHint> — auto-peeks on first
// arrival, then tucks itself away. Director can silence inline hints globally
// via the <HintsToggle> in the header.
// ──────────────────────────────────────────────────────────────────────────────

import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { AppearanceSettings } from '@/components/settings/AppearanceSettings';
import { StorageSettings } from '@/components/settings/StorageSettings';
import { ProviderSettings } from '@/components/settings/ProviderSettings';
import { ChannelSettings } from '@/components/settings/ChannelSettings';
import { HintsToggle } from '@/components/settings/HintsToggle';
import { PeekHint } from '@/components/ui/PeekHint';

export default function SettingsPage() {
  return (
    <StudioContentFrame maxWidth="standard">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
          <PeekHint side="bottom" autoPeekMs={4000}>
            Appearance, providers, storage paths. Authority Matrix lands in Phase 7.
          </PeekHint>
        </div>
        <HintsToggle />
      </header>

      <div className="space-y-5">
        <AppearanceSettings />
        <ProviderSettings />
        <ChannelSettings />
        <StorageSettings />
      </div>
    </StudioContentFrame>
  );
}
