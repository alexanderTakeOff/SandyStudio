// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/youtube.ts
// YouTube Data API v3 adapter — the distribution/publish surface.
// Sibling of drive.ts: same OAuth refresh-token flow (google-auth.ts), same
// raw-REST style (no heavy `googleapis` dependency), same fetchWithTimeout guard.
//
// Operations exposed:
//   - getMyChannel()                 → { id, title, uploadsPlaylistId }
//   - listAllUploads()               → every video already on the channel
//   - uploadVideo({ bytes, title, description, privacyStatus, ... }) → { id, url }
//
// Scopes required on the channel refresh token: youtube.upload + youtube.readonly.
// Multi-channel (multi-channel.md §3): every exported op takes an optional
// `auth` — the channel's refresh token. Omitted = legacy bare env token (SANDY).
// Upload uses YouTube's resumable protocol (init POST → single PUT of bytes).
// ──────────────────────────────────────────────────────────────────────────────

import { getYouTubeAccessToken, GoogleAuthError } from './google-auth';
import { fetchWithTimeout } from './fetch-with-timeout';

const YT_API = 'https://www.googleapis.com/youtube/v3';
const YT_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';

// Small metadata calls (list/channel/init) vs the large byte PUT.
const CALL_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 600_000; // up to 10 min for a big mp4 PUT

export class YouTubeError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly body: string | null = null,
  ) {
    super(message);
    this.name = 'YouTubeError';
  }
}

export interface YouTubeAuth {
  /** The channel's OAuth refresh token (resolveChannelRefreshToken). */
  refreshToken: string;
}

