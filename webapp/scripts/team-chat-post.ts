// Tiny CLI wrapper for /api/team-chat/post — reads content from argv[2] (or stdin)
// and posts as Claude. Avoids Windows curl heredoc UTF-8 corruption.
//
// Usage:
//   npx tsx scripts/team-chat-post.ts "your message"
//   echo "your message" | npx tsx scripts/team-chat-post.ts -
//   npx tsx scripts/team-chat-post.ts --file path/to/msg.md [--tag <tag>]

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[line.slice(0, eq).trim()] = val;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fileFlag = args.indexOf('--file');
  const tagFlag = args.indexOf('--tag');
  const authorFlag = args.indexOf('--author');
  const threadFlag = args.indexOf('--thread');

  let content: string;
  if (fileFlag >= 0 && args[fileFlag + 1]) {
    content = readFileSync(args[fileFlag + 1]!, 'utf-8').trim();
  } else if (args[0] === '-') {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    content = Buffer.concat(chunks).toString('utf-8').trim();
  } else if (args[0]) {
    content = args[0];
  } else {
    console.error('Provide content via arg, --file <path>, or stdin "-".');
    process.exit(1);
  }

  const tag = tagFlag >= 0 ? args[tagFlag + 1] : undefined;
  const author = authorFlag >= 0 ? args[authorFlag + 1]! : 'Claude';
  const threadId = threadFlag >= 0 ? args[threadFlag + 1] : undefined;

  // `--as-exec-dir-ai` presents the EXEC-DIR-AI role token instead of the plain
  // team-chat one, so /api/team-chat/post stamps metadata.authorized_principal
  // and Polina treats the turn as a delegated order (CLAUDE.md §4). Hard limits
  // stay human-Director-only regardless — the route/tool guards enforce that.
  const asExecDirAi = args.includes('--as-exec-dir-ai');
  const tokenVar = asExecDirAi ? 'EXEC_DIR_AI_TOKEN' : 'TEAM_CHAT_TOKEN';
  const token = process.env[tokenVar];
  if (!token) {
    console.error(`${tokenVar} missing in .env.local`);
    process.exit(1);
  }
  const url = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000') + '/api/team-chat/post';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content, author, ...(tag ? { tag } : {}), ...(threadId ? { thread_id: threadId } : {}) }),
  });
  const j = (await res.json()) as { data?: { turn_id?: string; thread_id?: string }; error?: string; success?: boolean };
  if (!res.ok || !j.success) {
    console.error(`POST failed (${res.status}): ${j.error ?? JSON.stringify(j)}`);
    process.exit(1);
  }
  console.log(`✓ posted turn ${j.data?.turn_id} in thread ${j.data?.thread_id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
