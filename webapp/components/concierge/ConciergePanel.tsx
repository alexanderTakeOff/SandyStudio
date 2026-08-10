// ──────────────────────────────────────────────────────────────────────────────
// components/concierge/ConciergePanel.tsx
// Prod Assistant UI per agents/exec/concierge.md (formerly "Studio Concierge",
// renamed 2026-05-08 — agent_id EXEC-CONC kept in code for stability).
//
// Mode 2.5 Phase 1 additions (~/.claude/plans/valiant-soaring-karp.md):
// - Long-term memory: thread id stored locally, sent on every request, server
//   persists turns to concierge_threads / concierge_turns.
// - TTS: SpeechSynthesis reads assistant replies aloud. Toggle persisted in
//   localStorage so the Director only enables it once.
// - Naming: "Prod Assistant" in user-facing surfaces; EXEC-CONC remains the
//   spec / code identifier.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { usePathname } from 'next/navigation';
import {
  MessageCircle, Mic, MicOff, Send, Volume2, VolumeX, X, Sparkles, MessageSquarePlus,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { withHardBreaks } from '@/lib/markdown-breaks';
import {
  useConciergeTurnsRealtime,
  type ConciergeTurnRow,
} from '@/hooks/useConciergeTurnsRealtime';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// Sprint α 2026-05-14 — team-chat unified thread surfaces three voices:
//   user     → Director's typed input
//   assistant→ PA's reply
//   claude   → CLI agent's curl POST (/api/team-chat/post)
//   pipeline → ambient agent_started/completed/approval events
// `claude` + `pipeline` come from concierge_turns Realtime (migration 0030
// Postgres trigger writes them server-side).
interface Message {
  role: 'user' | 'assistant' | 'claude' | 'pipeline';
  content: string;
  /** ISO timestamp. Director directive 2026-05-26 — show Dubai time on every
   *  chat bubble + pipeline row. For user/assistant turns initiated client
   *  side we stamp Date.now(); for Realtime / DB-load / polling arrivals we
   *  use the row's `created_at`. */
  createdAt?: string;
  /** DB turn id, only for system turns; lets us dedupe Realtime arrivals. */
  turnId?: string;
  /** For `pipeline` messages — severity hint for the bubble accent. */
  severity?: 'info' | 'warning' | 'error';
  /** For `claude` messages — author label, default "Claude". */
  author?: string;
  /**
   * For `assistant` messages — Polina explicitly waiting for Director input.
   * Stamped server-side by /api/concierge/chat via detectAwaitingDirectorInput
   * when the turn ends in a q-format question or a passive "жду".
   * TD-25 P3 (2026-05-21).
   */
  awaitingDirectorInput?: {
    question: string;
    choices?: ReadonlyArray<{ id: string; label: string }>;
  };
}

const STORAGE_KEY = 'sandystudio.prodassistant.history';
const THREAD_KEY = 'sandystudio.prodassistant.threadId';
// Ф4.4 — режим ЕДИНОГО УМА. Эндпойнт переключается флагом; тред = эпизод
// (доктрина §7): у каждого эпизода СВОЙ ключ треда, переключение эпизода
// переключает ленту. Старое решение «один тред следует за эпизодом»
// (2026-06-23) в mind-режиме отменено — оно и было той кашей, где сериалы
// мешались в одну ленту.
const MIND_CHAT = process.env.NEXT_PUBLIC_MIND_CHAT === '1';
// Ф5 миграции «Полина в харнес»: разговор идёт через МОСТ — панель кладёт
// строку (/api/mind/turn), мост ведёт headless-сессию, ответ приходит
// Realtime'ом. Флаг отдельный от MIND_CHAT ради отката: снять переменную —
// панель вернётся на старый стриминговый роут.
// Ф6: старый /api/mind/chat СНЕСЁН — mind-режим ходит только мостом; env-флаг
// отката больше не имеет смысла (откат = git revert).
const MIND_BRIDGE = MIND_CHAT;
const CHAT_ENDPOINT = MIND_CHAT ? '/api/mind/chat' : '/api/concierge/chat';
const threadKeyFor = (episodeId: string | null): string =>
  MIND_CHAT ? `sandystudio.mind.threadId.${episodeId ?? 'studio'}` : THREAD_KEY;
const TTS_KEY = 'sandystudio.prodassistant.ttsEnabled';
// 2026-05-26 (TD-54.3) — left/right dock retired. PA now lives in the middle
// grid column between Sidebar and Content. SIDE_KEY removed; old localStorage
// values are abandoned in place.
const WIDTH_KEY = 'sandystudio.prodassistant.width';
const OPEN_KEY = 'sandystudio.prodassistant.open';
const INPUT_HEIGHT_KEY = 'sandystudio.prodassistant.inputHeight';
const MAX_HISTORY_TURNS = 20;
const INPUT_MIN_PX = 48;
const INPUT_MAX_PX = 500;
const INPUT_DEFAULT_PX = 80;

// 2026-05-26 — Director directive: certain pipeline event types are
// redundant with Polina's own report and just spam the chat. They stay
// in the Activity feed via a separate channel — only the chat surface
// is filtered. Keep agent_started / agent_completed / agent_failed /
// approval_* / blocker_raised / decision_requested / input_requested
// visible — Director said «здесь следить удобнее порой чем в activity
// feed». Content is shortened on render (see formatPipelineContent).
const AMBIENT_CHAT_NOISE_EVENT_TYPES: ReadonlySet<string> = new Set([
  'manual_trigger',
]);
function isAmbientChatNoise(eventType: unknown): boolean {
  return (
    typeof eventType === 'string' &&
    AMBIENT_CHAT_NOISE_EVENT_TYPES.has(eventType)
  );
}

// 2026-05-26 — Director directive: re-render pipeline rows with the
// `[ambient pipeline event · TYPE]` noise stripped, agent narration
// compressed to "agent <FRIENDLY> started/completed — SH09", approval
// rows reduced to their semantic core, and `\n\n` paragraph breaks
// inserted around natural separators so the bubble reads as paragraphs
// instead of one long monospace line. Render side uses
// `whitespace-pre-line` so the newlines survive.
function formatPipelineContent(raw: string): string {
  // Strip the trailing `(actor=...)` suffix that the Postgres trigger
  // always appends — it's audit metadata, not chat content.
  const trimmed = raw.replace(/\s*\(actor=[^)]+\)\s*$/, '');

  const m = trimmed.match(/^\[ambient pipeline event · (\w+)\]\s*(.*)$/s);
  if (!m) return trimmed;
  const eventType = m[1] ?? '';
  const body = (m[2] ?? '').trim();

  if (eventType === 'agent_started' || eventType === 'agent_completed') {
    const verb = eventType === 'agent_started' ? 'started' : 'completed';
    const friendlyMatch = body.match(
      new RegExp(`^(.+?)\\s+${verb}\\b`, 'i'),
    );
    // 2026-07-18 — when the body does NOT follow "<agent> <verb> …" this used
    // to fall back to the literal word "agent", producing the content-free
    // line "AGENT — completed" and DISCARDING the real title. That is what the
    // Director saw spammed down the thread. If the shape doesn't match, the
    // body is not an agent-lifecycle sentence: show it verbatim rather than
    // inventing a label and throwing the information away.
    if (!friendlyMatch) return body || trimmed;
    const friendly = (friendlyMatch[1] ?? '').trim().toUpperCase();
    if (!friendly) return body || trimmed;
    const shotMatch = body.match(/\bSH\d+\b/);
    const shot = shotMatch?.[0];
    // 2026-05-26 (follow-up): Director preferred the plain
    // `FRIENDLY — verb — SH##` shape over the `agent <FRIENDLY>` framing.
    return `${friendly} — ${verb}${shot ? ` — ${shot}` : ''}`;
  }

  if (eventType.startsWith('approval_')) {
    // Drop "<DECISION> on <filename> — " prefix; keep the explanatory
    // tail. Add paragraph breaks around natural separators.
    const withoutFilePrefix = body.replace(
      /^\s*[A-Z_]+\s+on\s+\S+\s*[—-]+\s*/,
      '',
    );
    const withParagraphs = withoutFilePrefix
      .replace(/\s+—\s+Director said:/g, '\n\nDirector said:')
      .replace(/;\s+([a-zA-Zа-яА-Я])/g, (_match, c: string) => `;\n\n${c}`);
    return `[${eventType}] ${withParagraphs}`;
  }

  // Default: replace the noisy "ambient pipeline event · " prefix with
  // the bare `[event_type]` tag and keep the body.
  return `[${eventType}] ${body}`;
}

