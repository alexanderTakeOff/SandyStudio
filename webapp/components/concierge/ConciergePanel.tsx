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
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  MessageCircle, Mic, MicOff, Send, Volume2, VolumeX, X, Sparkles,
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
// is filtered. Keep agent_completed / agent_failed / approval_* /
// blocker_raised / decision_requested / input_requested visible so
// Director still sees signals that need a reaction.
const AMBIENT_CHAT_NOISE_EVENT_TYPES: ReadonlySet<string> = new Set([
  'manual_trigger',
  'agent_started',
]);
function isAmbientChatNoise(eventType: unknown): boolean {
  return (
    typeof eventType === 'string' &&
    AMBIENT_CHAT_NOISE_EVENT_TYPES.has(eventType)
  );
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
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
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

  // TD-20.A 2026-05-20 — AbortController for the in-flight chat request so
  // the Director can cancel a hanging turn. abortControllerRef holds the
  // current controller during streaming; null when no request is in flight.
  const abortControllerRef = useRef<AbortController | null>(null);

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
      const t = localStorage.getItem(THREAD_KEY);
      if (t) setThreadId(t);
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
      if (turn.role === 'assistant' && m.auto_react === true) {
        setMessages((prev) => {
          if (prev.some((p) => p.turnId === turn.id)) return prev;
          const awaiting = readAwaitingFromMetadata(m);
          return [
            ...prev,
            {
              role: 'assistant',
              content: turn.content,
              turnId: turn.id,
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

      setMessages((prev) => {
        // Dedupe by turnId in case of re-subscribe / strict-mode dupes.
        if (prev.some((p) => p.turnId === turn.id)) return prev;
        const next: Message = kind === 'claude_message'
          ? {
              role: 'claude',
              content: turn.content,
              turnId: turn.id,
              author: (m.author as string | undefined) ?? 'Claude',
            }
          : {
              role: 'pipeline',
              content: turn.content,
              turnId: turn.id,
              severity: (m.severity as 'info' | 'warning' | 'error' | undefined) ?? 'info',
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
        const { data, error } = await sb
          .from('concierge_turns')
          .select('id,role,content,metadata,created_at')
          .eq('thread_id', threadId)
          .in('role', ['system', 'assistant'])
          .order('created_at', { ascending: false })
          .limit(30);
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
        for (const t of [...rows].reverse()) {
          const meta = (t.metadata ?? {}) as Record<string, unknown>;
          // TD-20.B — auto-react assistant turn (server-authored by
          // chat-internal). Restore so reload doesn't lose Polina's
          // autonomous reactions.
          if (t.role === 'assistant' && meta.auto_react === true) {
            const awaiting = readAwaitingFromMetadata(meta);
            additions.push({
              role: 'assistant',
              content: t.content,
              turnId: t.id,
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
            });
          } else if (kind === 'pipeline_event') {
            // 2026-05-26 — drop redundant pipeline plashki here too.
            if (isAmbientChatNoise(meta.event_type)) continue;
            additions.push({
              role: 'pipeline',
              content: t.content,
              turnId: t.id,
              severity: (meta.severity as 'info' | 'warning' | 'error' | undefined) ?? 'info',
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
            const awaiting = readAwaitingFromMetadata(meta);
            additions.push({
              role: 'assistant',
              content: t.content,
              turnId: t.id,
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
            });
          } else if (kind === 'pipeline_event') {
            // 2026-05-26 — drop redundant pipeline plashki here too.
            if (isAmbientChatNoise(meta.event_type)) continue;
            additions.push({
              role: 'pipeline',
              content: t.content,
              turnId: t.id,
              severity: (meta.severity as 'info' | 'warning' | 'error' | undefined) ?? 'info',
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;

    const next: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setStreaming(true);
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

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
      const res = await fetch('/api/concierge/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: wireMessages,
          threadId: threadId ?? undefined,
        }),
        signal: controller.signal,
      });
      // Capture the persistent thread id from the response header.
      const newThreadId = res.headers.get('X-Concierge-Thread-Id');
      if (newThreadId && newThreadId !== threadId) {
        setThreadId(newThreadId);
        try { localStorage.setItem(THREAD_KEY, newThreadId); } catch { /* ignore */ }
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
              copy[copy.length - 1] = { role: 'assistant', content: acc };
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
                copy[copy.length - 1] = { role: 'assistant', content: acc };
                return copy;
              });
            }
          } else if (t === 'tool_start') {
            const id = typeof event.id === 'string' ? event.id : '';
            const name = typeof event.name === 'string' ? event.name : 'tool';
            setToolPlashka({ id, name, startedAt: Date.now() });
          } else if (t === 'tool_result' || t === 'tool_timeout') {
            setToolPlashka(null);
            // Annotate the assistant bubble with a compact chip so the
            // Director can see what just ran even after the plashka clears.
            // 2026-05-26: render as muted aside ("…Polina thinking · ✓ name")
            // rather than a loud bullet — Director called these visually
            // dominant. Italic markdown renders subdued in prose-invert.
            const name = typeof event.name === 'string' ? event.name : 'tool';
            const ok = t === 'tool_result' ? Boolean(event.ok) : false;
            const chip =
              t === 'tool_timeout'
                ? `\n_…Polina thinking · ⏱ ${name} timed out_\n`
                : ok
                  ? `\n_…Polina thinking · ✓ ${name}_\n`
                  : `\n_…Polina thinking · ✗ ${name}_\n`;
            acc += chip;
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: 'assistant', content: acc };
              return copy;
            });
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
    }
  }

  // TD-20.A — cancel the in-flight turn. Aborting the fetch triggers
  // AbortError on the reader loop AND closes the server-side request,
  // which propagates as req.signal.aborted in the chat route → the
  // server emits {"t":"cancelled"} then closes.
  function handleCancel() {
    abortControllerRef.current?.abort();
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
              <div className="text-[10px] uppercase tracking-wider text-text-muted">EXEC-CONC · Mode 2.5 Phase 1</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
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
            if (m.role === 'user') {
              return (
                <div
                  key={key}
                  className="rounded-xl px-3 py-2 text-sm bg-[var(--accent-primary)] text-[var(--text-inverse)] ml-8"
                >
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              );
            }
            if (m.role === 'assistant') {
              return (
                <div key={key} className="mr-8 flex flex-col gap-1.5">
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
                  <div className="rounded-xl px-3 py-2 text-sm bg-panel-glass border border-glass text-text-primary">
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{withHardBreaks(m.content) || '…'}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            }
            if (m.role === 'claude') {
              return (
                <div
                  key={key}
                  className="rounded-xl px-3 py-2 text-sm border mr-8"
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
              );
            }
            // role === 'pipeline'
            const accent =
              m.severity === 'error'
                ? 'var(--accent-danger)'
                : m.severity === 'warning'
                  ? 'var(--accent-warning)'
                  : 'var(--text-muted)';
            return (
              <div
                key={key}
                className="rounded-md px-2 py-1 text-[11px] font-mono mx-2"
                style={{
                  background: 'color-mix(in oklab, currentColor 4%, transparent)',
                  color: accent,
                  borderLeft: `2px solid ${accent}`,
                }}
                title="Pipeline event"
              >
                {m.content}
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
          {/* TD-20.A — Generic streaming hint when no tool plashka is active. */}
          {streaming && !toolPlashka && (
            <div className="text-xs text-text-muted px-2 italic flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] animate-pulse" />
              Polina is thinking…
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
