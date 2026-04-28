// ──────────────────────────────────────────────────────────────────────────────
// lib/inngest/client.ts
// Inngest client singleton — server-side only.
// Local-first per webapp.md §2: in dev, the Inngest dev server (npx inngest-cli
// dev) runs on http://localhost:8288 and signs requests itself; INNGEST_*
// keys are only required for production cloud Inngest.
//
// Event names follow webapp.md §4.1: `sandystudio/<agent-code>/<action>`.
// Once an event is in flight, its name is recorded in the Inngest log
// permanently — renames are destructive, so add new events instead of
// changing existing ones.
// ──────────────────────────────────────────────────────────────────────────────

import { Inngest, EventSchemas } from 'inngest';

// ── Common payload fragments ─────────────────────────────────────────────────

interface BaseEpisodeEvent {
  episodeId: string;
}

interface AssetTrigger {
  episodeId: string;
  /** Upstream asset id that produced this event. Optional for cron triggers. */
  assetId?: string;
}

// ── Studio events ────────────────────────────────────────────────────────────

type Events = {
  // ── Phase 3 smoke test ────────────────────────────────────────────────────
  'sandystudio/ping': {
    data: {
      note?: string;
      episodeId?: string | null;
    };
  };

  // ── Phase 4: 11 production agents ─────────────────────────────────────────
  'sandystudio/exec-sw/write-script': {
    data: AssetTrigger & {
      /** Brief asset that triggered the script. */
      briefAssetId: string;
    };
  };

  'sandystudio/exec-srev/review-script': {
    data: AssetTrigger & {
      scriptAssetId: string;
    };
  };

  'sandystudio/exec-sb/create-storyboard': {
    data: AssetTrigger & {
      scriptAssetId: string;
    };
  };

  'sandystudio/exec-wchk/check-world': {
    data: AssetTrigger & {
      storyboardAssetIds: string[]; // 3 acts
    };
  };

  'sandystudio/exec-edit/create-animatic': {
    data: AssetTrigger & {
      storyboardAssetIds: string[];
    };
  };

  /** Per-shot fan-out after EXEC-EDIT animatic approval. */
  'sandystudio/exec-vgen/generate-shot': {
    data: AssetTrigger & {
      shotId: string;
      animaticAssetId: string;
    };
  };

  'sandystudio/exec-mgen/generate-music': {
    data: AssetTrigger & {
      animaticAssetId: string;
      /** "intro" | "act1" | "act2" | "act3" | "outro" — section per music_brief. */
      section: string;
    };
  };

  'sandystudio/exec-thumb/generate-thumbnail': {
    data: AssetTrigger & {
      scriptAssetId: string;
      metadataAssetId: string;
    };
  };

  'sandystudio/exec-copy/write-metadata': {
    data: AssetTrigger & {
      scriptAssetId: string;
    };
  };

  'sandystudio/exec-pub/publish': {
    data: BaseEpisodeEvent & {
      /** REQUIRED in Mode 1/2/3 to bypass governance hard-block. */
      directorConfirm: boolean;
      /** ID of the user/agent that confirmed. */
      confirmedBy?: string;
    };
  };

  /** Emitted by EXEC-PUB after successful publish — triggers analytics scheduling. */
  'sandystudio/exec-pub/published': {
    data: BaseEpisodeEvent & {
      youtubeVideoId: string;
      publishTimestamp: number; // ms epoch
    };
  };

  /** Cron fan-out: schedules 4 future analytics events. */
  'sandystudio/schedule-analytics': {
    data: BaseEpisodeEvent & {
      youtubeVideoId: string;
      publishTimestamp: number;
    };
  };

  'sandystudio/exec-anal/collect': {
    data: BaseEpisodeEvent & {
      youtubeVideoId: string;
      collectionPoint: 'T+1h' | 'T+24h' | 'T+7d' | 'T+30d';
    };
  };
};

export type StudioEventName = keyof Events;

export const inngest = new Inngest({
  id: 'sandystudio',
  schemas: new EventSchemas().fromRecord<Events>(),
});
