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
// Scopes required on GOOGLE_REFRESH_TOKEN: youtube.upload + youtube.readonly.
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

async function authedFetch(url: string, init: RequestInit = {}, timeoutMs = CALL_TIMEOUT_MS): Promise<Response> {
  let token: string;
  try {
    token = await getYouTubeAccessToken();
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

export async function getMyChannel(): Promise<ChannelInfo> {
  const res = await authedFetch(`${YT_API}/channels?part=snippet,contentDetails&mine=true`);
  if (!res.ok) {
    throw new YouTubeError(`getMyChannel failed (${res.status})`, res.status, (await res.text()).slice(0, 600));
  }
  const json = (await res.json()) as any;
  const ch = json.items?.[0];
  if (!ch) throw new YouTubeError('getMyChannel: no channel on this account');
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new YouTubeError('getMyChannel: no uploads playlist');
  return { id: ch.id, title: ch.snippet?.title ?? '', uploadsPlaylistId: uploads };
}

export interface UploadedVideoRef {
  videoId: string;
  title: string;
  publishedAt: string;
}

export async function listAllUploads(): Promise<UploadedVideoRef[]> {
  const { uploadsPlaylistId } = await getMyChannel();
  const out: UploadedVideoRef[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: '50',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await authedFetch(`${YT_API}/playlistItems?${params.toString()}`);
    if (!res.ok) {
      throw new YouTubeError(`listAllUploads failed (${res.status})`, res.status, (await res.text()).slice(0, 600));
    }
    const json = (await res.json()) as any;
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

export async function uploadVideo(input: UploadVideoInput): Promise<UploadVideoResult> {
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
  });
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
  );
  if (!putRes.ok) {
    throw new YouTubeError(`upload PUT failed (${putRes.status})`, putRes.status, (await putRes.text()).slice(0, 800));
  }
  const video = (await putRes.json()) as any;
  if (!video.id) throw new YouTubeError('upload PUT: response missing video id');
  return {
    id: video.id,
    url: `https://youtu.be/${video.id}`,
    title: video.snippet?.title ?? input.title,
    privacyStatus: video.status?.privacyStatus ?? input.privacyStatus,
  };
}
