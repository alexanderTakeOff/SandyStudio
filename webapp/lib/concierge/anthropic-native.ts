// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/anthropic-native.ts
// Native @anthropic-ai/sdk path for the concierge (Polina), gated behind
// CONCIERGE_ANTHROPIC_NATIVE. Unlocks PROMPT CACHING (cache_control on the stable
// system prefix + tool block) and thinking-disable — neither is available on the
// OpenAI-compat surface Polina uses today (docs-confirmed).
//
// Shape contract: `createConciergeCompletion` takes the EXACT OpenAI-shaped params
// the three concierge routes already build and returns an OpenAI-shaped completion
// (choices[0].message.tool_calls + usage), so the route tool-loops stay unchanged.
// Flag OFF → byte-for-byte passthrough to the compat client (today's behavior).
// ──────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import { conciergeAnthropicNativeEnabled } from './llm';

export interface ConciergeSystemSplit {
  stable: string;
  dynamic: string;
}

/** OpenAI-shaped completion the routes consume, plus optional cache-usage fields. */
export interface ConciergeCompletion {
  choices: Array<{
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

// Заголовок беты расширенного окна (Директор 08.08: подтвердить окно ПЕРЕД
// длинными эпизодами — 60с+ эпизод копит рефы+кадры+стоп-кадры клипов быстрее,
// чем влезает в стандартные 200К). Без заголовка запрос идёт со стандартным
// окном МОЛЧА — SDK не откажет, значит несовпадение не будет видно нигде,
// кроме как в преждевременном обрыве истории треда. Триггерится СУФФИКСОМ
// `-1m` в id модели (см. каталог `concierge-provider-config.ts`), чтобы окно
// было ЯВНЫМ выбором в дропдауне, а не скрытым свойством модели.
const CONTEXT_1M_SUFFIX = '-1m';
const CONTEXT_1M_BETA_HEADER = 'context-1m-2025-08-07';

/** Модель + флаг «эта модель просила окно 1M» — суффикс снят для реального API-имени. */
export function resolveModel(model: string): { apiModel: string; contextWindow1m: boolean } {
  if (model.endsWith(CONTEXT_1M_SUFFIX)) {
    return { apiModel: model.slice(0, -CONTEXT_1M_SUFFIX.length), contextWindow1m: true };
  }
  return { apiModel: model, contextWindow1m: false };
}

let cachedClient: Anthropic | null = null;
function anthropicClient(): Anthropic {
  if (!cachedClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        'CONCIERGE_ANTHROPIC_NATIVE=true but ANTHROPIC_API_KEY is missing — set it or disable the flag',
      );
    }
    cachedClient = new Anthropic({ apiKey });
  }
  return cachedClient;
}

function safeJsonParse(raw: string): Record<string, unknown> {
  if (!raw || raw.trim() === '') return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Translate the OpenAI `messages` array (minus the role:'system' entry, which is
 * carried by the native `system` param) into Anthropic message params. The
 * critical subtlety: the routes push tool results one-per-message
 * (`{role:'tool', tool_call_id, content}`), but Anthropic requires ALL tool_result
 * blocks for one assistant turn to live in a SINGLE following user message — so we
 * coalesce consecutive tool messages.
 */
function translateMessages(
  messages: ChatCompletionCreateParamsNonStreaming['messages'],
): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  let pendingToolResults: Anthropic.ToolResultBlockParam[] = [];

  const flush = () => {
    if (pendingToolResults.length > 0) {
      out.push({ role: 'user', content: pendingToolResults });
      pendingToolResults = [];
    }
  };

  for (const m of messages) {
    if (m.role === 'system' || m.role === 'developer') continue; // hoisted to `system` param

    if (m.role === 'tool') {
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: m.tool_call_id,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      });
      continue;
    }

    flush(); // any accumulated tool_results close out before the next real turn

    if (m.role === 'assistant') {
      const blocks: Array<Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam> = [];
      if (typeof m.content === 'string' && m.content.trim() !== '') {
        blocks.push({ type: 'text', text: m.content });
      }
      const toolCalls = m.tool_calls ?? [];
      for (const tc of toolCalls) {
        if (tc.type !== 'function') continue;
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: safeJsonParse(tc.function.arguments),
        });
      }
      // Assistant turns in the loop always carry tool_use (or text); guard the
      // degenerate empty case so Anthropic never sees an empty content array.
      out.push({
        role: 'assistant',
        content: blocks.length > 0 ? blocks : (typeof m.content === 'string' ? m.content : ' '),
      });
      continue;
    }

    // user
    out.push({
      role: 'user',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    });
  }

  flush();
  return out;
}

