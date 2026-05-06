// ──────────────────────────────────────────────────────────────────────────────
// components/concierge/ConciergePanel.tsx
// Studio Concierge UI per agents/exec/concierge.md §3.1 — floating button
// bottom-right that expands into a right-side chat. Sprint 9 = chat-skeleton
// only; tools and Inngest dispatch land in Sprint 10.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageCircle, Mic, MicOff, Send, X, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const STORAGE_KEY = 'sandystudio.concierge.history';
const MAX_HISTORY_TURNS = 20;

// Web Speech API typing — minimal, broadly compatible.
interface SpeechRec extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}
type SpeechRecCtor = new () => SpeechRec;
function getSpeechRecognition(): SpeechRecCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function ConciergePanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRec | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hydrate history from sessionStorage.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Persist history.
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY_TURNS * 2)));
    } catch { /* storage may be disabled */ }
  }, [messages]);

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
        body: JSON.stringify({ messages: next }),
      });
      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      // Stream is plain UTF-8 text chunks (no SSE framing in v1).
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
    } catch (err) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: 'assistant',
          content:
            '⚠️ Concierge is offline. Likely missing `ANTHROPIC_API_KEY` in `.env.local` or the API route errored.',
        };
        return copy;
      });
      // eslint-disable-next-line no-console
      console.error('[concierge]', err);
    } finally {
      setStreaming(false);
    }
  }

  function toggleVoice() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      alert('Voice input unavailable in this browser. Use Chrome or Edge.');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new Ctor();
    // Auto-detect from browser locale — works in Chrome/Edge for ru-RU, en-US,
    // es-ES, etc. Director's browser language drives recognition language.
    // Falls back to en-US when navigator.language is unavailable.
    rec.lang =
      (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setInput(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <>
      {/* Floating trigger */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Concierge"
          className={cn(
            'fixed bottom-5 right-5 z-30 h-14 w-14 rounded-full shadow-[var(--panel-shadow)]',
            'flex items-center justify-center text-[var(--text-inverse)]',
            'transition-transform hover:scale-105 active:scale-95',
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
          'fixed top-0 right-0 z-40 h-screen w-[420px] max-w-[100vw] flex flex-col',
          'bg-panel-glass-strong border-l border-glass backdrop-blur-md shadow-[var(--panel-shadow)]',
          'transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{ backdropFilter: 'blur(var(--panel-glass-blur))' }}
      >
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
              <div className="text-sm font-semibold text-text-primary">Studio Concierge</div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted">EXEC-CONC · v0.1</div>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="h-8 w-8 rounded-md text-text-secondary hover:bg-[var(--panel-hover-bg)] hover:text-text-primary flex items-center justify-center"
          >
            <X size={16} />
          </button>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-sm text-text-secondary leading-relaxed">
              <p className="mb-2">Hi. Ask me anything about the studio.</p>
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
            placeholder="Ask the Concierge…"
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
