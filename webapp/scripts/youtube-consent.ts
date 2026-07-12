// ──────────────────────────────────────────────────────────────────────────────
// scripts/youtube-consent.ts
// One-time OAuth consent for the Sandy YouTube channel. Reuses the existing
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
//
// YOUTUBE-ONLY scopes: the Sandy channel is a Brand Account, which has no Google
// Drive — requesting drive.file alongside YouTube makes Google reject the brand
// channel with "service isn't available for your account". So Drive (ao@ user)
// and YouTube (Sandy brand) live in SEPARATE refresh tokens.
//
// Run:  npx tsx scripts/youtube-consent.ts   (from webapp/)
// Pick the "Sandy the Hourglass / The Pragmatist Manifesto" channel at the
// consent screen. It writes YOUTUBE_REFRESH_TOKEN into .env.local (Drive's
// GOOGLE_REFRESH_TOKEN is left untouched).
// ──────────────────────────────────────────────────────────────────────────────
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { exec } from 'child_process';

const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET?.trim();
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.local');
  process.exit(1);
}

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}`;
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',     // upload videos
  'https://www.googleapis.com/auth/youtube.readonly',   // list channel (for the diff)
  'https://www.googleapis.com/auth/youtube.force-ssl',  // edit existing videos (videos.update) + thumbnails.set
  'https://www.googleapis.com/auth/yt-analytics.readonly', // read audience metrics (Quality Sensor — EXEC-ANAL)
].join(' ');

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  }).toString();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', REDIRECT_URI);
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  if (err) {
    res.end(`Consent error: ${err}. You can close this tab and re-run the script.`);
    console.error('\nConsent denied/error:', err);
    server.close();
    process.exit(1);
  }
  if (!code) { res.end('Waiting for Google redirect...'); return; }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const j = (await tokenRes.json()) as any;
    if (!tokenRes.ok || !j.refresh_token) {
      res.end('Token exchange failed — see terminal.');
      console.error('\nToken exchange failed:', JSON.stringify(j, null, 2));
      server.close();
      process.exit(1);
    }
    // Auto-write the YouTube token into .env.local (leaves GOOGLE_REFRESH_TOKEN alone).
    const envPath = path.join(process.cwd(), '.env.local');
    let raw = fs.readFileSync(envPath, 'utf8');
    if (/^YOUTUBE_REFRESH_TOKEN=/m.test(raw)) {
      raw = raw.replace(/^YOUTUBE_REFRESH_TOKEN=.*$/m, `YOUTUBE_REFRESH_TOKEN=${j.refresh_token}`);
    } else {
      raw = raw.replace(/\s*$/, '') + `\nYOUTUBE_REFRESH_TOKEN=${j.refresh_token}\n`;
    }
    fs.writeFileSync(envPath, raw);
    res.end('<h2>Success ✅</h2><p>Token saved. You can close this tab and return to the terminal.</p>');
    console.log('\n============================================================');
    console.log('✅ .env.local updated — YOUTUBE_REFRESH_TOKEN written (Drive token untouched).');
    console.log('Granted scopes:', j.scope);
    console.log('============================================================\n');
    server.close();
    process.exit(0);
  } catch (e) {
    res.end('Exchange error — see terminal.');
    console.error(e);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log('\nOpening Google consent in your browser...');
  console.log('If it does not open, paste this URL manually:\n');
  console.log(authUrl + '\n');
  console.log(`(Local listener on ${REDIRECT_URI} — leave this running until it prints the token.)\n`);
  const cmd = process.platform === 'win32' ? `start "" "${authUrl}"`
    : process.platform === 'darwin' ? `open "${authUrl}"` : `xdg-open "${authUrl}"`;
  exec(cmd);
});
