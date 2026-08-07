// @not-a-tool: общий каркас самоописания — из него инструменты объявляют свой контракт
// Self-description for the direct-call run tools. A tool declares WHAT it is
// called with; that same declaration is what the tool reads its arguments from
// at runtime. Lie in the declaration and the tool does not start — so "keep the
// registry current" stops being discipline and becomes a condition of working.
//
//   export default defineTool({
//     name: 'gen-frame',
//     summary: 'One frame, one invocation.',
//     args: { 'prompt-file': { about: '...' }, quality: { about: '...', default: 'high', values: ['low','medium','high'] } },
//     env: { RUN_EPISODE_ID: { about: 'episode the spend is billed to' } },
//     reads: ['assets'], writes: ['budget_log'],
//   }, async ({ arg, env }) => { ... });
//
// Validation is EAGER (unknown flag, missing required, value outside `values`
// all fail before any work), reading stays LAZY — `arg('x')` is called where it
// was called before, including inside object literals.
//
// Under SS_TOOLS_INTROSPECT=1 the module only exports its spec: `main` never
// runs, nothing touches the network. That is how the registry and its gate read
// the declarations without executing seven programs.

export interface ArgSpec {
  /** Prose the human and the leading mind read. Lives three lines from the code. */
  readonly about: string;
  /** Absent = the argument is required. */
  readonly default?: string;
  /** Closed set. A value outside it is refused, not silently defaulted. */
  readonly values?: readonly string[];
}

export interface EnvSpec {
  readonly about: string;
}

export interface ToolSpec {
  readonly name: string;
  readonly summary: string;
  readonly args: Readonly<Record<string, ArgSpec>>;
  readonly env?: Readonly<Record<string, EnvSpec>>;
  /** DB tables read. Checked against `.from('...')` in the source by the gate. */
  readonly reads?: readonly string[];
  /** DB tables written, plus files when the tool produces them. */
  readonly writes?: readonly string[];
}

type ArgValue<A extends ArgSpec> = A extends { readonly values: readonly (infer V extends string)[] }
  ? V
  : string;

export interface ToolContext<S extends ToolSpec> {
  arg<K extends keyof S['args'] & string>(name: K): ArgValue<S['args'][K]>;
  env<K extends keyof NonNullable<S['env']> & string>(name: K): string;
}

/**
 * True while the registry reads declarations. No `main` runs, no network.
 *
 * Read LAZILY on purpose. As a module-level const it froze at the moment this file was first
 * imported — so the registry, which imports `renderTool` from here before it can set the flag,
 * got `false` and every tool it introspected tried to parse `--write` as its own argument.
 * A snapshot of the environment taken at import time is a hidden ordering dependency.
 */
export const isIntrospecting = (): boolean => process.env.SS_TOOLS_INTROSPECT === '1';

/**
 * One renderer serves both surfaces: `--help` of a single tool and its section
 * in `docs/TOOLS.md`. Two renderers would drift, which is the whole disease.
 * No dates or timestamps — the snapshot is compared byte for byte.
 */
export function renderTool(spec: ToolSpec): string {
  const lines: string[] = [];
  lines.push(`### ${spec.name}`, '', spec.summary, '');

  const names = Object.keys(spec.args);
  if (names.length > 0) {
    const call = names
      .map((n) => {
        const a = spec.args[n];
        return a.default === undefined ? `--${n} <${n}>` : `[--${n} <${n}>]`;
      })
      .join(' ');
    lines.push('```', `npx tsx scripts/run/${spec.name}.ts ${call}`, '```', '');
    lines.push('| аргумент | обязателен | по умолчанию | допустимо | что это |');
    lines.push('|---|---|---|---|---|');
    for (const n of names) {
      const a = spec.args[n];
      const required = a.default === undefined ? 'да' : '—';
      const def = a.default === undefined ? '—' : `\`${a.default}\``;
      const values = a.values ? a.values.map((v) => `\`${v}\``).join(' · ') : '—';
      lines.push(`| \`--${n}\` | ${required} | ${def} | ${values} | ${a.about} |`);
    }
    lines.push('');
  } else {
    lines.push('```', `npx tsx scripts/run/${spec.name}.ts`, '```', '');
  }

  const envNames = Object.keys(spec.env ?? {});
  if (envNames.length > 0) {
    lines.push('**env:**');
    for (const n of envNames) lines.push(`- \`${n}\` — ${spec.env![n].about}`);
    lines.push('');
  }

  if (spec.reads?.length) lines.push(`**читает:** ${spec.reads.map((t) => `\`${t}\``).join(', ')}`, '');
  if (spec.writes?.length) lines.push(`**пишет:** ${spec.writes.map((t) => `\`${t}\``).join(', ')}`, '');

  return lines.join('\n');
}

function fail(spec: ToolSpec, message: string): never {
  console.error(`${spec.name}: ${message}`);
  console.error('');
  console.error(renderTool(spec));
  process.exit(1);
}

/**
 * Strict parse. Every token must be a declared `--flag` followed by its value.
 * Today `--qualiti high` silently yields the `high` default and spends $0.25
 * instead of $0.018 — an unrecorded class of defect this closes.
 */
function parseArgv(spec: ToolSpec, argv: readonly string[]): Record<string, string> {
  const given: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) fail(spec, `неожиданный аргумент «${token}» — ожидался --флаг`);
    const name = token.slice(2);
    if (!(name in spec.args)) fail(spec, `неизвестный флаг --${name}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) fail(spec, `у --${name} нет значения`);
    given[name] = value;
    i++;
  }

  for (const [name, a] of Object.entries(spec.args)) {
    const value = given[name] ?? a.default;
    if (value === undefined) fail(spec, `не задан обязательный --${name} (${a.about})`);
    if (a.values && !a.values.includes(value)) {
      fail(spec, `--${name}=${value} вне допустимого набора: ${a.values.join(' · ')}`);
    }
    given[name] = value;
  }

  return given;
}

/**
 * Declares the tool and — outside introspection — runs it. Replaces the seven
 * byte-identical `arg()` helpers, the seven `main().catch()` tails and the three
 * hand-rolled env checks.
 */
export function defineTool<const S extends ToolSpec>(
  spec: S,
  main: (ctx: ToolContext<S>) => Promise<void>,
): S {
  if (isIntrospecting()) return spec;

  const argv = process.argv.slice(2);
  if (argv.includes('--help')) {
    console.log(renderTool(spec));
    process.exit(0);
  }

  const values = parseArgv(spec, argv);

  for (const [name, e] of Object.entries(spec.env ?? {})) {
    if (!process.env[name]) fail(spec, `не задана переменная окружения ${name} — ${e.about}`);
  }

  const ctx = {
    arg: (name: string) => values[name],
    env: (name: string) => process.env[name]!,
  } as ToolContext<S>;

  main(ctx).catch((e: unknown) => {
    console.error('ERROR', e instanceof Error ? e.message : e);
    process.exit(1);
  });

  return spec;
}
