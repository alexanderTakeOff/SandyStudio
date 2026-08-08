// РОУТ ЕДИНОГО УМА (Ф4.4) — тонкий: сообщения → цикл тулов → стрим. Без
// режимной машинерии, спин-гардов и await-детекторов старого роута (он жив до
// Ф6, но сюда не смотрит). Оркестрация — мышление ума, не кодовая начинка
// (доктрина §25).
//
// ЗАКОН ТРЕДА: тред = эпизод (доктрина §7). Роут НИКОГДА не перепривязывает
// тред к другому эпизоду — при смене эпизода панель получает ДРУГОЙ тред через
// X-Concierge-Thread-Id (её обработчик смены уже это умеет). Параллельные
// сериалы = параллельные треды; каша, которую помнит Директор, была решением
// «chat follows the open episode» 2026-06-23 — здесь оно отменено.
//
// Протокол стрима — тот же JSON-на-строку, что понимает панель:
//   {t:'tool_start', id, name, args_preview} · {t:'tool_result', id, name, ok}
//   {t:'text', v} · {t:'error', message}
//
// Два мира инструментов, один цикл: тулы реестра идут через мост
// (invokeMindTool, env из ТРЕДА — не из process.env), выжившие чат-тулы — через
// их собственный execute. Хард-лимит публикации держится и здесь, не только в
// промпте: publish исполняется лишь при живой человеческой сессии.
import { NextRequest } from 'next/server';
import type OpenAI from 'openai';
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { applyConciergeProviderOverride } from '@/lib/api/concierge-provider-config';
import {
  createConciergeClient,
  conciergeModel,
  conciergeMaxTokensParam,
  conciergeSupportsTemperature,
  conciergeReasoningParam,
  conciergeOpenAiReasoningParam,
  isOpenAiGpt5Model,
} from '@/lib/concierge/llm';
import { createConciergeCompletion } from '@/lib/concierge/anthropic-native';
import {
  createThread,
  getThread,
  persistTurn,
  resolveOpenThreadId,
} from '@/lib/concierge/threads';
import { seriesIdForEpisode } from '@/lib/api/series-bible';
import {
  invokeMindTool,
  mindToolSchemas,
  type MindToolResult,
  type MultimodalToolResult,
} from '@/lib/mind/tool-bridge';
import { HARNESS_TOOLS } from '../../../../scripts/run/_tool';
import { MIND_CHAT_TOOLS, findMindChatTool } from '@/lib/mind/chat-tools';
import { buildMindPromptParts, loadDoctrine } from '@/lib/mind/prompt';
import { listSkillManifests } from '@/lib/skills/select-skills';
import { AGENT_REGISTRY } from '@/lib/agents/registry';
import type { ToolContext } from '@/lib/concierge/tools/types';

export const maxDuration = 600; // цикл ума с генерациями — минуты, не секунды

const MAX_ROUNDS = 32;
const MAX_TOKENS = Number(process.env.MIND_MAX_TOKENS ?? 8192);

interface WireMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface MindChatBody {
  messages?: WireMessage[];
  threadId?: string;
  episodeId?: string;
}

/** Полный набор function-calling схем: мост реестра + выжившие чат-тулы. */
function allToolSchemas(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return [
    ...(mindToolSchemas() as unknown as OpenAI.Chat.Completions.ChatCompletionTool[]),
    ...(MIND_CHAT_TOOLS.map((t) => t.schema) as unknown as OpenAI.Chat.Completions.ChatCompletionTool[]),
  ];
}