// 2026-05-26 — Dubai-local short timestamp for chat bubbles. Director is in
// Dubai (UTC+4); database stores UTC. We format on the client so the wall
// clock matches the Director's reading context. Locale 'en-GB' yields
// 24-hour "HH:mm" which is the most compact reading.
const DUBAI_TIME_FORMATTER =
  typeof Intl !== 'undefined'
    ? new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Dubai',
      })
    : null;
const DUBAI_FULL_FORMATTER =
  typeof Intl !== 'undefined'
    ? new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Dubai',
        timeZoneName: 'short',
      })
    : null;

function formatDubaiTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return DUBAI_TIME_FORMATTER ? DUBAI_TIME_FORMATTER.format(d) : null;
}

function formatDubaiFull(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return DUBAI_FULL_FORMATTER ? DUBAI_FULL_FORMATTER.format(d) : null;
}

// Director 2026-06-15 — author label per role, baked into the copy-friendly
// "HH:MM Author: " text prefix so a copy-paste of the chat shows who said what.
function authorLabel(m: Message): string {
  switch (m.role) {
    case 'user':
      return 'Александр';
    case 'assistant':
      return 'Полина';
    case 'claude':
      return m.author ?? 'Claude';
    case 'pipeline':
      return 'Pipeline';
    default:
      return 'Сообщение';
  }
}

/** Silence tolerance for continuous mic. Director wanted ≥5s for thinking pauses. */
const MIC_SILENCE_TIMEOUT_MS = 5500;

/**
 * Pull a structured `awaiting_director_input` descriptor out of a turn's
 * metadata object — used by all three assistant-turn ingestion paths
 * (Realtime arrivals, first load, polling fallback) so a single shape
 * propagates into `Message.awaitingDirectorInput`. Server-side detection
 * lives in `lib/concierge/await-detector.ts`. TD-25 P3 — 2026-05-21.
 */
function readAwaitingFromMetadata(
  meta: Record<string, unknown> | null | undefined,
): { question: string; choices?: ReadonlyArray<{ id: string; label: string }> } | null {
  const raw = meta?.awaiting_director_input;
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const question = obj.question;
  if (typeof question !== 'string' || question.length === 0) return null;
  const rawChoices = obj.choices;
  if (Array.isArray(rawChoices)) {
    const choices: Array<{ id: string; label: string }> = [];
    for (const c of rawChoices) {
      if (
        c &&
        typeof c === 'object' &&
        typeof (c as { id?: unknown }).id === 'string' &&
        typeof (c as { label?: unknown }).label === 'string'
      ) {
        choices.push({ id: (c as { id: string }).id, label: (c as { label: string }).label });
      }
    }
    if (choices.length > 0) return { question, choices };
  }
  return { question };
}

// Web Speech API typing — minimal, broadly compatible.
interface SpeechRecErrorEvent {
  error?: string;
  message?: string;
}
interface SpeechRecResult {
  isFinal?: boolean;
  0: { transcript: string };
  length: number;
}
interface SpeechRec extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort?(): void;
  onresult: ((e: { results: ArrayLike<SpeechRecResult> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechRecErrorEvent) => void) | null;
  onstart?: (() => void) | null;
  onaudiostart?: (() => void) | null;
  onspeechend?: (() => void) | null;
  onsoundend?: (() => void) | null;
}
type SpeechRecCtor = new () => SpeechRec;
function getSpeechRecognition(): SpeechRecCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Human-readable explanation for each W3C SpeechRecognitionErrorEvent.error code. */
function describeMicError(code: string | undefined): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission is blocked. Click the camera/mic icon in the browser address bar → allow microphone, then try again.';
    case 'no-speech':
      return 'No speech detected. The mic worked but heard nothing. Try again and speak after the chime.';
    case 'audio-capture':
      return 'No microphone detected by the OS. Plug one in or pick the right input device in system audio settings.';
    case 'network':
      return 'Network error — Web Speech relies on Google\'s online recognition service for ru-RU. Check internet.';
    case 'aborted':
      return 'Recognition aborted. Click again to restart.';
    case 'language-not-supported':
      return 'This language is not supported by the browser\'s speech engine. Switch to Chrome or English locale.';
    default:
      return code ? `Speech recognition error: ${code}` : 'Unknown speech recognition error.';
  }
}

/** Pick a recognition language: Russian if browser locale is ru*, else en-US. */
function pickRecognitionLang(): string {
  if (typeof navigator === 'undefined') return 'en-US';
  const lang = (navigator.language || '').toLowerCase();
  if (lang.startsWith('ru')) return 'ru-RU';
  if (lang.startsWith('en')) return navigator.language || 'en-US';
  return navigator.language || 'en-US';
}

