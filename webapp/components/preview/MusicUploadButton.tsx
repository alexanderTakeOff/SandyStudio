// ──────────────────────────────────────────────────────────────────────────────
// components/preview/MusicUploadButton.tsx
//
// ОДНА кнопка загрузки трека на два входа: превью ассета `AUD-music`
// (`MGENActionsBlock`) и пустая станция музыки в конвейере
// (`StageWorkspacePanel`). Отличаются они только АДРЕСОМ роута — сам файл-инпут,
// проверка ответа и текст ошибки одинаковы, поэтому живут здесь, а не двумя
// копиями (иначе следующая правка ушла бы в одну из них).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface MusicUploadButtonProps {
  /** POST-адрес, принимающий multipart-поле `file`. */
  url: string;
  /** Позвать после успешной загрузки — перечитать данные вызывающей поверхности. */
  onDone: () => void;
  label?: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export function MusicUploadButton({
  url,
  onDone,
  label = 'Upload track',
  disabled = false,
  variant = 'primary',
}: MusicUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(url, { method: 'POST', body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Upload failed');
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant={variant}
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || busy}
      >
        {busy ? (
          <>
            <Loader2 size={12} className="animate-spin" /> Uploading…
          </>
        ) : (
          <>
            <Upload size={12} /> {label}
          </>
        )}
      </Button>
      {error && (
        <span className="text-[11px]" style={{ color: 'var(--accent-danger)' }}>
          {error}
        </span>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
          e.target.value = '';
        }}
      />
    </>
  );
}
