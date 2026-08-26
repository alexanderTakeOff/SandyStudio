// Конфигурация ЭПИЗОДА: потолок, настройки генерации, статус. Перо ума, а не
// человека.
//
// ПОЧЕМУ ЭТО ЕСТЬ (доктрина Директора 13.08, повторена 26.08 про конфигурацию):
// «WEB UI это просто пульт управления и просмотровщик. Кнопка должна просто
// давать тебе команду-одобрение от директора, а ты должна сама решать как
// технически». До сих пор потолок и настройки ставились ТОЛЬКО в Episode
// Settings — то есть решение Директора умело исполнять одно место, и оно было
// за компьютером. Ум предъявлял конфигурацию словами и ждал, пока человек
// повторит её мышкой.
//
// ЧТО ЭТО НЕ ОТМЕНЯЕТ: деньги остаются хард-лимитом. `--approve-budget yes`
// требует `--reason` — назвать, ГДЕ Директор это сказал. Инструмент исполняет
// решение, а не принимает его, и след остаётся в ленте.
//
// Contract: `--help`.
import { sb, runEnv } from './_env';
import { defineTool } from './_tool';
import { logEvent } from '../../lib/api/events';

/** Настройки генерации: поля те же, что читают `gen-frame` и `gen-video`. */
interface GenerationConfig {
  image?: { provider_id?: string; quality?: string };
  video?: {
    provider_id?: string;
    aspect_ratio?: string;
    resolution?: string;
    quality_tier?: string;
    allow_shot_overrides?: boolean;
  };
}

function episodeId(): string {
  const id = runEnv('RUN_EPISODE_ID');
  if (!id) throw new Error('RUN_EPISODE_ID не выставлен — конфигурацию некому применить');
  return id;
}

export default defineTool(
  {
    name: 'set-episode',
    summary: 'Применяет конфигурацию эпизода: потолок бюджета, настройки генерации, статус. Исполняет решение Директора, а не принимает его.',
    args: {
      ceiling: { about: 'потолок бюджета эпизода в долларах; без него потолок не трогается', default: '' },
      'approve-budget': {
        about: 'поднять `budget_approved` — гейт траты откроется. Требует `--reason`: где именно Директор это сказал',
        default: 'no',
        values: ['yes', 'no'],
      },
      reason: { about: 'чем подтверждено решение: код ответа Директора, цитата, id реплики. Уходит в ленту', default: '' },
      'image-provider': { about: 'провайдер кадра, напр. `openai-edits-multi`', default: '' },
      'image-quality': { about: 'качество кадра', default: '', values: ['', 'low', 'medium', 'high'] },
      'video-provider': { about: 'провайдер видео, напр. `seedance-fal-img2vid`', default: '' },
      aspect: { about: 'соотношение сторон рендера', default: '', values: ['', '9:16', '16:9', '1:1'] },
      resolution: { about: 'разрешение рендера', default: '', values: ['', '480p', '720p', '1080p'] },
      tier: { about: 'тир качества видео', default: '', values: ['', 'lite', 'standard', 'pro'] },
      status: { about: 'статус эпизода; без него не трогается', default: '' },
    },
    env: {
      RUN_EPISODE_ID: { about: 'эпизод, чью конфигурацию применяем; умолчания нет намеренно' },
    },
    reads: ['episodes'],
    writes: ['episodes', 'activity_events'],
    // Сквозной: конфигурация не принадлежит станции, она их всех обслуживает.
    stations: [],
  },
  async ({ arg, wasGiven }) => {
    const id = episodeId();
    const { data, error } = await sb
      .from('episodes')
      .select('episode_code,budget_ceiling,status,metadata')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`чтение эпизода: ${error.message}`);
    if (!data) throw new Error(`эпизода ${id} нет — RUN_EPISODE_ID указывает в никуда`);
    const row = data as { episode_code: string; budget_ceiling: number | null; status: string; metadata: Record<string, unknown> | null };
    const meta = { ...((row.metadata ?? {}) as Record<string, unknown>) };
    const gen = { ...((meta.generation_config ?? {}) as GenerationConfig) };

    const changes: string[] = [];
    const patch: Record<string, unknown> = {};

    if (wasGiven('ceiling') && arg('ceiling')) {
      const value = Number(arg('ceiling'));
      if (!Number.isFinite(value) || value <= 0) throw new Error(`потолок «${arg('ceiling')}» не число больше нуля`);
      patch.budget_ceiling = value;
      changes.push(`потолок $${value.toFixed(2)}`);
    }

    if (wasGiven('image-provider') && arg('image-provider')) {
      gen.image = { ...(gen.image ?? {}), provider_id: arg('image-provider') };
      changes.push(`кадр: ${arg('image-provider')}`);
    }
    if (wasGiven('image-quality') && arg('image-quality')) {
      gen.image = { ...(gen.image ?? {}), quality: arg('image-quality') };
      changes.push(`качество кадра: ${arg('image-quality')}`);
    }
    if (wasGiven('video-provider') && arg('video-provider')) {
      gen.video = { ...(gen.video ?? {}), provider_id: arg('video-provider') };
      changes.push(`видео: ${arg('video-provider')}`);
    }
    if (wasGiven('aspect') && arg('aspect')) {
      gen.video = { ...(gen.video ?? {}), aspect_ratio: arg('aspect') };
      changes.push(`аспект: ${arg('aspect')}`);
    }
    if (wasGiven('resolution') && arg('resolution')) {
      gen.video = { ...(gen.video ?? {}), resolution: arg('resolution') };
      changes.push(`разрешение: ${arg('resolution')}`);
    }
    if (wasGiven('tier') && arg('tier')) {
      gen.video = { ...(gen.video ?? {}), quality_tier: arg('tier') };
      changes.push(`тир: ${arg('tier')}`);
    }
    if (gen.image || gen.video) meta.generation_config = gen;

    if (arg('approve-budget') === 'yes') {
      // Деньги — хард-лимит Директора. Инструмент ИСПОЛНЯЕТ его решение, поэтому
      // обязан назвать, где оно прозвучало: без следа это самоутверждение.
      const reason = arg('reason').trim();
      if (!reason) {
        throw new Error(
          'утверждение бюджета требует --reason: назови, ГДЕ Директор это сказал ' +
            '(код ответа с кнопки, цитата, id реплики). Без следа это не исполнение решения, а его подмена.',
        );
      }
      meta.budget_approved = true;
      meta.budget_approved_reason = reason;
      changes.push('бюджет утверждён');
    }

    if (wasGiven('status') && arg('status')) {
      patch.status = arg('status');
      changes.push(`статус: ${arg('status')}`);
    }

    if (changes.length === 0) {
      console.log(`${row.episode_code}: менять нечего — ни один аргумент не задан. Контракт: --help`);
      return;
    }

    patch.metadata = meta;
    const { error: upErr } = await sb.from('episodes').update(patch).eq('id', id);
    if (upErr) throw new Error(`запись эпизода: ${upErr.message}`);

    await logEvent(sb as never, {
      episode_id: id,
      event_type: 'episode_config_changed',
      title: `Конфигурация эпизода: ${changes.join(' · ')}`,
      description: arg('reason') || null,
      actor: 'EXEC-CONC',
      metadata: { changes, reason: arg('reason') || null },
    });

    console.log(`${row.episode_code}: ${changes.join(' · ')}`);
    if (arg('approve-budget') === 'yes') console.log(`основание: ${arg('reason')}`);
  },
);
