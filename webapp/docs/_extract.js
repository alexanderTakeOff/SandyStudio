// Extract UI audit content from JSONL transcript
const fs = require('fs');
const readline = require('readline');

const JSONL = 'C:\\Users\\NAVIA VISION ONE\\.claude\\projects\\C--SandyStudio--claude-worktrees-agitated-lederberg-a292d3\\de74e1a9-f7ed-4d2e-94d0-caa14b0e5932.jsonl';
const OUT = 'C:\\SandyStudio\\.claude\\worktrees\\agitated-lederberg-a292d3\\webapp\\docs\\_raw_dump.txt';

const keywords = /Wave [0-3]|Сводная карта|fix-the-lies|пилюл|noise inventory|Wave0|Wave1|Wave2|Wave3|noise audit|UI\/UX audit|UI audit|ambient|parallax|настройк|inbox.*OPEN|drawer/i;
const ticketRe = /\b(C4|A19|D5|D6|D7|D8|JB6|JB1|JB2|BG4|L1|L2|L3|L4|N\d{1,3}|W\d{1,2})\b/;

const out = fs.createWriteStream(OUT, { encoding: 'utf8' });
const rl = readline.createInterface({ input: fs.createReadStream(JSONL, { encoding: 'utf8' }) });

let n = 0;
let matched = 0;
let totalChars = 0;
rl.on('line', (line) => {
  n++;
  if (!line) return;
  if (!keywords.test(line) && !ticketRe.test(line)) return;
  let msg;
  try { msg = JSON.parse(line); } catch (e) { return; }
  const role = msg.message?.role;
  if (role !== 'assistant') return;
  const content = msg.message?.content || [];
  for (const c of content) {
    if (c.type === 'text' && c.text && (keywords.test(c.text) || ticketRe.test(c.text))) {
      const ts = msg.timestamp || '';
      out.write(`\n\n===LINE ${n} | ${ts}===\n`);
      out.write(c.text);
      out.write('\n');
      matched++;
      totalChars += c.text.length;
    }
  }
});
rl.on('close', () => {
  out.end();
  console.log(`Scanned ${n} lines, matched ${matched} assistant text blocks, ${totalChars} chars total`);
});