async function authedFetch(url: string, init: RequestInit = {}, timeoutMs = CALL_TIMEOUT_MS, auth?: YouTubeAuth): Promise<Response> {
  let token: string;
  try {
    token = await getYouTubeAccessToken(auth?.refreshToken);
  } catch (err) {
    if (err instanceof GoogleAuthError) throw new YouTubeError(err.message);
    throw err;
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetchWithTimeout(url, { ...init, headers }, timeoutMs);
}

export interface ChannelInfo {
  id: string;
  title: string;
  uploadsPlaylistId: string;
}

export async function getMyChannel(auth?: YouTubeAuth): Promise<ChannelInfo> {
  const res = await authedFetch(`${YT_API}/channels?part=snippet,contentDetails&mine=true`, {}, CALL_TIMEOUT_MS, auth);
  if (!res.ok) {
    throw new YouTubeError(`getMyChannel failed (${res.status})`, res.status, (await res.text()).slice(0, 600));
  }
  const json = (await res.json()) as {
    items?: Array<{
      id?: string;
      snippet?: { title?: string };
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }>;
  };
  const ch = json.items?.[0];
  if (!ch) throw new YouTubeError('getMyChannel: no channel on this account');
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new YouTubeError('getMyChannel: no uploads playlist');
  return { id: ch.id ?? '', title: ch.snippet?.title ?? '', uploadsPlaylistId: uploads };
}

export interface UploadedVideoRef {
  videoId: string;
  title: string;
  publishedAt: string;
}

export async function listAllUploads(auth?: YouTubeAuth): Promise<UploadedVideoRef[]> {
  const { uploadsPlaylistId } = await getMyChannel(auth);
  const out: UploadedVideoRef[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: '50',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await authedFetch(`${YT_API}/playlistItems?${params.toString()}`, {}, CALL_TIMEOUT_MS, auth);
    if (!res.ok) {
      throw new YouTubeError(`listAllUploads failed (${res.status})`, res.status, (await res.text()).slice(0, 600));
    }
    const json = (await res.json()) as {
      items?: Array<{
        contentDetails?: { videoId?: string; videoPublishedAt?: string };
        snippet?: { title?: string; publishedAt?: string; resourceId?: { videoId?: string } };
      }>;
      nextPageToken?: string;
    };
    for (const it of json.items ?? []) {
      out.push({
        videoId: it.contentDetails?.videoId ?? it.snippet?.resourceId?.videoId ?? '',
        title: it.snippet?.title ?? '',
        publishedAt: it.contentDetails?.videoPublishedAt ?? it.snippet?.publishedAt ?? '',
      });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

/** True if the video id still exists / is visible on the channel. Used for
 *  idempotent republish: a deleted video → false → EXEC-PUB re-uploads. */
export async function videoExists(videoId: string, auth?: YouTubeAuth): Promise<boolean> {
  const res = await authedFetch(`${YT_API}/videos?part=id&id=${encodeURIComponent(videoId)}`, {}, CALL_TIMEOUT_MS, auth);
  if (!res.ok) {
    throw new YouTubeError(`videoExists failed (${res.status})`, res.status, (await res.text()).slice(0, 300));
  }
  const json = (await res.json()) as { items?: unknown[] };
  return Array.isArray(json.items) && json.items.length > 0;
}

/** Set a custom thumbnail on an uploaded video (thumbnails.set). youtube.upload
 *  scope suffices — no force-ssl needed for one's own freshly-uploaded video. */
export async function setThumbnail(videoId: string, bytes: Uint8Array, contentType = 'image/png', auth?: YouTubeAuth): Promise<void> {
  const url = `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`;
  const res = await authedFetch(
    url,
    { method: 'POST', headers: { 'content-type': contentType }, body: bytes as unknown as BodyInit },
    UPLOAD_TIMEOUT_MS,
    auth,
  );
  if (!res.ok) {
    throw new YouTubeError(`setThumbnail failed (${res.status})`, res.status, (await res.text()).slice(0, 400));
  }
}

/** Update title/description/tags on an EXISTING video (videos.update). Requires
 *  the youtube.force-ssl scope. videos.update replaces the snippet, so title +
 *  categoryId are mandatory; we always send description + tags too. */
export async function updateVideoMetadata(
  videoId: string,
  meta: { title: string; description?: string; tags?: string[]; categoryId?: string },
  auth?: YouTubeAuth,
): Promise<void> {
  const body = {
    id: videoId,
    snippet: {
      title: meta.title,
      description: meta.description ?? '',
      tags: meta.tags ?? [],
      categoryId: meta.categoryId ?? '23', // Comedy
    },
  };
  const res = await authedFetch(`${YT_API}/videos?part=snippet`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, CALL_TIMEOUT_MS, auth);
  if (!res.ok) {
    throw new YouTubeError(`updateVideoMetadata failed (${res.status})`, res.status, (await res.text()).slice(0, 400));
  }
}

/** True if the video is already an item of the playlist (idempotency guard). */
export async function isVideoInPlaylist(playlistId: string, videoId: string, auth?: YouTubeAuth): Promise<boolean> {
  const res = await authedFetch(`${YT_API}/playlistItems?part=id&playlistId=${encodeURIComponent(playlistId)}&videoId=${encodeURIComponent(videoId)}&maxResults=1`, {}, CALL_TIMEOUT_MS, auth);
  if (!res.ok) {
    throw new YouTubeError(`isVideoInPlaylist failed (${res.status})`, res.status, (await res.text()).slice(0, 300));
  }
  const json = (await res.json()) as { items?: unknown[] };
  return Array.isArray(json.items) && json.items.length > 0;
}

/** Append a video to a playlist (playlistItems.insert). Requires force-ssl scope. */
export async function addVideoToPlaylist(playlistId: string, videoId: string, auth?: YouTubeAuth): Promise<void> {
  const res = await authedFetch(`${YT_API}/playlistItems?part=snippet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } }),
  }, CALL_TIMEOUT_MS, auth);
  if (!res.ok) {
    throw new YouTubeError(`addVideoToPlaylist failed (${res.status})`, res.status, (await res.text()).slice(0, 400));
  }
}

/** Find one of the channel's own playlists by exact (case-insensitive) title. */
export async function findPlaylistByTitle(title: string, auth?: YouTubeAuth): Promise<{ id: string; title: string } | null> {
  const want = title.trim().toLowerCase();
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ part: 'snippet', mine: 'true', maxResults: '50' });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await authedFetch(`${YT_API}/playlists?${params.toString()}`, {}, CALL_TIMEOUT_MS, auth);
    if (!res.ok) throw new YouTubeError(`findPlaylistByTitle failed (${res.status})`, res.status, (await res.text()).slice(0, 300));
    const json = (await res.json()) as { items?: Array<{ id?: string; snippet?: { title?: string } }>; nextPageToken?: string };
    for (const it of json.items ?? []) {
      if ((it.snippet?.title ?? '').trim().toLowerCase() === want) return { id: it.id ?? '', title: it.snippet?.title ?? title };
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  return null;
}

/** Create a new playlist (playlists.insert). Requires force-ssl scope. */
export async function createPlaylist(
  title: string,
  description = '',
  privacyStatus: 'private' | 'unlisted' | 'public' = 'unlisted',
  auth?: YouTubeAuth,
): Promise<{ id: string; title: string }> {
  const res = await authedFetch(`${YT_API}/playlists?part=snippet,status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ snippet: { title, description }, status: { privacyStatus } }),
  }, CALL_TIMEOUT_MS, auth);
  if (!res.ok) throw new YouTubeError(`createPlaylist failed (${res.status})`, res.status, (await res.text()).slice(0, 400));
  const json = (await res.json()) as { id?: string; snippet?: { title?: string } };
  return { id: json.id ?? '', title: json.snippet?.title ?? title };
}

export type PrivacyStatus = 'private' | 'unlisted' | 'public';

export interface UploadVideoInput {
  bytes: Uint8Array;
  title: string;
  description?: string;
  privacyStatus: PrivacyStatus;
  tags?: string[];
  /** YouTube category id. 23 = Comedy. */
  categoryId?: string;
  contentType?: string;
}

export interface UploadVideoResult {
  id: string;
  url: string;
  title: string;
  privacyStatus: string;
}

export async function uploadVideo(input: UploadVideoInput, auth?: YouTubeAuth): Promise<UploadVideoResult> {
  const meta = {
    snippet: {
      title: input.title,
      description: input.description ?? '',
      tags: input.tags ?? [],
      categoryId: input.categoryId ?? '23', // Comedy
    },
    status: {
      privacyStatus: input.privacyStatus,
      selfDeclaredMadeForKids: false,
    },
  };
  const contentType = input.contentType ?? 'video/mp4';

  // Step 1 — start a resumable session; the response Location is the upload URL.
  const initRes = await authedFetch(`${YT_UPLOAD}?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': contentType,
      'X-Upload-Content-Length': String(input.bytes.length),
    },
    body: JSON.stringify(meta),
  }, CALL_TIMEOUT_MS, auth);
  if (!initRes.ok) {
    throw new YouTubeError(`upload init failed (${initRes.status})`, initRes.status, (await initRes.text()).slice(0, 800));
  }
  const sessionUrl = initRes.headers.get('location');
  if (!sessionUrl) throw new YouTubeError('upload init: no resumable Location header');

  // Step 2 — PUT the bytes in one shot (files here are well under 100MB).
  const putRes = await authedFetch(
    sessionUrl,
    {
      method: 'PUT',
      headers: { 'content-type': contentType, 'content-length': String(input.bytes.length) },
      body: input.bytes as unknown as BodyInit,
    },
    UPLOAD_TIMEOUT_MS,
    auth,
  );
  if (!putRes.ok) {
    throw new YouTubeError(`upload PUT failed (${putRes.status})`, putRes.status, (await putRes.text()).slice(0, 800));
  }
  const video = (await putRes.json()) as {
    id?: string;
    snippet?: { title?: string };
    status?: { privacyStatus?: string };
  };
  if (!video.id) throw new YouTubeError('upload PUT: response missing video id');
  return {
    id: video.id,
    url: `https://youtu.be/${video.id}`,
    title: video.snippet?.title ?? input.title,
    privacyStatus: video.status?.privacyStatus ?? input.privacyStatus,
  };
}