/** Plain-text strip for TTS — markdown / fences hurt synthesis. */
function stripMarkdownForSpeech(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, '') // code fences silently
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]+/g, '')
    .replace(/!?\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Heuristic: pick voice for the message language. RU if any cyrillic char. */
function pickVoiceLang(text: string): string {
  if (typeof navigator === 'undefined') return 'en-US';
  if (/[Ѐ-ӿ]/.test(text)) return 'ru-RU';
  return navigator.language || 'en-US';
}

function speakText(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const cleaned = stripMarkdownForSpeech(text);
  if (!cleaned) return;
  // Cancel any in-flight utterance first — overlapping speech is unusable.
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(cleaned);
  utter.lang = pickVoiceLang(cleaned);
  utter.rate = 1.0;
  utter.pitch = 1.0;
  // Try to match an installed voice for the requested language so we don't
  // fall back to the system default English voice on cyrillic text.
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find((v) => v.lang.toLowerCase() === utter.lang.toLowerCase());
  if (preferred) utter.voice = preferred;
  window.speechSynthesis.speak(utter);
}

export function ConciergePanel() {
  // Default open=true per Director directive 2026-05-25 — page-load lands with
  // PA already expanded. Persisted in localStorage so an explicit close sticks.
  const [open, setOpen] = useState(true);
  // The episode the Director currently has OPEN (/episodes/<uuid>). Sent with
  // every chat request so the Prod Assistant FOLLOWS the open episode instead of
  // staying pinned to whatever episode the thread first bound to. Trusted human
  // signal — the chat route re-binds the thread to it (2026-06-23).
  const pathname = usePathname();
  const openEpisodeId = pathname?.match(/\/episodes\/([^/?#]+)/)?.[1] ?? null;
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  // D105 (2026-08-10) — ЕДИНСТВЕННАЯ правда о том, идёт ли ход Полины: замок
  // `mind_session.busy`, который мост ставит на время хода. Локальный `streaming`
  // на эту роль не годится дважды: он гаснет в `finally` сразу, как мост ПРИНЯЛ
  // строку (а ход после этого идёт ещё минуты), и он вообще не загорается для
  // ходов, разбуженных КНОПКОЙ (approval_granted) — а именно там Директор трижды
  // за час спрашивал «она работает или встала?».
  const [turnBusySince, setTurnBusySince] = useState<string | null>(null);
  // Заполненность контекста Полины — токены последнего запроса хода (мост кладёт
  // их в mind_session). Разговор не обнуляется между ходами, поэтому число растёт
  // и упирается в окно модели; Директору нужно видеть это ДО того, как упрётся.
  const [contextTokens, setContextTokens] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState<number>(420);
  // Input height persisted across submits — without this, clearing the
  // textarea collapses it back to the `rows={2}` band ("узенькая полоска").
  const [inputHeight, setInputHeight] = useState<number>(INPUT_DEFAULT_PX);
  const inputResizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRec | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Live header status — fetched from GET /api/concierge/chat so it reflects the
  // provider/model ACTUALLY serving the PA right now AND whether the autonomous
  // auto-react loop is armed (honest, no stale agent/mode label). Null until loaded.
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const [autoReact, setAutoReact] = useState<boolean | null>(null);
  // D2 (2026-07-11): fetch the live header status (model label + auto-react).
  // Re-callable so the badge SELF-CORRECTS after an on-the-fly provider switch —
  // the mount-only fetch left the label stale (e.g. "OpenAI · gpt-5.5") after the
  // Director switched Polina to Sonnet 5. Called on mount AND after each turn.
  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/concierge/chat');
      if (!r.ok) return;
      const d = await r.json();
      if (d?.label) setModelLabel(d.label as string);
      if (typeof d?.autoReact === 'boolean') setAutoReact(d.autoReact);
    } catch {
      // non-fatal — keep the last known label
    }
  }, []);
  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // TD-20.A 2026-05-20 — AbortController for the in-flight chat request so
  // the Director can cancel a hanging turn. abortControllerRef holds the
  // current controller during streaming; null when no request is in flight.
  const abortControllerRef = useRef<AbortController | null>(null);
  // D83: DB-load эффект висит на [threadId] и не должен перезапускаться от каждой
  // новой реплики — иначе восстановление ленты дёргалось бы весь разговор. Ref
  // даёт ему прочитать АКТУАЛЬНЫЙ стейт, не попадая в зависимости.
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // TD-20.A — current tool plashka. `null` when no tool is executing.
  // `startedAt` is wall-clock so the elapsed-seconds counter ticks via the
  // toolElapsed state below.
  const [toolPlashka, setToolPlashka] = useState<{ id: string; name: string; startedAt: number } | null>(null);
  const [toolElapsedSec, setToolElapsedSec] = useState<number>(0);
  useEffect(() => {
    if (!toolPlashka) {
      setToolElapsedSec(0);
      return;
    }
    const tick = () => setToolElapsedSec(Math.floor((Date.now() - toolPlashka.startedAt) / 1000));
    tick();
    const handle = setInterval(tick, 500);
    return () => clearInterval(handle);
  }, [toolPlashka]);

  // Hydrate history + thread id + TTS preference + panel side / width.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch { /* ignore */ }
    try {
      // В mind-режиме тред привязан к эпизоду — его грузит эффект [openEpisodeId] ниже.
      if (!MIND_CHAT) {
        const t = localStorage.getItem(THREAD_KEY);
        if (t) setThreadId(t);
      }
    } catch { /* ignore */ }
    try {
      const tts = localStorage.getItem(TTS_KEY);
      if (tts === '1') setTtsEnabled(true);
    } catch { /* ignore */ }
    try {
      const w = parseInt(localStorage.getItem(WIDTH_KEY) ?? '', 10);
      if (Number.isFinite(w) && w >= 320 && w <= 900) setPanelWidth(w);
    } catch { /* ignore */ }
    try {
      const o = localStorage.getItem(OPEN_KEY);
      // Only honour an explicit '0' (Director chose to close last time).
      // Anything else — first visit, '1', unrecognised — keeps the default-open.
      if (o === '0') setOpen(false);
    } catch { /* ignore */ }
    try {
      const h = parseInt(localStorage.getItem(INPUT_HEIGHT_KEY) ?? '', 10);
      if (Number.isFinite(h) && h >= INPUT_MIN_PX && h <= INPUT_MAX_PX) setInputHeight(h);
    } catch { /* ignore */ }
  }, []);

  // Ф4.4 — mind-режим: тред СЛЕДУЕТ за открытым эпизодом через СВОЙ ключ.
  // Смена эпизода = смена треда = смена ленты; история нового треда дольётся
  // существующим [threadId] DB-load эффектом. Параллельные сериалы не мешаются.
  useEffect(() => {
    if (!MIND_CHAT) return;
    let cancelled = false;
    try {
      const t = localStorage.getItem(threadKeyFor(openEpisodeId));
      setThreadId(t ?? null);
      setMessages([]);
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }

      // D85 (2026-08-09): ключа в localStorage нет — СПРОСИТЬ СЕРВЕР, а не считать
      // тред новым. Привязка «тред ↔ эпизод» живёт в базе (`concierge_threads`), а
      // localStorage — лишь её кэш на этом браузере. На другом устройстве, в другом
      // профиле или после чистки хранилища панель открывала эпизод с пустым тредом
      // и заводила ВТОРОЙ: переписка не терялась, но становилась недостижимой из
      // UI, а разговор начинался с нуля на модели за $5/$25.
      //
      // Запрос — ровно первая ветка `resolveOpenThreadId`: открытый тред ИМЕННО
      // этого эпизода. Серийный и глобальный фолбэки не воспроизводим сознательно
      // (роут такой тред всё равно отвергнет, а при параллельных эпизодах он увёл
      // бы в чужой ум).
      if (!t && openEpisodeId) {
        void (async () => {
          try {
            const sb = createSupabaseBrowserClient();
            const { data } = await sb
              .from('concierge_threads')
              .select('id')
              .eq('episode_id', openEpisodeId)
              .is('ended_at', null)
              .order('started_at', { ascending: false })
              .limit(1);
            // Тот же каст, что у соседних запросов в этом файле: supabase-js
            // выводит tuple-with-error union и теряет форму строки.
            const rows = (data ?? []) as unknown as Array<{ id: string }>;
            const found = rows[0]?.id;
            if (cancelled || !found) return;
            setThreadId(found);
            try { localStorage.setItem(threadKeyFor(openEpisodeId), found); } catch { /* ignore */ }
          } catch { /* сеть/права — панель просто заведёт новый тред, как раньше */ }
        })();
      }
    } catch { /* ignore */ }
    return () => { cancelled = true; };
  }, [openEpisodeId]);

  // Persist panel width / open / input height.
  useEffect(() => {
    try { localStorage.setItem(WIDTH_KEY, String(panelWidth)); } catch { /* ignore */ }
  }, [panelWidth]);
  useEffect(() => {
    try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* ignore */ }
  }, [open]);
  useEffect(() => {
    try { localStorage.setItem(INPUT_HEIGHT_KEY, String(inputHeight)); } catch { /* ignore */ }
  }, [inputHeight]);

  // Inverted vertical resize for the PA input. Handle sits at the TOP of the
  // textarea — dragging up grows it (more chat space above the input bar),
  // dragging down shrinks. Mirrors the panel-width resize at line ~1000 which
  // also inverts depending on which edge the handle lives on.
  function onInputResizeStart(e: ReactMouseEvent): void {
    e.preventDefault();
    inputResizeRef.current = { startY: e.clientY, startH: inputHeight };
    const handleMove = (ev: MouseEvent): void => {
      const ref = inputResizeRef.current;
      if (!ref) return;
      const dy = ev.clientY - ref.startY;
      // Drag up → dy negative → startH - dy = startH + |dy| → grow.
      const next = Math.min(INPUT_MAX_PX, Math.max(INPUT_MIN_PX, ref.startH - dy));
      setInputHeight(next);
    };
    const handleUp = (): void => {
      inputResizeRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }

  // TD-54.3 — PA now lives in the middle grid column of StudioShell.
  // Write --pa-mid-width so the grid template can collapse the column to 0
  // when the panel is closed.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--pa-mid-width', open ? `${panelWidth}px` : '0px');
    return () => {
      root.style.setProperty('--pa-mid-width', '0px');
    };
  }, [open, panelWidth]);

  // Stop TTS on panel close so the Director isn't followed by speech.
  useEffect(() => {
    if (!open && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [open]);

  // Persist history.
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY_TURNS * 2)));
    } catch { /* storage may be disabled */ }
  }, [messages]);

  // Persist TTS preference.
  useEffect(() => {
    try {
      localStorage.setItem(TTS_KEY, ttsEnabled ? '1' : '0');
    } catch { /* ignore */ }
  }, [ttsEnabled]);

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  // Sprint α 2026-05-14 — team-chat unified thread.
  // Replaces the silent useActivityRealtime → /api/concierge/ambient hop.
  // Migration 0030 wires a Postgres trigger:
  //   activity_events INSERT → concierge_turns INSERT (role=system)
  // The browser only needs to read concierge_turns and render the two
  // server-authored bubble variants (kind=pipeline_event, kind=claude_message).
  //
  // TD-20.B 2026-05-20 — DISABLED client-side auto-react trigger.
  //
  // Previously this Realtime callback would POST /api/concierge/auto-react
  // for any pipeline_event / claude_message turn. That endpoint instructs
  // PA to reply `(нет действий — фон)` for ambient events (see
  // AUTO_REACT_INSTRUCTION in app/api/concierge/auto-react/route.ts:43)
  // and then suppresses that exact phrase server-side at line 191
  // (`isNoOp` regex). Net effect: Polina classified almost every Library
  // generation completion as routine ambient, replied with the no-op
  // phrase, the regex silently dropped it, and Director saw nothing —
  // hence his 2026-05-20 finding that "Polina never reacts to events".
  //
  // Replaced server-side by Inngest `pa/notify-needed` → exec-pa-react →
  // /api/concierge/chat-internal (Sprint TD-20.B C4, commit c0bf70e).
  // That path always persists a visible assistant turn, runs even when
  // no browser is open, and uses the AUTO_REACT_GUIDANCE block instead of
  // the no-op escape hatch.
  //
  // Kept the Realtime subscription itself (still feeds the chat UI with
  // ambient + claude_message bubbles). Just removed the auto-react POST.
  useConciergeTurnsRealtime(threadId, {
    onNewTurn: (turn: ConciergeTurnRow) => {
      const m = (turn.metadata ?? {}) as Record<string, unknown>;
      // TD-20.B 2026-05-20 — render server-authored auto-react assistant
      // turns (from /api/concierge/chat-internal via exec-pa-react). These
      // do NOT come through the chat-route streaming path, so without this
      // branch the Director never sees Polina's reaction even though it
      // landed in concierge_turns. metadata.auto_react=true is the marker
      // chat-internal sets; the regular chat-route assistant turn (which
      // arrives via the streaming POST response) does NOT have this flag,
      // so the de-dup-with-streaming concern from Realtime stays solved.
      // Ф5: ходы моста (m.bridge) приходят ТОЛЬКО Realtime'ом — рисуем их той
      // же веткой, что server-authored auto-react.
      if (turn.role === 'assistant' && (m.auto_react === true || m.bridge === true)) {
        // 2026-05-26 — chat-internal persists intermediate `🔧 toolName(args)`
        // tool_call turns with auto_react=true for audit. Director sees them
        // as visual noise in the chat. Drop them on the UI side; the
        // tool_calls metadata + audit trail in DB are preserved.
        if (turn.event_type === 'tool_call') return;
        const createdAt = (turn as { created_at?: string }).created_at;
        setMessages((prev) => {
          if (prev.some((p) => p.turnId === turn.id)) return prev;
          const awaiting = readAwaitingFromMetadata(m);
          return [
            ...prev,
            {
              role: 'assistant',
              content: turn.content,
              turnId: turn.id,
              ...(createdAt ? { createdAt } : {}),
              ...(awaiting ? { awaitingDirectorInput: awaiting } : {}),
            },
          ];
        });
        return;
      }
      if (turn.role !== 'system') return; // user/assistant flow through chat route
      const kind = m.kind as string | undefined;
      if (kind !== 'claude_message' && kind !== 'pipeline_event') return;
      // 2026-05-26 — drop redundant pipeline plashki (manual_trigger /
      // agent_started). They duplicate Polina's own dispatch report
      // and clutter the chat. Activity feed still receives them.
      if (kind === 'pipeline_event' && isAmbientChatNoise(m.event_type)) return;

      const createdAt = (turn as { created_at?: string }).created_at;
      setMessages((prev) => {
        // Dedupe by turnId in case of re-subscribe / strict-mode dupes.
        if (prev.some((p) => p.turnId === turn.id)) return prev;
        const next: Message = kind === 'claude_message'
          ? {
              role: 'claude',
              content: turn.content,
              turnId: turn.id,
              author: (m.author as string | undefined) ?? 'Claude',
              ...(createdAt ? { createdAt } : {}),
            }
          : {
              role: 'pipeline',
              content: turn.content,
              turnId: turn.id,
              severity: (m.severity as 'info' | 'warning' | 'error' | undefined) ?? 'info',
              ...(createdAt ? { createdAt } : {}),
            };
        return [...prev, next];
      });
    },
  });

  // One-time DB load on thread bind: pull recent system turns so reload
  // restores the team-chat + ambient bubbles, not just user/assistant cached
  // in sessionStorage.
  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    (async () => {
      try {
        console.log('[ConciergePanel] DB-load mount effect firing for thread', threadId);
        const sb = createSupabaseBrowserClient();
        // TD-20.B 2026-05-20 — also pull auto-react assistant turns so
        // they survive page reload. Filter is applied in JS below.
        // D83 (2026-08-08): роль `director` тоже грузится. До этой правки запрос
        // брал только system+assistant, а внутри цикла оставлял из assistant
        // ТОЛЬКО auto-react — то есть при возврате в эпизод лента восстанавливала
        // одни ambient-пузыри, без единой реплики разговора. Директор: «переключение
        // между эпизодами чат Полины стирается и не восстанавливается».
        //
        // Опаснее косметики: панель шлёт в /api/mind/chat историю ИЗ СВОЕГО стейта
        // (роут ничего не грузит из базы), и `sessionStorage` чистится при смене
        // треда. Пустая лента = следующий ход уходит без памяти, и ум начинает
        // разговор заново, хотя вся история лежит в concierge_turns.
        const { data, error } = await sb
          .from('concierge_turns')
          .select('id,role,content,metadata,created_at')
          .eq('thread_id', threadId)
          .in('role', ['system', 'assistant', 'director'])
          .order('created_at', { ascending: false })
          .limit(60);
        console.log('[ConciergePanel] DB-load result: rows=', data?.length ?? 0, 'error=', error);
        if (cancelled || error || !data) return;
        // supabase-js infers a tuple-with-error union for the row type when
        // multiple filters chain on string columns; cast to the local
        // row shape used by the loop below.
        type SystemTurnRow = {
          id: string;
          role: string;
          content: string;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        const rows = data as unknown as SystemTurnRow[];
        const additions: Message[] = [];
        // D83: ленту разговора (director + обычные assistant) восстанавливаем
        // ТОЛЬКО когда она пуста — то есть после смены эпизода или холодной
        // загрузки. Если реплики уже на экране, они пришли стримингом и своего
        // `turnId` не несут, так что дедуп по id их не поймает и мы бы задвоили
        // диалог. Ambient/team-chat пузыри грузятся всегда, как и раньше.
        const conversationEmpty = messagesRef.current.every(
          (m) => m.role !== 'user' && m.role !== 'assistant',
        );
        for (const t of [...rows].reverse()) {
          const meta = (t.metadata ?? {}) as Record<string, unknown>;
          // D83: ход Директора — в ленте это `user`. Роут пишет его ДО цикла
          // (role='director'), поэтому без него восстановленный разговор был бы
          // монологом ума.
          if (t.role === 'director') {
            if (conversationEmpty && t.content.trim()) {
              additions.push({
                role: 'user',
                content: t.content,
                turnId: t.id,
                createdAt: t.created_at,
              });
            }
            continue;
          }
          // D83: обычный (не auto-react) ответ ума — тот самый, что приходит
          // стримингом в живом ходе и раньше при возврате терялся целиком.
          if (t.role === 'assistant' && meta.auto_react !== true) {
            if (conversationEmpty && t.content.trim()) {
              additions.push({
                role: 'assistant',
                content: t.content,
                turnId: t.id,
                createdAt: t.created_at,
              });
            }
            continue;
          }
          // TD-20.B — auto-react assistant turn (server-authored by
          // chat-internal). Restore so reload doesn't lose Polina's
          // autonomous reactions.
          if (t.role === 'assistant' && meta.auto_react === true) {
            // 2026-05-26 — skip intermediate tool_call rows persisted by
            // chat-internal for audit; they're visual noise in chat.
            // Detect via presence of tool_calls in metadata (set by
            // chat-internal:281-298).
            if (Array.isArray(meta.tool_calls) && meta.tool_calls.length > 0) {
              continue;
            }
            const awaiting = readAwaitingFromMetadata(meta);
            additions.push({
              role: 'assistant',
              content: t.content,
              turnId: t.id,
              createdAt: t.created_at,
              ...(awaiting ? { awaitingDirectorInput: awaiting } : {}),
            });
            continue;
          }
          if (t.role !== 'system') continue;
          const kind = meta.kind as string | undefined;
          if (kind === 'claude_message') {
            additions.push({
              role: 'claude',
              content: t.content,
              turnId: t.id,
              author: (meta.author as string | undefined) ?? 'Claude',
              createdAt: t.created_at,
            });
          } else if (kind === 'pipeline_event') {
            // 2026-05-26 — drop redundant pipeline plashki here too.
            if (isAmbientChatNoise(meta.event_type)) continue;
            additions.push({
              role: 'pipeline',
              content: t.content,
              turnId: t.id,
              severity: (meta.severity as 'info' | 'warning' | 'error' | undefined) ?? 'info',
              createdAt: t.created_at,
            });
          }
        }
        console.log('[ConciergePanel] additions after filter:', additions.length, additions.map((a) => ({ role: a.role, turnId: a.turnId, head: a.content.slice(0, 30) })));
        if (additions.length === 0) return;
        setMessages((prev) => {
          // Merge respecting existing dedupe; insert only those not already present.
          const seen = new Set(prev.map((m) => m.turnId).filter(Boolean));
          const fresh = additions.filter((a) => !a.turnId || !seen.has(a.turnId));
          console.log('[ConciergePanel] fresh after dedupe:', fresh.length, 'prev size:', prev.length);
          return [...prev, ...fresh];
        });
      } catch {
        // Non-fatal: chat still works, just without ambient/team-chat history on reload.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  // TD-20.B 2026-05-20 — polling fallback for Realtime.
  // Director observed: ambient pipeline_event + auto-react assistant turns
  // arrive only after F5/Ctrl+R. Symptom of a dead Realtime WebSocket
  // (idle tab → server drops → supabase-js v2 reconnect not always firing).
  // Independent of WS state, we poll concierge_turns every 15s for rows
  // newer than the last we have rendered, and merge by turnId. If WS is
  // alive the rows arrived already and dedup discards them; if WS is
  // dead this is the only delivery path and max lag is 15s.
  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async (): Promise<void> => {
      try {
        const sb = createSupabaseBrowserClient();
        const { data, error } = await sb
          .from('concierge_turns')
          .select('id,role,content,metadata,created_at')
          .eq('thread_id', threadId)
          .in('role', ['system', 'assistant'])
          .order('created_at', { ascending: false })
          .limit(20);
        if (cancelled || error || !data) return;
        type Row = {
          id: string;
          role: string;
          content: string;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        const rows = data as unknown as Row[];
        const additions: Message[] = [];
        for (const t of [...rows].reverse()) {
          const meta = (t.metadata ?? {}) as Record<string, unknown>;
          if (t.role === 'assistant' && meta.auto_react === true) {
            // 2026-05-26 — skip tool_call audit rows (see DB-load filter).
            if (Array.isArray(meta.tool_calls) && meta.tool_calls.length > 0) {
              continue;
            }
            const awaiting = readAwaitingFromMetadata(meta);
            additions.push({
              role: 'assistant',
              content: t.content,
              turnId: t.id,
              createdAt: t.created_at,
              ...(awaiting ? { awaitingDirectorInput: awaiting } : {}),
            });
            continue;
          }
          if (t.role !== 'system') continue;
          const kind = meta.kind as string | undefined;
          if (kind === 'claude_message') {
            additions.push({
              role: 'claude',
              content: t.content,
              turnId: t.id,
              author: (meta.author as string | undefined) ?? 'Claude',
              createdAt: t.created_at,
            });
          } else if (kind === 'pipeline_event') {
            // 2026-05-26 — drop redundant pipeline plashki here too.
            if (isAmbientChatNoise(meta.event_type)) continue;
            additions.push({
              role: 'pipeline',
              content: t.content,
              turnId: t.id,
              severity: (meta.severity as 'info' | 'warning' | 'error' | undefined) ?? 'info',
              createdAt: t.created_at,
            });
          }
        }
        if (additions.length === 0) return;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.turnId).filter(Boolean));
          const fresh = additions.filter((a) => a.turnId && !seen.has(a.turnId));
          if (fresh.length === 0) return prev;
          return [...prev, ...fresh];
        });
      } catch {
        /* polling is best-effort */
      }
    };

    // Fire once after a small delay (let initial DB-load settle) then on interval.
    const initial = setTimeout(() => { void poll(); }, 5_000);
    timer = setInterval(() => { void poll(); }, 15_000);
    return () => {
      cancelled = true;
      clearTimeout(initial);
      if (timer) clearInterval(timer);
    };
  }, [threadId]);

  // D105 — опрос замка хода. Читаем ту же базу тем же браузерным клиентом, что и
  // остальной опрос панели: ни нового роута, ни правки моста — источник уже есть.
  useEffect(() => {
    if (!MIND_BRIDGE || !openEpisodeId) { setTurnBusySince(null); return; }
    let cancelled = false;
    const read = async () => {
      try {
        const sb = createSupabaseBrowserClient();
        const { data } = await sb.from('episodes').select('metadata').eq('id', openEpisodeId).maybeSingle();
        if (cancelled) return;
        const meta = ((data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
        const mind = (meta.mind_session ?? {}) as {
          busy?: { started_at?: string } | null;
          context_tokens?: number;
        };
        setTurnBusySince(mind.busy?.started_at ?? null);
        setContextTokens(typeof mind.context_tokens === 'number' ? mind.context_tokens : null);
      } catch { /* опрос best-effort: молчащая плашка лучше молчащего экрана */ }
    };
    void read();
    const timer = setInterval(() => { void read(); }, 4_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [openEpisodeId]);

  // Секундная стрелка для плашки — тикает только пока ход идёт.
  useEffect(() => {
    if (!turnBusySince) return;
    const t = setInterval(() => setNowTick(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [turnBusySince]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;

    const submittedAt = new Date().toISOString();

    // Ф5: путь МОСТА — одна INSERT-строка, никакого стрима. Ответ Полины
    // придёт Realtime'ом (ветка m.bridge в onNewTurn); занятость показывает
    // плашка «ход в работе», которую снимет его приход.
    if (MIND_BRIDGE && openEpisodeId) {
      setMessages((prev) => [...prev, { role: 'user', content: text, createdAt: submittedAt }]);
      setInput('');
      setStreaming(true);
      try {
        const res = await fetch('/api/mind/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episodeId: openEpisodeId, text }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; threadId?: string; error?: string };
        if (!res.ok || !j.ok) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `⚠️ мост не принял сообщение: ${j.error ?? res.status}` },
          ]);
        } else if (j.threadId && j.threadId !== threadId) {
          setThreadId(j.threadId);
          try { localStorage.setItem(threadKeyFor(openEpisodeId), j.threadId); } catch { /* ignore */ }
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `⚠️ мост недоступен: ${err instanceof Error ? err.message : err}` },
        ]);
      } finally {
        setStreaming(false);
      }
      return;
    }

    const next: Message[] = [
      ...messages,
      { role: 'user', content: text, createdAt: submittedAt },
    ];
    setMessages(next);
    setInput('');
    setStreaming(true);
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '', createdAt: new Date().toISOString() },
    ]);

    try {
      // Sprint α 2026-05-14 — filter UI-only roles out of the wire payload.
      // OpenAI Messages API rejects 'pipeline' and 'claude' (those are
      // ConciergePanel-render variants, not conversation participants).
      // Their context is already injected via the system-prompt-builder
      // PIPELINE_EVENTS_SINCE_LAST_REPLY + TEAM_CHAT_FROM_CLAUDE blocks
      // that the chat route loads from DB on each request.
      const wireMessages = next
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));
      // TD-20.A — AbortController exposes the in-flight fetch to the Cancel
      // button. The signal is also forwarded server-side via req.signal,
      // closing the OpenAI/tool loop on abort.
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const res = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: wireMessages,
          threadId: threadId ?? undefined,
          // Open-episode context (2026-06-23): lets the chat follow the episode
          // the Director is viewing instead of the thread's first binding.
          episodeId: openEpisodeId ?? undefined,
        }),
        signal: controller.signal,
      });
      // Capture the persistent thread id from the response header.
      const newThreadId = res.headers.get('X-Concierge-Thread-Id');
      if (newThreadId && newThreadId !== threadId) {
        if (threadId) {
          // Chat-per-series (0049): the server switched to another series'
          // thread. The local transcript belongs to the previous thread —
          // keep only the just-sent exchange (user msg + assistant
          // placeholder); the [threadId] DB-load effect restores the new
          // thread's own history.
          setMessages((prev) => prev.slice(-2));
          try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        }
        setThreadId(newThreadId);
        try { localStorage.setItem(threadKeyFor(openEpisodeId), newThreadId); } catch { /* ignore */ }
      }
      // 2026-05-22 — server-side error envelope detection BEFORE stream parse.
      // When chat route's outer try-catch fires (Supabase quota / unavailable
      // / unexpected throw before stream started), the server returns
      // `{ ok: false, error, detail }` JSON with a 4xx/5xx status. Detect by
      // content-type and short-circuit into a structured assistant bubble
      // message instead of trying to read a non-existent stream.
      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || contentType.includes('application/json')) {
        let envelopeDetail = `chat route returned HTTP ${res.status}`;
        try {
          const env = (await res.json()) as { error?: string; detail?: string };
          if (env?.detail) {
            envelopeDetail = env.detail;
          } else if (env?.error) {
            envelopeDetail = env.error;
          }
        } catch {
          /* not JSON either — keep generic */
        }
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: 'assistant',
            content: `❌ ${envelopeDetail}`,
          };
          return copy;
        });
        return;
      }

      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      // TD-20.A — JSON-per-line stream envelope. Server emits one JSON
      // object per newline-terminated line. Possible event shapes:
      //   { t: 'token', v: '...' }     incremental token from final-answer round
      //   { t: 'text',  v: '...' }     legacy / non-streaming text chunk
      //   { t: 'tool_start',   id, name, args_preview }
      //   { t: 'tool_result',  id, name, ok }
      //   { t: 'tool_timeout', id, name }
      //   { t: 'cancelled' }
      //   { t: 'error', message }
      // Any unrecognised line falls back to plain text append.
      let acc = '';
      let buffer = '';
      let cancelledByServer = false;
      let serverError: string | null = null;
      // 2026-05-22 — belt-and-braces HTML detection. If somehow the response
      // is HTML (Next.js error page, proxy redirect to login, etc.) we
      // surface a clean message instead of rendering raw <!DOCTYPE> into
      // Polina's bubble. Inspected on the very first chunk only.
      let firstChunkChecked = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // 2026-05-22 — peek at first ~120 bytes for HTML prefix. The outer
        // error envelope above catches the common case (JSON content-type);
        // this is a last-resort safety net for proxies / streaming HTML.
        if (!firstChunkChecked) {
          firstChunkChecked = true;
          const head = buffer.slice(0, 120).toLowerCase().trimStart();
          if (head.startsWith('<!doctype') || head.startsWith('<html')) {
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = {
                role: 'assistant',
                content:
                  '❌ Server returned HTML instead of stream — check Next.js dev console for the underlying error.',
              };
              return copy;
            });
            try { reader.cancel(); } catch { /* ignore */ }
            return;
          }
        }
        let nlIndex = buffer.indexOf('\n');
        while (nlIndex !== -1) {
          const line = buffer.slice(0, nlIndex);
          buffer = buffer.slice(nlIndex + 1);
          nlIndex = buffer.indexOf('\n');
          if (!line.trim()) continue;
          let event: Record<string, unknown> | null = null;
          if (line.startsWith('{')) {
            try { event = JSON.parse(line) as Record<string, unknown>; } catch { event = null; }
          }
          if (!event || typeof event.t !== 'string') {
            // Legacy / unrecognised — append to assistant bubble verbatim.
            acc += line;
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { ...copy[copy.length - 1], role: 'assistant', content: acc };
              return copy;
            });
            continue;
          }
          const t = event.t as string;
          if (t === 'token' || t === 'text') {
            const v = typeof event.v === 'string' ? event.v : '';
            if (v) {
              acc += v;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { ...copy[copy.length - 1], role: 'assistant', content: acc };
                return copy;
              });
            }
          } else if (t === 'tool_start') {
            const id = typeof event.id === 'string' ? event.id : '';
            const name = typeof event.name === 'string' ? event.name : 'tool';
            setToolPlashka({ id, name, startedAt: Date.now() });
          } else if (t === 'tool_result' || t === 'tool_timeout') {
            // 2026-05-26 (follow-up): Director said the in-body chips
            // were too many — when Polina runs 20+ tool calls per turn,
            // the bubble fills with "…Polina thinking · ✓ name" lines.
            // The bottom-of-chat `Polina is thinking…` indicator already
            // signals activity; chips here add noise without info. The
            // server still persists tool_call audit rows + the toolPlashka
            // pulse is shown during execution.
            setToolPlashka(null);
          } else if (t === 'cancelled') {
            cancelledByServer = true;
          } else if (t === 'error') {
            serverError = typeof event.message === 'string' ? event.message : 'unknown error';
          }
          // Unknown event types are ignored — forward compatibility.
        }
      }
      // Flush any trailing partial line (best-effort — usually empty).
      if (buffer.trim()) {
        acc += buffer;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: acc };
          return copy;
        });
      }
      setToolPlashka(null);
      if (cancelledByServer) {
        setMessages((prev) => {
          const copy = [...prev];
          const tail = copy[copy.length - 1];
          if (tail?.role === 'assistant') {
            copy[copy.length - 1] = {
              ...tail,
              role: 'assistant',
              content: (tail.content || '') + (tail.content ? '\n\n' : '') + '_(cancelled)_',
            };
          }
          return copy;
        });
      } else if (serverError) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            ...copy[copy.length - 1],
            role: 'assistant',
            content: (acc || '') + (acc ? '\n\n' : '') + `⚠️ ${serverError}`,
          };
          return copy;
        });
      } else if (ttsEnabled && acc.trim()) {
        // Speak the final reply once the stream closes (no error, not cancelled).
        speakText(acc);
      }
    } catch (err) {
      // AbortError from fetch when Director hits Cancel — show local
      // cancellation note and exit quietly. Server-side cancelled event may
      // not arrive if the abort closed the connection first.
      const isAbort =
        err instanceof DOMException && err.name === 'AbortError';
      setMessages((prev) => {
        const copy = [...prev];
        const tail = copy[copy.length - 1];
        const partial = tail?.role === 'assistant' ? tail.content || '' : '';
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          role: 'assistant',
          content: isAbort
            ? partial + (partial ? '\n\n' : '') + '_(cancelled)_'
            : '⚠️ Prod Assistant is offline. Likely missing `OPENAI_API_KEY` in `.env.local` or the API route errored.',
        };
        return copy;
      });
      if (!isAbort) {
        // eslint-disable-next-line no-console
        console.error('[prod-assistant]', err);
      }
    } finally {
      setStreaming(false);
      setToolPlashka(null);
      abortControllerRef.current = null;
      // Self-correct the header badge (model label / auto-react) — a provider
      // switch mid-session is reflected right after the next turn (D2).
      void refreshStatus();
    }
  }

  // TD-20.A — cancel the in-flight turn. Aborting the fetch triggers
  // AbortError on the reader loop AND closes the server-side request,
  // which propagates as req.signal.aborted in the chat route → the
  // server emits {"t":"cancelled"} then closes.
  function handleCancel() {
    if (MIND_BRIDGE && openEpisodeId) {
      // Мост убьёт дерево процесса хода (taskkill /T) и допишет честную строку.
      void fetch('/api/mind/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId: openEpisodeId, cancel: true }),
      }).catch(() => {});
    }
    abortControllerRef.current?.abort();
  }

  // q9a B2 (2026-06-30) — "Новый разговор": archive the current thread
  // (ended_at) and open a fresh one bound to the open episode. Non-destructive —
  // history is preserved in the DB, this just resets the live context so chat
  // stops dragging a months-old thread along. Confirm first (it clears the view).
  async function handleNewConversation() {
    if (streaming) return;
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        'Начать новый разговор? Текущий будет архивирован (история сохранится), а чат очистится.',
      );
      if (!ok) return;
    }
    try {
      const res = await fetch('/api/concierge/new-thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: threadId ?? undefined,
          episodeId: openEpisodeId ?? undefined,
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { threadId?: string };
      if (!data.threadId) return;
      setThreadId(data.threadId);
      try { localStorage.setItem(threadKeyFor(openEpisodeId), data.threadId); } catch { /* ignore */ }
      setMessages([]);
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[prod-assistant] new conversation failed', err);
    }
  }

  async function toggleVoice() {
    setMicError(null);
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setMicError('Voice input unavailable in this browser. Use Chrome or Edge.');
      return;
    }
    if (listening) {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    // Pre-flight: request microphone permission via getUserMedia so the OS
    // permission prompt appears reliably. Without this, some Chrome builds
    // silently fail with `not-allowed` after a previous denial.
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Immediately release — Web Speech opens its own internal stream.
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : 'PermissionError';
      // eslint-disable-next-line no-console
      console.warn('[prod-assistant] mic permission denied:', err);
      setMicError(
        name === 'NotAllowedError'
          ? 'Microphone permission denied. Click the address-bar mic icon → allow, then retry.'
          : `Microphone unavailable (${name}). Check system audio settings.`,
      );
      return;
    }

    let rec: SpeechRec;
    try {
      rec = new Ctor();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[prod-assistant] SpeechRecognition ctor failed:', err);
      setMicError('Failed to initialise speech recognition. Try refreshing the page.');
      return;
    }

    rec.lang = pickRecognitionLang();
    rec.interimResults = true;
    // Continuous mode keeps the mic open across short pauses. Director needs
    // ~5s pauses for thinking; default `continuous=false` cuts off after the
    // first silence boundary (~0.5s) which is too aggressive. We compensate
    // by managing our own silence timer below — auto-stop after
    // MIC_SILENCE_TIMEOUT_MS of no new transcript.
    rec.continuous = true;

    // Capture the input value at the moment recognition starts so each
    // recognition session APPENDS to existing text instead of replacing it.
    const inputAtStart = input.trim();

    const resetSilenceTimer = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        try { recognitionRef.current?.stop(); } catch { /* */ }
      }, MIC_SILENCE_TIMEOUT_MS);
    };

    rec.onresult = (e) => {
      // Concatenate ALL segments so far (final + currently-interim). In
      // continuous mode `e.results` accumulates across the whole session.
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        transcript += r[0].transcript;
      }
      const combined = inputAtStart
        ? `${inputAtStart} ${transcript}`
        : transcript;
      setInput(combined);
      resetSilenceTimer();
    };
    rec.onend = () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      setListening(false);
    };
    rec.onerror = (e) => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      // `no-speech` in continuous mode just means a long silence boundary
      // was reached — keep the session quiet and let the silence timer
      // decide when to actually stop.
      if (e?.error === 'no-speech') {
        return;
      }
      // eslint-disable-next-line no-console
      console.error('[prod-assistant] speech recognition error:', e);
      setMicError(describeMicError(e?.error));
      setListening(false);
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
      // Kick off the silence timer immediately so a fully-silent session
      // still stops on its own.
      resetSilenceTimer();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[prod-assistant] rec.start() threw:', err);
      setMicError(
        err instanceof Error ? `start() failed: ${err.message}` : 'start() failed',
      );
    }
  }

  function toggleTts() {
    setTtsEnabled((v) => {
      const nextEnabled = !v;
      if (!nextEnabled && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      return nextEnabled;
    });
  }

  return (
    <>
      {/* Floating trigger — anchored at bottom-left next to sidebar.
          Only rendered when the panel is closed (TD-54.3 — PA lives in
          the middle grid column, so its open-state hides the icon). */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Prod Assistant"
          className={cn(
            'fixed bottom-5 z-30 h-14 w-14 rounded-full shadow-[var(--panel-shadow)]',
            'flex items-center justify-center text-[var(--text-inverse)]',
            'transition-transform hover:scale-105 active:scale-95',
          )}
          style={{
            background: `linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))`,
            left: 'calc(var(--sidebar-width, 15rem) + 1.25rem)',
          }}
        >
          <MessageCircle size={22} strokeWidth={2} />
        </button>
      )}

      {/* Panel — sticks within the middle grid column.
          When closed → returns null (column collapses to 0 via --pa-mid-width). */}
      {open && (
      <aside
        className={cn(
          'sticky top-0 z-40 h-screen flex flex-col self-start',
          'border-r border-glass bg-panel-glass-strong backdrop-blur-md shadow-[var(--panel-shadow)]',
        )}
        style={{
          backdropFilter: 'blur(var(--panel-glass-blur))',
          width: `${panelWidth}px`,
        }}
      >
        {/* Resize handle — drag the RIGHT edge horizontally to grow/shrink. */}
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = panelWidth;
            const onMove = (mv: MouseEvent) => {
              const dx = mv.clientX - startX;
              // Handle on the right edge → drag right = grow.
              const w = Math.max(320, Math.min(900, startW + dx));
              setPanelWidth(w);
            };
            const onUp = () => {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
          className={cn(
            'absolute top-0 h-full w-1.5 cursor-ew-resize z-50',
            'hover:bg-[var(--accent-primary)]/30',
            'right-0 translate-x-1/2',
          )}
          aria-label="Resize panel"
          title="Drag to resize"
        />
        {/* Header */}
        <header className="flex items-center justify-between px-4 h-14 border-b border-glass">
          <div className="flex items-center gap-2.5">
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))`,
              }}
            >
              <Sparkles size={16} className="text-[var(--text-inverse)]" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-text-primary">Prod Assistant</div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-muted">
                <span>{modelLabel ?? '…'}</span>
                {autoReact !== null && (
                  <span
                    title={
                      autoReact
                        ? 'Auto-react ARMED — Polina reacts autonomously to pipeline events'
                        : 'Auto-react OFF — Polina answers only the Director (no autonomous loop)'
                    }
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-1.5 py-px font-medium',
                      autoReact
                        ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                        : 'bg-[var(--bg-elevated)] text-text-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        autoReact ? 'bg-[var(--accent-primary)]' : 'bg-text-muted',
                      )}
                    />
                    auto {autoReact ? 'on' : 'off'}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleNewConversation}
              disabled={streaming}
              aria-label="Новый разговор"
              title="Новый разговор (архивирует текущий)"
              className="h-8 w-8 rounded-md text-text-secondary hover:bg-[var(--panel-hover-bg)] hover:text-text-primary flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <MessageSquarePlus size={16} />
            </button>
            <button
              onClick={toggleTts}
              aria-label={ttsEnabled ? 'Disable voice replies' : 'Enable voice replies'}
              title={ttsEnabled ? 'Voice replies on' : 'Voice replies off'}
              className={cn(
                'h-8 w-8 rounded-md flex items-center justify-center transition-colors',
                ttsEnabled
                  ? 'text-[var(--accent-primary)] bg-[color-mix(in_oklab,var(--accent-primary)_14%,transparent)]'
                  : 'text-text-secondary hover:bg-[var(--panel-hover-bg)] hover:text-text-primary',
              )}
            >
              {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="h-8 w-8 rounded-md text-text-secondary hover:bg-[var(--panel-hover-bg)] hover:text-text-primary flex items-center justify-center"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-sm text-text-secondary leading-relaxed">
              <p className="mb-2">Hi. I&apos;m your Prod Assistant.</p>
              <p className="text-text-muted text-xs">
                Examples:
                <br />• What is currently blocked?
                <br />• Show me pending approvals
                <br />• How much have we spent on episode E01?
              </p>
            </div>
          )}
          {messages.map((m, i) => {
            const key = m.turnId ?? `local-${i}`;
            // Director 2026-06-15 — bake "HH:MM Author: " INTO the message text
            // (the standalone time chip didn't survive copy-paste). timeShort is
            // Dubai-local; author per role. Display-only: m.content (wire / TTS /
            // storage) is untouched.
            const timeShort = formatDubaiTime(m.createdAt);
            const timeFull = formatDubaiFull(m.createdAt);
            const author = authorLabel(m);
            // Author + time as a muted header line above the bubble (Director
            // 2026-06-16: dim the name/time, break after the name). Still a real
            // DOM text line, so a copy-paste of the chat keeps "13:53 · Полина".
            const meta = timeShort ? `${timeShort} · ${author}` : author;
            if (m.role === 'user') {
              return (
                <div key={key} className="ml-8 flex flex-col items-end gap-0.5">
                  <div className="text-[10px] text-text-muted px-1">{meta}</div>
                  <div
                    className="rounded-xl px-3 py-2 text-sm bg-[var(--accent-primary)] text-[var(--text-inverse)]"
                    title={timeFull ?? undefined}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                </div>
              );
            }
            if (m.role === 'assistant') {
              return (
                <div key={key} className="mr-8 flex flex-col gap-1.5">
                  <div className="text-[10px] text-text-muted px-1">{meta}</div>
                  {/* TD-25 P3 (2026-05-21): yellow "🟡 Полина ждёт" chip
                      above the bubble when Polina is explicitly waiting on
                      Director input. Closes the silent-wait UX bug. */}
                  {m.awaitingDirectorInput && (
                    <div
                      className="self-start rounded-full border px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        background: 'color-mix(in oklab, var(--accent-warning) 12%, transparent)',
                        borderColor: 'color-mix(in oklab, var(--accent-warning) 45%, transparent)',
                        color: 'var(--accent-warning)',
                      }}
                      title="Polina is waiting for your reply. Click choices below or just answer."
                    >
                      🟡 Полина ждёт ответа: «{m.awaitingDirectorInput.question}»
                    </div>
                  )}
                  {/* 2026-05-26 — Director said the assistant body read
                      too bright next to the muted Activity-feed plashki.
                      `--tw-prose-body` is the prose plugin's body-text
                      token; we point it at `--text-secondary` (same family
                      Activity feed uses for info-severity rows) so prose
                      colors all inherit the dimmer tone without overriding
                      individual elements. */}
                  <div
                    className="rounded-xl px-3 py-2 text-sm bg-panel-glass border border-glass text-text-secondary"
                    style={{
                      ['--tw-prose-body' as string]: 'var(--text-secondary)',
                      ['--tw-prose-bold' as string]: 'var(--text-primary)',
                    }}
                  >
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{withHardBreaks(m.content) || '…'}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            }
            if (m.role === 'claude') {
              return (
                <div key={key} className="mr-8 flex flex-col gap-0.5">
                  <div className="text-[10px] text-text-muted px-1">{meta}</div>
                  <div
                    className="rounded-xl px-3 py-2 text-sm border"
                    style={{
                      background: 'color-mix(in oklab, var(--accent-info) 8%, transparent)',
                      borderColor: 'color-mix(in oklab, var(--accent-info) 35%, transparent)',
                      color: 'var(--text-primary)',
                    }}
                    title={`Team chat — ${m.author ?? 'Claude'}`}
                  >
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{withHardBreaks(m.content) || '…'}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            }
            // role === 'pipeline'
            const accent =
              m.severity === 'error'
                ? 'var(--accent-danger)'
                : m.severity === 'warning'
                  ? 'var(--accent-warning)'
                  : 'var(--text-muted)';
            // 2026-05-26 — reformat pipeline body to a compressed, paragraphed
            // shape (see formatPipelineContent). whitespace-pre-line honours
            // the \n\n separators we inject.
            const formatted = formatPipelineContent(m.content);
            return (
              <div
                key={key}
                className="rounded-md px-2 py-1 text-[11px] font-mono mx-2 whitespace-pre-line leading-relaxed flex items-start justify-between gap-2"
                style={{
                  background: 'color-mix(in oklab, currentColor 4%, transparent)',
                  color: accent,
                  borderLeft: `2px solid ${accent}`,
                }}
                title={timeFull ? `Pipeline event · ${timeFull}` : 'Pipeline event'}
              >
                <span className="flex-1 min-w-0">{timeShort ? `${timeShort} ` : ''}{formatted}</span>
              </div>
            );
          })}
          {/* TD-20.A — Tool plashka: shown while PA is mid-tool. Lives in
              the scroll area so it stays anchored at the bottom of the
              conversation and scrolls naturally. */}
          {toolPlashka && (
            <div
              className="rounded-md px-3 py-2 text-xs mx-2 flex items-center gap-2 border-l-2"
              style={{
                background: 'color-mix(in oklab, var(--accent-primary) 6%, transparent)',
                borderLeftColor: 'var(--accent-primary)',
                color: 'var(--text-secondary)',
              }}
              title={`Tool call ${toolPlashka.id}`}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent-primary)] animate-pulse" />
              <span className="font-mono">{toolPlashka.name}</span>
              <span className="text-text-muted">·</span>
              <span className="text-text-muted tabular-nums">{toolElapsedSec}s</span>
            </div>
          )}
          {/* D105 — ход Полины идёт. Живёт от замка в базе, поэтому виден и для хода,
              который разбудила КНОПКА, а не отправка из панели. Время — от старта хода,
              чтобы «долго» отличалось от «висит». */}
          {MIND_BRIDGE && turnBusySince && (
            <div className="text-xs px-2 flex items-center gap-1.5 text-[var(--accent-primary)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse" />
              <span>Полина работает</span>
              <span className="text-text-muted">·</span>
              <span className="text-text-muted tabular-nums">
                {(() => {
                  const sec = Math.max(0, Math.round((nowTick - new Date(turnBusySince).getTime()) / 1000));
                  return sec < 60 ? `${sec} с` : `${Math.floor(sec / 60)} мин ${sec % 60} с`;
                })()}
              </span>
            </div>
          )}
          {/* Заполненность контекста Полины. Окно Opus — 200k; порог 70% выбран
              как «ещё успеваешь свернуть тему», а не «уже поздно». */}
          {MIND_BRIDGE && contextTokens !== null && (
            <div
              className="text-xs px-2 flex items-center gap-1.5 text-text-muted"
              title={`${contextTokens.toLocaleString('ru-RU')} токенов в последнем запросе хода`}
            >
              <span>контекст Полины</span>
              <span className="tabular-nums">
                {Math.round(contextTokens / 1000)}k / 200k
              </span>
              <span
                className={
                  contextTokens / 200_000 >= 0.85
                    ? 'text-[var(--status-error,#e5484d)]'
                    : contextTokens / 200_000 >= 0.7
                      ? 'text-[var(--accent-primary)]'
                      : 'text-text-muted'
                }
              >
                {Math.round((contextTokens / 200_000) * 100)}%
              </span>
            </div>
          )}
          {/* TD-20.A — Generic streaming hint when no tool plashka is active. */}
          {streaming && !toolPlashka && !turnBusySince && (
            <div className="text-xs text-text-muted px-2 italic flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] animate-pulse" />
              {MIND_BRIDGE ? 'принято, ждёт очереди…' : 'Polina is thinking…'}
            </div>
          )}
        </div>

        {/* Mic error banner */}
        {micError && (
          <div
            role="alert"
            className="border-t border-[var(--accent-danger)] bg-[color-mix(in_oklab,var(--accent-danger)_14%,transparent)] px-3 py-2 text-xs text-[var(--accent-danger)] flex items-start gap-2"
          >
            <span aria-hidden>⚠️</span>
            <span className="flex-1">{micError}</span>
            <button
              type="button"
              onClick={() => setMicError(null)}
              aria-label="Dismiss"
              className="text-[var(--accent-danger)] hover:opacity-70"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="border-t border-glass p-3 flex items-end gap-2">
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={listening ? 'Stop voice input' : 'Start voice input'}
            className={cn(
              'h-10 w-10 rounded-lg flex items-center justify-center border transition-colors',
              listening
                ? 'bg-[color-mix(in_oklab,var(--accent-danger)_18%,transparent)] border-[var(--accent-danger)] text-[var(--accent-danger)]'
                : 'border-glass text-text-secondary hover:bg-[var(--panel-hover-bg)] hover:text-text-primary',
            )}
          >
            {listening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <div className="relative flex-1">
            {/* Inverted resize handle — sits along the TOP edge. Drag up = grow,
                drag down = shrink. Persists across submits. */}
            <button
              type="button"
              aria-label="Resize input (drag up to grow)"
              title="Drag up to grow, down to shrink"
              onMouseDown={onInputResizeStart}
              className={cn(
                'absolute -top-1 left-1/2 -translate-x-1/2 z-10',
                'h-2 w-16 rounded-full cursor-ns-resize',
                'bg-glass hover:bg-glass-active transition-colors',
                'flex items-center justify-center',
              )}
            >
              <span
                aria-hidden
                className="block h-0.5 w-8 rounded-full bg-text-muted/60"
              />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as FormEvent);
                }
              }}
              style={{ height: `${inputHeight}px` }}
              placeholder="Ask the Prod Assistant… (Shift+Enter = newline, drag handle above to resize)"
              className="block w-full resize-none rounded-lg bg-[var(--bg-elevated)] border border-glass px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>
          {streaming ? (
            <Button
              type="button"
              size="md"
              variant="ghost"
              onClick={handleCancel}
              className="h-10 w-10 p-0 border border-[var(--accent-danger)] text-[var(--accent-danger)] hover:bg-[color-mix(in_oklab,var(--accent-danger)_15%,transparent)]"
              aria-label="Cancel"
              title="Cancel this turn"
            >
              <X size={16} />
            </Button>
          ) : (
            <Button
              type="submit"
              size="md"
              disabled={!input.trim() || streaming}
              className="h-10 w-10 p-0"
              aria-label="Send"
            >
              <Send size={16} />
            </Button>
          )}
        </form>
      </aside>
      )}
    </>
  );
}
