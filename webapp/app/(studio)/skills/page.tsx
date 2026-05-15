// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/skills/page.tsx
// Director-Skill canon editor. Sprint σ.3 (2026-05-15).
// Left rail = SkillList. Right pane = SkillEditor. Shares write path with the
// PA tools — single source of truth = .claude/skills/<slug>/SKILL.md.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/swr';
import { SkillList, type SkillSummary, type ScopeFilter } from '@/components/skills/SkillList';
import { SkillEditor, type LoadedSkillView } from '@/components/skills/SkillEditor';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { AppliesWhen, SkillStatus } from '@/lib/skills/load-skill-file';

interface ListEnvelope { success: boolean; data: SkillSummary[]; meta?: { total: number } }
interface OneEnvelope { success: boolean; data: LoadedSkillView }
interface ApiErr { success: false; error: string }

async function patchSkill(slug: string, patch: Record<string, unknown>): Promise<void> {
  const res = await fetch(`/api/skills/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as ApiErr;
    throw new Error(err.error ?? `PATCH failed (HTTP ${res.status})`);
  }
}

async function deleteSkill(slug: string): Promise<void> {
  const res = await fetch(`/api/skills/${encodeURIComponent(slug)}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as ApiErr;
    throw new Error(err.error ?? `DELETE failed (HTTP ${res.status})`);
  }
}

async function createSkill(body: Record<string, unknown>): Promise<{ slug: string }> {
  const res = await fetch('/api/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as ApiErr;
    throw new Error(err.error ?? `POST failed (HTTP ${res.status})`);
  }
  const env = (await res.json()) as { data: { slug: string } };
  return { slug: env.data.slug };
}

export default function SkillsPage() {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [newOpen, setNewOpen] = useState(false);

  const listRes = useSWR<ListEnvelope>('/api/skills', fetcher, { refreshInterval: 30_000 });
  const skills = listRes.data?.data ?? [];

  const detailKey = selectedSlug ? `/api/skills/${encodeURIComponent(selectedSlug)}` : null;
  const detail = useSWR<OneEnvelope>(detailKey, fetcher);

  const handleSave = useCallback(
    async (patch: { description?: string; body?: string; hard?: boolean; status?: SkillStatus; applies_when?: AppliesWhen }) => {
      if (!selectedSlug) return;
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) clean[k] = v;
      }
      await patchSkill(selectedSlug, clean);
      await Promise.all([listRes.mutate(), detail.mutate()]);
    },
    [selectedSlug, listRes, detail],
  );

  const handleDelete = useCallback(async () => {
    if (!selectedSlug) return;
    await deleteSkill(selectedSlug);
    setSelectedSlug(null);
    await listRes.mutate();
  }, [selectedSlug, listRes]);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <SkillList
        skills={skills}
        selectedSlug={selectedSlug}
        scope={scope}
        onScopeChange={setScope}
        onSelect={setSelectedSlug}
        onNew={() => setNewOpen(true)}
      />
      <SkillEditor
        skill={detail.data?.data ?? null}
        loading={!!detailKey && detail.isLoading}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      {newOpen && (
        <NewSkillModal
          onClose={() => setNewOpen(false)}
          onCreated={async (slug) => {
            setNewOpen(false);
            setSelectedSlug(slug);
            await listRes.mutate();
          }}
        />
      )}
    </div>
  );
}

interface NewSkillModalProps {
  onClose: () => void;
  onCreated: (slug: string) => Promise<void>;
}

function NewSkillModal({ onClose, onCreated }: NewSkillModalProps) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [hard, setHard] = useState(false);
  const [agent, setAgent] = useState('');
  const [genre, setGenre] = useState('');
  const [body, setBody] = useState('# Body\n\nDescribe when this skill applies, give a worked example, list anti-patterns.\n');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const applies_when: Record<string, string[]> = {};
      const a = agent.split(',').map((s) => s.trim()).filter(Boolean);
      const g = genre.split(',').map((s) => s.trim()).filter(Boolean);
      if (a.length) applies_when.agent = a;
      if (g.length) applies_when.genre = g;
      const payload: Record<string, unknown> = {
        slug,
        name,
        description,
        body,
        hard,
        status: 'DRAFT',
      };
      if (Object.keys(applies_when).length > 0) payload.applies_when = applies_when;
      const { slug: created } = await createSkill(payload);
      await onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'create failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New skill (DRAFT)" size="lg">
      <div className="space-y-3">
        {error && (
          <div className="text-xs px-3 py-2 rounded-md" style={{ background: 'var(--accent-danger)', color: 'white' }}>
            {error}
          </div>
        )}
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-text-muted">slug (kebab-case)</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="comedy-shot-must-carry-gag"
            className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-glass bg-transparent text-text-primary"
          />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-text-muted">name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-glass bg-transparent text-text-primary"
          />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-text-muted">description (used by selector for OpenAI tool description)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-glass bg-transparent text-text-primary"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-text-muted">applies_when.agent (CSV)</span>
            <input
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              placeholder="EXEC-SB"
              className="mt-1 w-full text-sm px-2 py-1 rounded-md border border-glass bg-transparent text-text-primary"
            />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-text-muted">applies_when.genre (CSV)</span>
            <input
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="comedy"
              className="mt-1 w-full text-sm px-2 py-1 rounded-md border border-glass bg-transparent text-text-primary"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input type="checkbox" checked={hard} onChange={(e) => setHard(e.target.checked)} />
          <span>HARD (acceptance criterion, not just hint)</span>
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-text-muted">body (markdown)</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-glass bg-transparent text-text-primary font-mono"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={submitting || slug.length < 3 || name.length < 3 || description.length < 10 || body.trim().length < 20}>
            {submitting ? 'Creating…' : 'Create DRAFT'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