/** cache_control isn't on the stable 0.32.1 param types, but the API (GA) accepts
 *  it on content/tool blocks — attach via this cast so it reaches the wire. */
type WithCacheControl = { cache_control?: { type: 'ephemeral' } };

/** OpenAI function-tool schema → Anthropic tool, with cache_control on the last. */
function translateTools(
  tools: ChatCompletionCreateParamsNonStreaming['tools'],
): Anthropic.Tool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  const mapped: Anthropic.Tool[] = tools.map((t) => ({
    name: t.function.name,
    description: t.function.description ?? '',
    input_schema: (t.function.parameters ?? {
      type: 'object',
      properties: {},
    }) as Anthropic.Tool.InputSchema,
  }));
  // Cache breakpoint on the final tool → the whole ~45-tool block is cached.
  (mapped[mapped.length - 1] as WithCacheControl).cache_control = {
    type: 'ephemeral',
  };
  return mapped;
}

/**
 * Drop-in for `client.chat.completions.create(params)` in the concierge routes.
 * Flag off → passthrough (today's compat path). Flag on → native Anthropic call
 * with prompt caching + thinking disabled, translated back to OpenAI shape.
 */
export async function createConciergeCompletion(
  openaiClient: OpenAI,
  params: ChatCompletionCreateParamsNonStreaming,
  opts: { systemSplit: ConciergeSystemSplit },
): Promise<ConciergeCompletion> {
  if (!conciergeAnthropicNativeEnabled()) {
    // Байт-в-байт passthrough — но суффикс `-1m` не настоящее имя модели API
    // (см. resolveModel выше), а бета-заголовок здесь недоступен вовсе — на
    // compat-поверхности он и так молча отбрасывается (см. заметку файла).
    // Снимаем суффикс, иначе неизвестное имя модели уходит на 400.
    return (await openaiClient.chat.completions.create({
      ...params,
      model: resolveModel(params.model).apiModel,
    })) as unknown as ConciergeCompletion;
  }

  const { systemSplit } = opts;
  const stableBlock: Anthropic.TextBlockParam = { type: 'text', text: systemSplit.stable };
  (stableBlock as WithCacheControl).cache_control = { type: 'ephemeral' };
  const system: Anthropic.TextBlockParam[] = [stableBlock];
  if (systemSplit.dynamic.trim() !== '') {
    system.push({ type: 'text', text: systemSplit.dynamic });
  }

  const tools = translateTools(params.tools);
  const { apiModel, contextWindow1m } = resolveModel(params.model);

  const request = {
    model: apiModel,
    max_tokens: params.max_tokens ?? 1024,
    system,
    messages: translateMessages(params.messages),
    ...(tools ? { tools } : {}),
    // Extended thinking OFF: Opus 4.x otherwise defaults to UNCAPPED thinking
    // (billed at output rate — the historical $100/day drain). reasoning_effort
    // (compat lever) is ignored server-side; the native struct is the real cap.
    thinking: { type: 'disabled' },
  };

  const resp = await anthropicClient().messages.create(
    request as unknown as Anthropic.MessageCreateParamsNonStreaming,
    contextWindow1m ? { headers: { 'anthropic-beta': CONTEXT_1M_BETA_HEADER } } : undefined,
  );

  const textParts: string[] = [];
  const toolCalls: NonNullable<
    ConciergeCompletion['choices'][0]['message']['tool_calls']
  > = [];
  for (const block of resp.content) {
    if (block.type === 'text') {
      textParts.push(block.text);
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        },
      });
    }
  }

  const finish_reason =
    resp.stop_reason === 'tool_use'
      ? 'tool_calls'
      : resp.stop_reason === 'max_tokens'
        ? 'length'
        : 'stop';

  const usage = resp.usage as Anthropic.Usage & {
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };

  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: textParts.length > 0 ? textParts.join('') : null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason,
      },
    ],
    usage: {
      prompt_tokens: usage.input_tokens,
      completion_tokens: usage.output_tokens,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    },
  };
}
