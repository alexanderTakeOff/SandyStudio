// ──────────────────────────────────────────────────────────────────────────────
// app/api/channels/consent/callback/route.ts
// Google OAuth redirect target for the Settings → Channels "Authorize" flow.
//
// Safer than the CLI twin: the picked brand account is verified against the
// passport's youtube_channel_id BEFORE the token is saved — choosing the wrong
// account on the consent screen saves NOTHING and renders a clear diff instead
// (the CLI only catches this later at the identity guard). On success the token
// lands in webapp/.env.local AND process.env, so no stack restart is needed.
// ──────────────────────────────────────────────────────────────────────────────

import { requireDirector, assertHumanDirector } from '@/lib/api/auth';
import { PUBLIC_ENV } from '@/lib/env';
import {
  exchangeConsentCode,
  persistChannelToken,
} from '@/lib/providers/google-consent';
import { getMyChannel } from '@/lib/providers/youtube';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function htmlPage(title: string, body: string, ok: boolean): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#0e1420;color:#e6e9f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{max-width:560px;padding:32px;border-radius:16px;background:#161e2e;border:1px solid #2a3550}
h2{margin-top:0;color:${ok ? '#4ade80' : '#f87171'}}code{background:#0e1420;padding:2px 6px;border-radius:6px}
a{color:#7aa2ff}</style></head><body><div class="card"><h2>${title}</h2>${body}
<p style="margin-bottom:0"><a href="/settings">← Вернуться в Settings</a></p></div></body></html>`,
    { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export async function GET(req: Request) {
  const dctx = await requireDirector();
  assertHumanDirector(dctx);

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') ?? '';
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return htmlPage('Consent отклонён', `<p>Google вернул ошибку: <code>${oauthError}</code>. Нажми Authorize ещё раз.</p>`, false);
  }
  if (!code || !UUID_RE.test(state)) {
    return htmlPage('Некорректный редирект', '<p>Нет кода авторизации или channel id. Начни заново из Settings → Channels.</p>', false);
  }

  const { data: channel } = await dctx.supabase
    .from('channels')
    .select('id, name, youtube_channel_id, credential_key')
    .eq('id', state)
    .maybeSingle();
  if (!channel) {
    return htmlPage('Канал не найден', `<p>Паспорт канала <code>${state}</code> отсутствует в базе.</p>`, false);
  }

  // Same env source google-auth.ts uses — the typed getServerEnv() surface
  // deliberately doesn't cover the Google OAuth pair.
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return htmlPage('Env не настроен', '<p><code>GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET</code> отсутствуют в <code>webapp/.env.local</code>.</p>', false);
  }

  const appOrigin = (PUBLIC_ENV.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  let refreshToken: string;
  let grantedScopes: string;
  try {
    const t = await exchangeConsentCode({
      code,
      clientId,
      clientSecret,
      redirectUri: `${appOrigin}/api/channels/consent/callback`,
    });
    refreshToken = t.refreshToken;
    grantedScopes = t.grantedScopes;
  } catch (e) {
    return htmlPage('Обмен кода не удался', `<p>${e instanceof Error ? e.message : 'unknown error'}</p>`, false);
  }

  // Identity check BEFORE persisting (multi-channel.md §5): the token must
  // belong to THIS passport's channel, else the wrong brand account was picked.
  let live: { id: string; title: string };
  try {
    live = await getMyChannel({ refreshToken });
  } catch (e) {
    return htmlPage(
      'Не удалось проверить канал',
      `<p>Токен получен, но чтение канала упало: ${e instanceof Error ? e.message : 'unknown'}. Токен НЕ сохранён — попробуй ещё раз.</p>`,
      false,
    );
  }
  if (live.id !== channel.youtube_channel_id) {
    return htmlPage(
      'Выбран не тот аккаунт — токен НЕ сохранён',
      `<p>На консент-экране выбран канал <b>${live.title}</b> (<code>${live.id}</code>),
       а паспорт <b>${channel.name}</b> ждёт <code>${channel.youtube_channel_id}</code>.</p>
       <p>Нажми Authorize снова и выбери бренд-аккаунт «${channel.name}». Если UC-id в паспорте
       неверный — поправь его в базе.</p>`,
      false,
    );
  }

  const envVar = `YOUTUBE_REFRESH_TOKEN_${channel.credential_key}`;
  try {
    persistChannelToken(envVar, refreshToken);
  } catch (e) {
    return htmlPage('Запись токена не удалась', `<p>${e instanceof Error ? e.message : 'unknown error'}</p>`, false);
  }

  return htmlPage(
    `Канал «${channel.name}» авторизован ✅`,
    `<p>Токен записан в <code>webapp/.env.local</code> как <code>${envVar}</code> и уже подхвачен
     работающим сервером — рестарт не нужен.</p>
     <p>Identity-сверка пройдена: <b>${live.title}</b> = <code>${live.id}</code>.</p>
     <p style="color:#9aa4b8;font-size:13px">Granted scopes: ${grantedScopes || '—'}</p>`,
    true,
  );
}
