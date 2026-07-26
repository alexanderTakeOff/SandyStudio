// ──────────────────────────────────────────────────────────────────────────────
// components/settings/ChannelSettings.tsx
// Settings → Channels — channel passports (multi-channel.md §2, Phase 2).
// The UI manages the PASSPORT only; the credential itself is provisioned via
// the CLI consent flow and lives in env (YOUTUBE_REFRESH_TOKEN_<KEY>).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { Tv, Plus, Pencil } from 'lucide-react';
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
  metadata: Record<string, unknown> | null;
  has_token: boolean;
}

// Branding keys read by lib/agents/branding.ts (series → channel → neutral).
const BRANDING_FIELDS = [
  { key: 'short_overlay_text', label: 'Shorts overlay text', hint: 'Burned-in overlay on Shorts (fallback: channel name)' },
  { key: 'short_description', label: 'Shorts description', hint: 'Default description for Shorts uploads' },
  { key: 'short_tags', label: 'Shorts tags', hint: 'Comma-separated', isList: true },
  { key: 'subscribe_cta', label: 'Subscribe CTA', hint: 'Last line of long-form descriptions (EXEC-COPY)' },
  { key: 'long_description_boilerplate', label: 'Description boilerplate', hint: 'Standing line near the end of long-form descriptions (EXEC-COPY)' },
] as const;

function brandingOf(meta: Record<string, unknown> | null): Record<string, unknown> {
  const b = (meta ?? {})['branding'];
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

interface CreatedInfo {
  env_var: string;
  consent_command: string;
}

export function ChannelSettings() {
  const [channels, setChannels] = useState<ChannelRow[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(editingId === c.id ? null : c.id)}
                    title="Edit passport (name, ntfy, status, branding)"
                  >
                    <Pencil size={13} />
                  </Button>
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
              {editingId === c.id && (
                <ChannelEditPanel
                  channel={c}
                  onDone={() => { setEditingId(null); reload(); }}
                  onCancel={() => setEditingId(null)}
                />
              )}
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

// Phase 4c — the passport finally has a product writer: PATCH /api/channels/[id]
// (name / ntfy / status / metadata.branding). Empty branding field = key removed
// (falls back down the cascade), never an empty-string override.
function ChannelEditPanel({
  channel,
  onDone,
  onCancel,
}: {
  channel: ChannelRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const b = brandingOf(channel.metadata);
  const [name, setName] = useState(channel.name);
  const [ntfy, setNtfy] = useState(channel.ntfy_topic ?? '');
  const [status, setStatus] = useState(channel.status);
  const [branding, setBranding] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of BRANDING_FIELDS) {
      const v = b[f.key];
      init[f.key] = Array.isArray(v)
        ? v.filter((x): x is string => typeof x === 'string').join(', ')
        : typeof v === 'string'
        ? v
        : '';
    }
    return init;
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    const brandingPatch: Record<string, unknown> = {};
    for (const f of BRANDING_FIELDS) {
      const raw = branding[f.key]?.trim() ?? '';
      if (raw === '') {
        brandingPatch[f.key] = null; // delete → fall back down the cascade
      } else if ('isList' in f && f.isList) {
        brandingPatch[f.key] = raw.split(',').map((t) => t.trim()).filter(Boolean);
      } else {
        brandingPatch[f.key] = raw;
      }
    }
    const res = await fetch(`/api/channels/${channel.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: name.trim() || undefined,
        ntfy_topic: ntfy.trim() || null,
        status,
        branding: brandingPatch,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? `Save failed (${res.status})`);
      return;
    }
    onDone();
  }

  return (
    <div className="mt-3 rounded-lg border border-glass px-3 py-3 space-y-3" style={{ background: 'var(--bg-elevated)' }}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <FormField label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-9 px-3 rounded-lg bg-[var(--panel-glass-strong-bg)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
          />
        </FormField>
        <FormField label="ntfy topic">
          <input
            value={ntfy}
            onChange={(e) => setNtfy(e.target.value)}
            placeholder="empty = no push"
            className="w-full h-9 px-3 rounded-lg bg-[var(--panel-glass-strong-bg)] border border-glass text-sm font-mono text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
          />
        </FormField>
        <FormField label="Status" hint="Only ACTIVE channels are crawled by HoG crons">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full h-9 px-2.5 rounded-lg bg-[var(--panel-glass-strong-bg)] border border-glass text-sm text-text-primary"
          >
            {['ACTIVE', 'PAUSED', 'ARCHIVED'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="text-[11px] uppercase tracking-wider text-text-muted pt-1">
        Branding (channel defaults — a series can override each key)
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {BRANDING_FIELDS.map((f) => (
          <FormField key={f.key} label={f.label} hint={f.hint}>
            <input
              value={branding[f.key] ?? ''}
              onChange={(e) => setBranding((prev) => ({ ...prev, [f.key]: e.target.value }))}
              placeholder="empty = inherit / neutral"
              className="w-full h-9 px-3 rounded-lg bg-[var(--panel-glass-strong-bg)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </FormField>
        ))}
      </div>
      {error && (
        <div
          className="rounded-lg p-2.5 text-xs"
          style={{
            background: 'color-mix(in oklab, var(--accent-danger) 14%, transparent)',
            color: 'var(--accent-danger)',
          }}
        >
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
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
