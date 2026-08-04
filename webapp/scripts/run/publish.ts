// Direct-call publication for the clean run. Uploads the finished cut to the
// series' channel with packaging read from the channel passport, then records
// the video id on the episode row.
//
//   npx tsx scripts/run/publish.ts --file ../FILMS/_run/e35/SS-S15-E35-cut-v04.mp4 \
//     --title "..." --desc-file ../FILMS/_run/e35/packaging.txt [--privacy public]
//
// Publication is a Director-only gate (CLAUDE.md §6). This script performs it;
// the authorisation lives in the conversation, not here.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sb, S15 } from './_env';
import { uploadVideo } from '../../lib/agents/providers/youtube';
import { resolveChannelRefreshToken } from '../../lib/agents/providers/google-auth';

const EPISODE_ID = '9ec4366e-96fa-4324-8de1-89bec5914f80'; // SS-S15-E35

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

async function main() {
  const file = resolve(process.cwd(), arg('file'));
  const title = arg('title');
  const description = readFileSync(resolve(process.cwd(), arg('desc-file')), 'utf8').trim();
  const privacy = arg('privacy', 'public') as 'public' | 'unlisted' | 'private';

  const { data: series } = await sb.from('series').select('channel_id').eq('id', S15).single();
  if (!series?.channel_id) throw new Error('series has no channel — HALT (multi-channel §3)');
  const { data: channel } = await sb
    .from('channels')
    .select('name,credential_key,youtube_channel_id,metadata')
    .eq('id', series.channel_id)
    .single();
  if (!channel) throw new Error('channel row not found');

  const meta = (channel.metadata ?? {}) as Record<string, any>;
  const tags: string[] = meta.branding?.short_tags ?? [];
  const pub = meta.publish_defaults ?? {};

  console.log(`channel: ${channel.name} (${channel.youtube_channel_id}) key=${channel.credential_key}`);
  console.log(`title: ${title}`);
  console.log(`tags: ${tags.join(', ')}`);
  console.log(`privacy: ${privacy}`);

  const bytes = readFileSync(file);
  const refreshToken = resolveChannelRefreshToken(channel.credential_key);

  const res = await uploadVideo(
    {
      bytes,
      title,
      description,
      privacyStatus: privacy,
      tags,
      categoryId: pub.category_id ?? '23',
      madeForKids: pub.made_for_kids ?? false,
      defaultLanguage: pub.default_language ?? 'en',
    },
    { refreshToken },
  );

  console.log(`PUBLISHED ${res.url} (${res.privacyStatus})`);

  const { error } = await sb
    .from('episodes')
    .update({
      status: 'PUBLISHED',
      metadata: { run: 'clean-run', theme_slug: 'the_waiting', youtube_video_id: res.id, youtube_url: res.url },
    })
    .eq('id', EPISODE_ID);
  if (error) console.error(`episode row NOT updated: ${error.message}`);
  else console.log('episode row updated → PUBLISHED');
}

main().catch((e) => {
  console.error('ERROR', e?.message ?? e);
  process.exit(1);
});
