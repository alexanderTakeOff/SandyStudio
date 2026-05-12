// Direct gpt-5.5 chat completions test — bypasses our route layer entirely.
// Measures: latency, presence of tool_calls vs text, output content.
import { readFileSync } from 'node:fs';
import OpenAI from 'openai';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^['"]|['"]$/g, '')]; })
);
const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const SYSTEM = `You are SandyStudio's Prod Assistant.
You are a SENIOR operator. Never ask permission for read-only actions.
PROHIBITED phrases: "Сейчас сделаю / Собираю / Записываю" without immediately performing the action.
If the Director asks for content in chat, GENERATE the content directly in your response — no announcements, no "сейчас оформлю", just the content.
Match Director's language (Russian).`;

const TESTS = [
  {
    name: 'Simple Russian Q&A (no tools)',
    user: 'Напиши короткий список 5 русских пословиц про труд.',
    tools: undefined,
    reasoning: 'low',
  },
  {
    name: 'Bible markdown generation (the Director\'s actual ask)',
    user: `Director gave you 16 characters (Sandy, Antagonist Shadow, Inspector-Stopwatch, Perfume Vial, Coffee Cup Colleague, Old Calendar Neighbor, Baby-Timer, Skateboard Courier, Mirror-Filter, Balloon, Yarn Ball, Stapler, Eraser, Marginal, Golden Chronometer, Heavy Friend) and asked for general_idea markdown with appended "## Cast Bible" section. Output ONLY the final markdown content for general_idea. NO commentary, no "сейчас сделаю", just the markdown.`,
    tools: undefined,
    reasoning: 'low',
  },
];

for (const test of TESTS) {
  console.log(`\n=== ${test.name} ===`);
  const t0 = Date.now();
  try {
    const params = {
      model: 'gpt-5.5',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: test.user },
      ],
      max_completion_tokens: 2500,
    };
    if (test.reasoning) params.reasoning_effort = test.reasoning;
    const resp = await client.chat.completions.create(params);
    const dt = Date.now() - t0;
    const msg = resp.choices[0]?.message;
    const text = typeof msg?.content === 'string' ? msg.content : '';
    console.log(`time: ${dt}ms`);
    console.log(`finish_reason: ${resp.choices[0]?.finish_reason}`);
    console.log(`usage: prompt=${resp.usage?.prompt_tokens} completion=${resp.usage?.completion_tokens} reasoning=${resp.usage?.completion_tokens_details?.reasoning_tokens ?? '?'}`);
    console.log(`---response (${text.length} chars)---`);
    console.log(text.slice(0, 1200));
    if (text.length > 1200) console.log(`... [truncated, ${text.length - 1200} more chars]`);
  } catch (err) {
    console.log(`time: ${Date.now() - t0}ms ERROR`);
    console.log(`error: ${err.status} ${err.error?.message ?? err.message}`);
  }
}
