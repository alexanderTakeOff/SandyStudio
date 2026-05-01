// One-shot bootstrap for a Sandy series Bible.
// Creates a minimum DRAFT Bible (Director can then LOCK from the UI):
//   - SBL-general_idea v01 — premise text
//   - SBL-style_visual  v01 — visual direction
//   - SBL-character_sandy v01 — Sandy hourglass description + generated image
//   - SBL-location_cafe   v01 — Cafe description + generated image
//
// Cost: ~$0.10 (2× gpt-image-1 @ medium quality). Anthropic not used here.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/seed-sandy-bible.ts SS-S03

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadDotenvOverride(filename: string): void {
  try {
    const text = readFileSync(resolve(process.cwd(), filename), 'utf-8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch { /* ignore */ }
}
loadDotenvOverride('.env.local');

import { generateImageOpenAI } from '../lib/agents/providers/openai-image';
import { persistBinary } from '../lib/agents/persist-binary';

const GENERAL_IDEA = `# General idea — Sandy series

## Premise
Sandy is a soft silicone hourglass character living in a flat 2D world. The
golden sand inside his body falls in slow rhythm, and his physical state
mirrors his emotions — pressure, joy, embarrassment all become visible
deformations.

## Philosophy — VISUAL DETERMINISM
Comedy comes from physics, not dialogue. Every gag is a body-language gag:
stretching, vibrating, expanding, deflating. The viewer reads the joke
through the eyes alone.

## World rules
- Objects in this world have body language. Inanimate things react with
  posture, color shift, micro-deformation.
- No dialogue. No voiceover. Music + SFX carry timing.
- Sand flow rate inside Sandy is the heartbeat — it speeds up under stress
  and stops at moments of awe or shock.

## Tone
Pink Panther DNA. Slapstick that lands without words. Episodes are 30–60s.
`;

const STYLE_VISUAL = `# Style — Sandy series

Flat 2D cartoon. Bold black outlines (3–4 px). Soft pastel gradients inside
shapes. Muted palette — desaturated yellows, dusty pinks, sage greens.

Layout: shallow depth, character-on-stage feel. Backgrounds simple,
foreground reads at thumbnail scale. Camera is mostly stationary; comedy
comes from the character's body, not from cuts.

Lighting: even ambient + one warm key light. Shadows are simplified shapes,
not gradients.

Type: when used (rarely), monospace caps, small.

Reference touchstones:
- Pink Panther (1969, animation, no dialogue)
- Adventure Time linework
- Pastel palettes from Studio Ghibli's daytime scenes
`;

const SANDY_DESCRIPTION = `Silicone hourglass character. Soft, semi-translucent body roughly 60cm
tall, top and bottom bulbs of equal size. Inside flows fine golden sand
which falls at a slow steady rhythm. Wears small white gloves on stubby
arms; no legs — slides or hops. Face: simple oval eyes, tiny mouth,
expressive. Body deforms freely under emotion: stretches taller in
excitement, compresses flat in disappointment, vibrates under stress.
Personality: optimistic, easily flustered, soft-hearted.`;

const CAFE_DESCRIPTION = `Small flat-2D cafe. Round wooden tables (3–4 visible), bentwood chairs,
large window stage-left bringing in soft warm afternoon light. Pastel
yellow walls. Counter at back-right with a coffee machine silhouette.
Empty in most shots — it's a stage for the comedy, not a busy public
space. Mood: calm, intimate, slightly Mediterranean.`;

interface InsertedAsset {
  id: string;
  filename: string;
  status: string;
}

async function seedFor(seriesCode: string): Promise<void> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const series = await sb.from('series').select('id,code,title').eq('code', seriesCode).limit(1);
  if (series.error || !series.data || !series.data[0]) {
    throw new Error(`Series ${seriesCode} not found`);
  }
  const ser = series.data[0];
  console.log(`[seed] series ${ser.code} = ${ser.id} ("${ser.title}")`);

  // Helper: insert an asset row. Skips if a same-file_type already exists.
  async function insert(args: {
    file_type: string;
    filename: string;
    description: string | null;
    content: string | null;
    staging_path: string | null;
    drive_file_id: string | null;
    drive_web_view_url: string | null;
  }): Promise<InsertedAsset | null> {
    const { data: existing } = await sb
      .from('assets')
      .select('id,filename,status')
      .eq('series_id', ser.id)
      .eq('file_type', args.file_type)
      .limit(1);
    if (existing && existing[0]) {
      console.log(`        skip (already exists): ${(existing[0] as { filename: string }).filename}`);
      return null;
    }
    const { data, error } = await sb
      .from('assets')
      .insert({
        series_id: ser.id,
        episode_id: null,
        file_type: args.file_type,
        filename: args.filename,
        description: args.description,
        content: args.content,
        staging_path: args.staging_path,
        drive_file_id: args.drive_file_id,
        drive_web_view_url: args.drive_web_view_url,
        drive_path: null,
        status: 'DRAFT',
        version: 1,
        agent_id: 'Director',
      })
      .select('id,filename,status')
      .single();
    if (error) {
      console.error(`        ! insert failed: ${error.message}`);
      return null;
    }
    console.log(`        + ${data.filename}`);
    return data as InsertedAsset;
  }

  // 1. General idea
  console.log(`[seed] 1/4 — SBL-general_idea`);
  await insert({
    file_type: 'SBL-general_idea',
    filename: `${ser.code}-SBL-general_idea_main-v01-DRAFT.md`,
    description: 'Sandy series — premise, philosophy, world rules, tone',
    content: GENERAL_IDEA,
    staging_path: null,
    drive_file_id: null,
    drive_web_view_url: null,
  });

  // 2. Style guide
  console.log(`[seed] 2/4 — SBL-style_visual`);
  await insert({
    file_type: 'SBL-style_visual',
    filename: `${ser.code}-SBL-style_visual-v01-DRAFT.md`,
    description: 'Flat 2D bold outlines, pastel palette, character-stage layout',
    content: STYLE_VISUAL,
    staging_path: null,
    drive_file_id: null,
    drive_web_view_url: null,
  });

  // 3. Sandy character — generate image
  console.log(`[seed] 3/4 — SBL-character_sandy (gpt-image-1, paid ~$0.04)`);
  const sandyImg = await generateImageOpenAI({
    prompt: [
      `Canonical character reference for the animated series "${ser.title}".`,
      '',
      'Description:',
      SANDY_DESCRIPTION,
      '',
      'Series art direction (must follow):',
      `- ${STYLE_VISUAL.slice(0, 600)}`,
      '',
      'Render as a clean reference image — front-facing, neutral background, full-body, no text overlay, no logo.',
    ].join('\n'),
    size: '1024x1024',
    quality: 'medium',
  });
  const sandyPersisted = await persistBinary({
    base64: sandyImg.b64_data,
    ext: 'png',
    driveFilename: `${ser.code}-SBL-character_sandy-staging.png`,
    localHint: `bible-character-sandy`,
    supabase: sb,
  });
  await insert({
    file_type: 'SBL-character_sandy',
    filename: `${ser.code}-SBL-character_sandy-v01-DRAFT.png`,
    description: SANDY_DESCRIPTION,
    content: null,
    staging_path: sandyPersisted.browserUrl,
    drive_file_id: sandyPersisted.driveFileId,
    drive_web_view_url: sandyPersisted.driveWebViewUrl,
  });

  // 4. Cafe location — generate image
  console.log(`[seed] 4/4 — SBL-location_cafe (gpt-image-1, paid ~$0.04)`);
  const cafeImg = await generateImageOpenAI({
    prompt: [
      `Canonical location reference for the animated series "${ser.title}".`,
      '',
      'Description:',
      CAFE_DESCRIPTION,
      '',
      'Series art direction (must follow):',
      `- ${STYLE_VISUAL.slice(0, 600)}`,
      '',
      'Render as a clean reference image — wide establishing angle, no characters, neutral lighting, no text or logos.',
    ].join('\n'),
    size: '1024x1024',
    quality: 'medium',
  });
  const cafePersisted = await persistBinary({
    base64: cafeImg.b64_data,
    ext: 'png',
    driveFilename: `${ser.code}-SBL-location_cafe-staging.png`,
    localHint: `bible-location-cafe`,
    supabase: sb,
  });
  await insert({
    file_type: 'SBL-location_cafe',
    filename: `${ser.code}-SBL-location_cafe-v01-DRAFT.png`,
    description: CAFE_DESCRIPTION,
    content: null,
    staging_path: cafePersisted.browserUrl,
    drive_file_id: cafePersisted.driveFileId,
    drive_web_view_url: cafePersisted.driveWebViewUrl,
  });

  console.log('');
  console.log('[seed] DONE.');
  console.log('[seed] Open /series/' + ser.id + '?tab=bible to LOCK each entry.');
  console.log('[seed] Once at least 1 character + 1 style are LOCKED, EXEC-EREF gate passes.');
}

const seriesCode = process.argv[2] ?? 'SS-S03';
seedFor(seriesCode).catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
