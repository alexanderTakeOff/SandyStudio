// ──────────────────────────────────────────────────────────────────────────────
// components/series-bible/LibraryFeeds.tsx
// Library tab — vertical-stacked feeds (Heroes, Locations, Objects, Style, Audio).
// Each feed is a labelled section with an "Add" button and a grid of cards.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { BibleSection, SbSection } from '@/lib/api/series-bible';
import { sectionLabel } from '@/lib/api/series-bible';
import { AssetCard } from './AssetCard';
import { AddAssetModal } from './AddAssetModal';

const ADD_LABELS: Record<Exclude<SbSection, 'general_idea'>, string> = {
  character: 'Add hero',
  location: 'Add location',
  object: 'Add object',
  style: 'Add style entry',
  audio: 'Add audio (planned — Step 8)',
};

const EMOJIS: Record<Exclude<SbSection, 'general_idea'>, string> = {
  character: '🧑',
  location: '🏛',
  object: '🎯',
  style: '🎨',
  audio: '🎵',
};

export interface LibraryFeedsProps {
  seriesId: string;
  seriesCode: string;
  seriesTitle: string;
  sections: BibleSection[];
  onChange: () => void;
}

export function LibraryFeeds({
  seriesId,
  seriesCode,
  seriesTitle,
  sections,
  onChange,
}: LibraryFeedsProps) {
  const [addOpen, setAddOpen] = useState<Exclude<SbSection, 'general_idea'> | null>(null);

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        if (section.section === 'general_idea') return null;
        const sec = section.section as Exclude<SbSection, 'general_idea'>;
        const isAudioMvp = sec === 'audio';
        return (
          <section key={sec} className="space-y-2">
            <header className="flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-base">{EMOJIS[sec]}</span>
                <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
                  {sectionLabel(sec)}
                </h2>
                <span className="text-[10px] text-text-muted">
                  ({section.assets.length})
                </span>
              </div>
              <Button
                variant="ghost"
                onClick={() => setAddOpen(sec)}
                disabled={isAudioMvp}
                title={isAudioMvp ? 'Audio media generation lands in Step 8' : ADD_LABELS[sec]}
              >
                <Plus size={13} /> {ADD_LABELS[sec]}
              </Button>
            </header>

            {section.assets.length === 0 ? (
              <Card>
                <CardBody>
                  <p className="text-xs text-text-muted text-center py-3">
                    No {sectionLabel(sec).toLowerCase()} yet — click <span className="font-medium">{ADD_LABELS[sec]}</span> to start.
                  </p>
                </CardBody>
              </Card>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {section.assets.map((a) => (
                  <AssetCard
                    key={a.id}
                    seriesId={seriesId}
                    asset={a}
                    section={sec}
                    onChange={onChange}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {addOpen && (
        <AddAssetModal
          open={true}
          onClose={() => setAddOpen(null)}
          onCreated={() => {
            setAddOpen(null);
            onChange();
          }}
          seriesId={seriesId}
          seriesCode={seriesCode}
          seriesTitle={seriesTitle}
          section={addOpen}
          existingNames={(sections.find((s) => s.section === addOpen)?.assets ?? []).map(
            (a) => a.filename,
          )}
        />
      )}
    </div>
  );
}
