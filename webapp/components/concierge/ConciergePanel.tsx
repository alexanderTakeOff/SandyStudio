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

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  MessageCircle, Mic, MicOff, Send, Volume2, VolumeX, X, Sparkles,
  PanelLeftClose, PanelRightClose,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const STORAGE_KEY = 'sandystudio.prodassistant.history';
const THREAD_KEY = 'sandystudio.prodassistant.threadId';
const TTS_KEY = 'sandystudio.prodassistant.ttsEnabled';
const SIDE_KEY = 'sandystudio.prodassistant.side';
const WIDTH_KEY = 'sandystudio.prodassistant.width';
const MAX_HISTORY_TURNS = 20;

/** Silence tolerance for continuous mic. Director wanted ≥5s for thinking pauses. */
const MIC_SILENCE_TIMEOUT_MS = 5500;

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
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [side, setSide] = useState<'left' | 'right'>('right');
  const [panelWidth, setPanelWidth] = useState<number>(420);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRec | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
      const s = localStorage.getItem(SIDE_KEY);
      if (s === 'left' || s === 'right') setSide(s);
    } catch { /* ignore */ }
    try {
      const w = parseInt(localStorage.getItem(WIDTH_KEY) ?? '', 10);
      if (Number.isFinite(w) && w >= 320 && w <= 900) setPanelWidth(w);
    } catch { /* ignore */ }
  }, []);

  // Persist panel side / width.
  useEffect(() => {
    try { localStorage.setItem(SIDE_KEY, side); } catch { /* ignore */ }
  }, [side]);
  useEffect(() => {
    try { localStorage.setItem(WIDTH_KEY, String(panelWidth)); } catch { /* ignore */ }
  }, [panelWidth]);

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
      const res = await fetch('/api/concierge/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          threadId: threadId ?? undefined,
        }),
      });
      // Capture the persistent thread id from the response header.
      const newThreadId = res.headers.get('X-Concierge-Thread-Id');
      if (newThreadId && newThreadId !== threadId) {
        setThreadId(newThreadId);
        try { localStorage.setItem(THREAD_KEY, newThreadId); } catch { /* ignore */ }
      }
      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: acc };
          return copy;
        });
      }
      // Speak the final reply once the stream closes.
      if (ttsEnabled && acc.trim()) {
        speakText(acc);
      }
    } catch (err) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: 'assistant',
          content:
            '⚠️ Prod Assistant is offline. Likely missing `OPENAI_API_KEY` in `.env.local` or the API route errored.',
        };
        return copy;
      });
      // eslint-disable-next-line no-console
      console.error('[prod-assistant]', err);
    } finally {
      setStreaming(false);
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
      {/* Floating trigger — anchored to the user-chosen side */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Prod Assistant"
          className={cn(
            'fixed bottom-5 z-30 h-14 w-14 rounded-full shadow-[var(--panel-shadow)]',
            'flex items-center justify-center text-[var(--text-inverse)]',
            'transition-transform hover:scale-105 active:scale-95',
            side === 'right' ? 'right-5' : 'left-5',
          )}
          style={{
            background: `linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))`,
          }}
        >
          <MessageCircle size={22} strokeWidth={2} />
        </button>
      )}

      {/* Panel */}
      <aside
        className={cn(
          'fixed top-0 z-40 h-screen max-w-[100vw] flex flex-col',
          'bg-panel-glass-strong backdrop-blur-md shadow-[var(--panel-shadow)]',
          'transition-transform duration-300 ease-out',
          side === 'right'
            ? 'right-0 border-l border-glass'
            : 'left-0 border-r border-glass',
          open
            ? 'translate-x-0'
            : side === 'right'
              ? 'translate-x-full'
              : '-translate-x-full',
        )}
        style={{
          backdropFilter: 'blur(var(--panel-glass-blur))',
          width: `${panelWidth}px`,
        }}
      >
        {/* Resize handle — drag horizontally to grow/shrink the panel. */}
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = panelWidth;
            const onMove = (mv: MouseEvent) => {
              const dx = mv.clientX - startX;
              const delta = side === 'right' ? -dx : dx;
              const w = Math.max(320, Math.min(900, startW + delta));
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
            side === 'right' ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2',
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
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                'rounded-xl px-3 py-2 text-sm',
                m.role === 'user'
                  ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)] ml-8'
                  : 'bg-panel-glass border border-glass text-text-primary mr-8',
              )}
            >
              {m.role === 'assistant' ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{m.content || '…'}</ReactMarkdown>
                </div>
              ) : (
                m.content
              )}
            </div>
          ))}
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
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as unknown as FormEvent);
              }
            }}
            rows={1}
            placeholder="Ask the Prod Assistant…"
            className="flex-1 resize-none rounded-lg bg-[var(--bg-elevated)] border border-glass px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[var(--accent-primary)] max-h-32"
          />
          <Button
            type="submit"
            size="md"
            disabled={!input.trim() || streaming}
            className="h-10 w-10 p-0"
            aria-label="Send"
          >
            <Send size={16} />
          </Button>
        </form>
      </aside>
    </>
  );
}
