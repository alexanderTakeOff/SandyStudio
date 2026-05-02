// ──────────────────────────────────────────────────────────────────────────────
// components/series-bible/SeriesBibleView.tsx
// Two-tab Bible container: General idea (markdown) + Library (visual canon).
//
// Spec: specs/company/series_bible.md
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import { FileText, Library as LibraryIcon } from 'lucide-react';
import useSWR from 'swr';
import { fetcher } from '@/lib/swr';
import type { BibleSection } from '@/lib/api/series-bible';
import { GeneralIdeaEditor } from './GeneralIdeaEditor';
import { LibraryFeeds } from './LibraryFeeds';

export interface SeriesBibleViewProps {
  seriesId: string;
  seriesCode: string;
  seriesTitle: string;
}

type SubTab = 'general' | 'library';

interface BibleResponse {
  data: {
    series: { id: string; code: string; title: string };
    sections: BibleSection[];
  };
}

export function SeriesBibleView({ seriesId, seriesCode, seriesTitle }: SeriesBibleViewProps) {
  const [sub, setSub] = useState<SubTab>('general');
  const { data, isLoading, mutate } = useSWR<BibleResponse>(
    `/api/series/${seriesId}/bible`,
    fetcher,
  );
  const sections = data?.data?.sections ?? [];

  const general = sections.find((s) => s.section === 'general_idea')?.assets ?? [];
  const librarySections = sections.filter((s) => s.section !== 'general_idea');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-glass">
        <SubTabButton
          active={sub === 'general'}
          onClick={() => setSub('general')}
          icon={<FileText size={13} />}
          label="General idea"
          count={general.length}
        />
        <SubTabButton
          active={sub === 'library'}
          onClick={() => setSub('library')}
          icon={<LibraryIcon size={13} />}
          label="Library"
          count={librarySections.reduce((n, s) => n + s.assets.length, 0)}
        />
      </div>

      {isLoading && <p className="text-xs text-text-muted">Loading Bible…</p>}

      {!isLoading && sub === 'general' && (
        <GeneralIdeaEditor
          seriesId={seriesId}
          seriesCode={seriesCode}
          assets={general}
          onChange={() => mutate()}
        />
      )}

      {!isLoading && sub === 'library' && (
        <LibraryFeeds
          seriesId={seriesId}
          seriesCode={seriesCode}
          seriesTitle={seriesTitle}
          sections={librarySections}
          onChange={() => mutate()}
        />
      )}
    </div>
  );
}

function SubTabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 h-8 text-xs transition-colors rounded-t"
      style={{
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        borderBottom: active ? '2px solid var(--accent-primary)' : '2px solid transparent',
        marginBottom: '-1px',
      }}
    >
      {icon}
      <span>{label}</span>
      {count > 0 && (
        <span className="text-[10px] text-text-muted">({count})</span>
      )}
    </button>
  );
}
