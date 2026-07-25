// ──────────────────────────────────────────────────────────────────────────────
// components/settings/ChannelSettings.tsx
// Settings → Channels — channel passports (multi-channel.md §2, Phase 2).
// The UI manages the PASSPORT only; the credential itself is provisioned via
// the CLI consent flow and lives in env (YOUTUBE_REFRESH_TOKEN_<KEY>).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { Tv, Plus } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PeekHint } from '@/components/ui/PeekHint';

interface ChannelRow {
  id: string;
  name: string;
  youtube_channel_id: string;
  credential_key: string;
  ntfy_topic: string | null;
  status: string;
  has_token: boolean;
}

interface CreatedInfo {
  env_var: string;
  consent_command: string;
}

export function ChannelSettings() {
  const [channels, setChannels] = useState<ChannelRow[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [ytId, setYtId] = useState('');
  const [key, setKey] = useState('');
  const [ntfy, setNtfy] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedInfo | null>(null);

  function reload() {
    fetch('/api/channels')
      .then((r) => r.json())
      .then((j: { data?: ChannelRow[] }) => setChannels(j.data ?? []))
      .catch(() => setChannels([]));
  }
  useEffect(reload, []);

  const valid =
    name.trim().length > 0 &&
    /^UC[0-9A-Za-z_-]{22}$/.test(ytId.trim()) &&
    /^[A-Z][A-Z0-9_]*$/.test(key.trim());

  async function submit() {
    setPending(true);
    setError(null);
    const res = await fetch('/api/channels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        youtube_channel_id: ytId.trim(),
        credential_key: key.trim(),
        ntfy_topic: ntfy.trim() || undefined,
      }),
    });
    setPending(false);
    const j = (await res.json().catch(() => ({}))) as {
      error?: string;
      data?: CreatedInfo;
    };
    if (!res.ok) {
      setError(j.error ?? 'Channel creation failed');
      return;
    }
    setCreated(j.data ?? null);
    setFormOpen(false);
    setName('');
    setYtId('');
    setKey('');
    setNtfy('');
    reload();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <CardTitle>Channels</CardTitle>
            <PeekHint autoPeekMs={3500}>
              YouTube channel passports. A series publishes only through its attached
              channel; the token itself is provisioned via the CLI consent flow, never here.
            </PeekHint>
          </div>
          {!formOpen && (
            <Button variant="ghost" size="sm" onClick={() => { setFormOpen(true); setCreated(null); }}>
              <Plus size={14} /> New channel
            </Button>
          )}
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-3">
          {channels === null && <p className="text-sm text-text-muted">Loading…</p>}
          {channels?.map((c) => (
            <div key={c.id} className="rounded-lg border border-glass bg-panel-glass-strong px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                  <Tv size={14} />
                  {c.name}
                  <StatusChip status={c.status} />
                  <TokenChip hasToken={c.has_token} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-text-muted">{c.credential_key}</span>
                  {/* Full-page navigation (not fetch): the route 302s to Google's
                      consent screen; the callback verifies the picked account
                      against the passport BEFORE saving the token. */}
                  <Button
                    variant={c.has_token ? 'ghost' : 'primary'}
                    size="sm"
                    onClick={() => { window.location.href = `/api/channels/${c.id}/consent`; }}
                  >
                    {c.has_token ? 'Re-authorize' : 'Authorize'}
                  </Button>
                </div>
              </div>
              <div className="mt-1.5 text-xs font-mono text-text-secondary">{c.youtube_channel_id}</div>
              <div className="mt-1 text-[11px] text-text-muted flex flex-wrap gap-3">
                <span>token env: <span className="font-mono">YOUTUBE_REFRESH_TOKEN_{c.credential_key}</span></span>
                {c.ntfy_topic && <span>ntfy: <span className="font-mono">{c.ntfy_topic}</span></span>}
              </div>
            </div>
          ))}
          {channels?.length === 0 && (
            <p className="text-sm text-text-muted">No channels yet.</p>
          )}

          {created && (
            <div
              className="rounded-lg p-3 text-xs space-y-1"
              style={{
                background: 'color-mix(in oklab, var(--accent-success) 12%, transparent)',
                color: 'var(--text-secondary)',
              }}
            >
              <div className="font-medium text-text-primary">Channel created. One step remains:</div>
              <div>
                Нажми <b>Authorize</b> у нового канала и выбери его бренд-аккаунт на консент-экране.
                Токен сам ляжет в <span className="font-mono">{created.env_var}</span> — рестарт не нужен.
              </div>
              <div className="text-text-muted">
                CLI-запасной путь: <span className="font-mono">{created.consent_command}</span>
              </div>
            </div>
          )}

          {formOpen && (
            <div className="rounded-lg border border-glass px-4 py-3 space-y-3">
              <FormField label="Channel name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sandy the Hourglass"
                  className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </FormField>
              <FormField
                label="YouTube channel id"
                hint="UC…, 24 chars — YouTube Studio → Settings → Channel → Advanced"
              >
                <input
                  value={ytId}
                  onChange={(e) => setYtId(e.target.value.trim())}
                  placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </FormField>
              <FormField
                label="Credential key"
                hint="UPPER_SNAKE — names the env token YOUTUBE_REFRESH_TOKEN_<KEY>"
              >
                <input
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase())}
                  placeholder="e.g. STAPLER"
                  className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </FormField>
              <FormField label="ntfy topic (optional)" hint="Push topic for this channel's HoG daily reports">
                <input
                  value={ntfy}
                  onChange={(e) => setNtfy(e.target.value)}
                  placeholder="e.g. sandystudio-hog-xxxxx"
                  className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm font-mono text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </FormField>

              {error && (
                <div
                  className="rounded-lg p-3 text-xs"
                  style={{
                    background: 'color-mix(in oklab, var(--accent-danger) 14%, transparent)',
                    color: 'var(--accent-danger)',
                  }}
                >
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={submit} disabled={!valid || pending}>
                  {pending ? 'Creating…' : 'Create channel'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function TokenChip({ hasToken }: { hasToken: boolean }) {
  const color = hasToken ? 'var(--accent-success)' : 'var(--accent-warning)';
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded uppercase tracking-wider text-[10px] font-semibold"
      style={{
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
        color,
      }}
      title={hasToken ? 'Env token present for this credential key' : 'No env token — publish/analytics will HALT'}
    >
      {hasToken ? 'token ✓' : 'no token'}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const color =
    status === 'ACTIVE'
      ? 'var(--accent-success)'
      : status === 'PAUSED'
      ? 'var(--accent-info)'
      : 'var(--text-muted)';
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded uppercase tracking-wider text-[10px] font-semibold"
      style={{
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
        color,
      }}
    >
      {status.toLowerCase()}
    </span>
  );
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-text-muted">{hint}</p>}
    </div>
  );
}