export async function POST(req: NextRequest): Promise<Response> {
  const supabase = createSupabaseServiceRoleClient();
  await applyConciergeProviderOverride(supabase);

  let body: MindChatBody;
  try {
    body = (await req.json()) as MindChatBody;
  } catch {
    return Response.json({ ok: false, error: 'тело запроса не JSON' }, { status: 400 });
  }
  const wire = (body.messages ?? []).filter((m) => m.role === 'user' || m.role === 'assistant');
  const lastUser = [...wire].reverse().find((m) => m.role === 'user');
  if (!lastUser?.content.trim()) {
    return Response.json({ ok: false, error: 'нет сообщения пользователя' }, { status: 400 });
  }

  // ── Тред: тред = эпизод, перепривязки нет ─────────────────────────────────
  const episodeId = body.episodeId ?? null;
  let thread = body.threadId ? await getThread(supabase, body.threadId) : null;
  if (thread && episodeId && thread.episode_id !== episodeId) {
    thread = null; // другой эпизод живёт в СВОЁМ треде — ищем/заводим его ниже
  }
  if (!thread) {
    const seriesId = episodeId ? await seriesIdForEpisode(supabase, episodeId) : null;
    const existingId = await resolveOpenThreadId(supabase, {
      episodeId,
      seriesId,
    });
    thread = existingId ? await getThread(supabase, existingId) : null;
    if (thread && episodeId && thread.episode_id !== episodeId) thread = null; // тред серии ≠ тред эпизода
    thread ??= await createThread(supabase, {
      episodeId,
      seriesId,
      activeMode: '3',
    });
  }
  const threadId = thread.id;
  const boundEpisodeId = thread.episode_id ?? null;

  // ── Контекст эпизода и серии из базы ──────────────────────────────────────
  let episode: { code: string; title: string; ceiling: number | null; spent: number } | null = null;
  let series: { id: string; code: string; title: string; genre: string | null } | null = null;
  if (boundEpisodeId) {
    const { data: ep } = await supabase
      .from('episodes')
      .select('episode_code,title_working,budget_ceiling,budget_spent,series_id')
      .eq('id', boundEpisodeId)
      .maybeSingle();
    if (ep) {
      episode = {
        code: ep.episode_code,
        title: ep.title_working ?? '',
        ceiling: ep.budget_ceiling,
        spent: ep.budget_spent ?? 0,
      };
      const { data: s } = await supabase
        .from('series')
        .select('id,code,title,genre')
        .eq('id', ep.series_id)
        .maybeSingle();
      if (s) series = s;
    }
  } else if (thread.series_id) {
    const { data: s } = await supabase
      .from('series')
      .select('id,code,title,genre')
      .eq('id', thread.series_id)
      .maybeSingle();
    if (s) series = s;
  }

  // Скиллы оси работ — квота снята (доктрина §21).
  //
  // 2026-08-08 — `agent` появился здесь не сразу, и без него ум получал РОВНО НОЛЬ
  // скиллов: все ACTIVE-скиллы на диске объявляют `applies_when.agent`, а селектор
  // при заданном скоупе и пустом значении в контексте отвечает «не подходит». Ум
  // работал без всей ремесленной библиотеки студии — это корень D76 (написала
  // сториборд без машиночитаемого контракта, потому что `storyboarder-cosmic-horror`
  // ей не выдали), и брак этим не ограничивался.
  //
  // Ум собой заменяет ВСЕХ маленьких агентов (доктрина парадигмы), поэтому берём
  // реестр целиком, а не выдуманное подмножество: новая роль студии автоматически
  // становится видна уму, и второй список ролей, расходящийся с первым, не заводится.
  // Снять `agent`-скоуп было НЕЛЬЗЯ — тогда `sandy-gag-library` (`genre:[comedy]`,
  // Sandy-специфичный) протёк бы в cosmic_horror; прочие оси фильтруют как прежде.
  const manifests = await listSkillManifests(
    {
      agent: Object.keys(AGENT_REGISTRY),
      series_id: series?.id,
      episode_id: boundEpisodeId ?? undefined,
      genre: series?.genre ?? undefined,
    },
    { limit: Infinity },
  );

  const promptParts = buildMindPromptParts({
    doctrine: loadDoctrine(),
    series: series ? { code: series.code, title: series.title } : null,
    episode,
    skills: manifests.map((m) => ({ slug: m.slug, summary: m.frontmatter.description })),
  });

  // ── Инструментальный контекст ─────────────────────────────────────────────
  // Env для тулов реестра — из ТРЕДА. Панельная сессия несёт cookie Директора;
  // публикация (хард-лимит §19) без живого человека не исполняется.
  const runEnv: Record<string, string> = {};
  if (boundEpisodeId) runEnv.RUN_EPISODE_ID = boundEpisodeId;
  if (series?.id) runEnv.RUN_SERIES_ID = series.id;
  const cookieHeader = req.headers.get('cookie');
  const humanSession = Boolean(cookieHeader);
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const chatToolCtx: ToolContext = {
    supabase,
    threadId,
    mode: '3',
    episodeId: boundEpisodeId,
    episodeCode: episode?.code ?? null,
    cookieHeader,
    appOrigin,
  };

  await persistTurn(supabase, threadId, {
    role: 'director',
    event_type: 'message',
    content: lastUser.content,
    metadata: { surface: 'mind-chat' },
  });

  const client = createConciergeClient();
  const model = conciergeModel();
  const isGpt5 = isOpenAiGpt5Model(model);
  const tools = allToolSchemas();

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: `${promptParts.stable}\n\n${promptParts.dynamic}` },
    ...wire.map((m) => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam),
  ];

  const encoder = new TextEncoder();
  const toolAudit: Array<{ name: string; ok: boolean; ms: number }> = [];
  let cacheRead = 0;
  let cacheWrite = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        let finalText = '';
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const params = {
            model,
            messages,
            tools,
            ...conciergeMaxTokensParam(MAX_TOKENS),
            ...(conciergeSupportsTemperature() ? { temperature: 0.7 } : {}),
            ...conciergeReasoningParam(),
            ...conciergeOpenAiReasoningParam(isGpt5, true),
          } as ChatCompletionCreateParamsNonStreaming;

          const completion = await createConciergeCompletion(client, params, {
            systemSplit: promptParts,
          });
          const usage = completion.usage;
          cacheRead += usage?.cache_read_input_tokens ?? 0;
          cacheWrite += usage?.cache_creation_input_tokens ?? 0;

          const msg = completion.choices[0]?.message;
          const toolCalls = msg?.tool_calls ?? [];

          if (toolCalls.length === 0) {
            finalText = msg?.content ?? '';
            if (finalText) emit({ t: 'text', v: finalText });
            break;
          }

          messages.push({
            role: 'assistant',
            content: msg?.content ?? null,
            tool_calls: toolCalls.map((c) => ({
              id: c.id,
              type: 'function' as const,
              function: { name: c.function.name, arguments: c.function.arguments },
            })),
          });

          for (const call of toolCalls) {
            const name = call.function.name;
            const started = Date.now();
            emit({
              t: 'tool_start',
              id: call.id,
              name,
              args_preview: call.function.arguments.slice(0, 160),
            });

            let resultText: string;
            let resultImages: MindToolResult['images'];
            let ok = false;
            try {
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
              } catch {
                /* пустые аргументы — пусть валидация тула скажет своё */
              }

              if (HARNESS_TOOLS.has(name)) {
                // Хард-лимит §19: публикация — только при живом человеке в сессии.
                if (name === 'publish' && !humanSession) {
                  resultText = 'ERROR: публикация — хард-лимит Директора; без его живой сессии не исполняется';
                } else {
                  const res = await invokeMindTool(name, args, runEnv);
                  ok = res.ok;
                  resultText = res.output || '(инструмент отработал молча — это его дефект, вывода нет)';
                  resultImages = res.images;
                }
              } else {
                const chatTool = findMindChatTool(name);
                if (!chatTool) {
                  resultText = `ERROR: инструмента «${name}» нет — см. docs/TOOLS.md`;
                } else {
                  const parsed = chatTool.parse(call.function.arguments || '{}');
                  const res = await chatTool.execute(parsed, chatToolCtx);
                  ok = res.ok;
                  resultText = JSON.stringify(res);
                }
              }
            } catch (e) {
              resultText = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
            }

            const ms = Date.now() - started;
            toolAudit.push({ name, ok, ms });
            emit({ t: 'tool_result', id: call.id, name, ok });
            // D70: картинка есть — кладём сентинел, который anthropic-native.ts
            // разворачивает в настоящий multimodal-блок; текстовые тулы не задеты.
            const toolContent: string | MultimodalToolResult = resultImages?.length
              ? { __sandystudio_multimodal: true, text: resultText, images: resultImages }
              : resultText;
            messages.push({ role: 'tool', tool_call_id: call.id, content: toolContent as never });
          }
        }

        if (!finalText) {
          finalText = `(цикл упёрся в потолок ${MAX_ROUNDS} раундов — доклад оборван, это дефект, не итог)`;
          emit({ t: 'error', message: finalText });
        }

        await persistTurn(supabase, threadId, {
          role: 'assistant',
          event_type: 'message',
          content: finalText,
          metadata: {
            surface: 'mind-chat',
            model,
            tool_audit: toolAudit,
            cache_read_input_tokens: cacheRead,
            cache_creation_input_tokens: cacheWrite,
          },
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        emit({ t: 'error', message });
        try {
          await persistTurn(supabase, threadId, {
            role: 'system',
            event_type: 'message',
            content: `mind-chat ОШИБКА: ${message}`,
            metadata: { surface: 'mind-chat', error: true },
          });
        } catch {
          /* запись об ошибке не должна прятать саму ошибку */
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Concierge-Thread-Id': threadId,
    },
  });
}
