// ──────────────────────────────────────────────────────────────────────────────
// components/skills/SkillEditor.tsx
// Right pane for /skills — markdown body editor + frontmatter form.
// Save / Approve / Deprecate / Delete buttons. Sprint σ.3.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState, useMemo } from 'react';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { SkillFrontmatter, AppliesWhen, SkillStatus } from '@/lib/skills/load-skill-file';

export interface LoadedSkillView {
  slug: string;
  frontmatter: SkillFrontmatter;
  body: string;
  filePath: string;
}

interface SkillEditorProps {
  skill: LoadedSkillView | null;
  loading: boolean;
  onSave: (patch: { description?: string; body?: string; hard?: boolean; status?: SkillStatus; applies_when?: AppliesWhen }) => Promise<void>;
  onDelete: () => Promise<void>;
}

const SCOPE_FIELDS: Array<keyof AppliesWhen> = [
  'agent', 'genre', 'series_id', 'episode_id', 'gate', 'file_type',
];

function appliesToCsv(a: AppliesWhen | undefined, field: keyof AppliesWhen): string {
  const arr = a?.[field];
  return arr && arr.length > 0 ? arr.join(', ') : '';
}

function csvToArr(value: string): string[] {
  return value.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
}

export function SkillEditor({ skill, loading, onSave, onDelete }: SkillEditorProps) {
  const [body, setBody] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [hard, setHard] = useState<boolean>(false);
  const [status, setStatus] = useState<SkillStatus>('DRAFT');
  const [scope, setScope] = useState<Record<keyof AppliesWhen, string>>({
    agent: '', genre: '', series_id: '', episode_id: '', gate: '', file_type: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!skill) return;
    setBody(skill.body);
    setDescription(skill.frontmatter.description);
    setHard(skill.frontmatter.hard);
    setStatus(skill.frontmatter.status);
    const a = skill.frontmatter.applies_when;
    setScope({
      agent:      appliesToCsv(a, 'agent'),
      genre:      appliesToCsv(a, 'genre'),
      series_id:  appliesToCsv(a, 'series_id'),
      episode_id: appliesToCsv(a, 'episode_id'),
      gate:       appliesToCsv(a, 'gate'),
      file_type:  appliesToCsv(a, 'file_type'),
    });
    setError(null);
  }, [skill?.slug, skill?.frontmatter.status]);

  const dirty = useMemo(() => {
    if (!skill) return false;
    if (body !== skill.body) return true;
    if (description !== skill.frontmatter.description) return true;
    if (hard !== skill.frontmatter.hard) return true;
    if (status !== skill.frontmatter.status) return true;
    const a = skill.frontmatter.applies_when;
    for (const f of SCOPE_FIELDS) {
      if (scope[f] !== appliesToCsv(a, f)) return true;
    }
    return false;
  }, [skill, body, description, hard, status, scope]);

  const buildAppliesWhen = (): AppliesWhen | undefined => {
    const out: Record<string, string[]> = {};
    for (const f of SCOPE_FIELDS) {
      const arr = csvToArr(scope[f]);
      if (arr.length > 0) out[f] = arr;
    }
    return Object.keys(out).length > 0 ? (out as unknown as AppliesWhen) : undefined;
  };

  const save = async (overrideStatus?: SkillStatus) => {
    if (!skill) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        description: description !== skill.frontmatter.description ? description : undefined,
        body: body !== skill.body ? body : undefined,
        hard: hard !== skill.frontmatter.hard ? hard : undefined,
        status: overrideStatus ?? (status !== skill.frontmatter.status ? status : undefined),
        applies_when: buildAppliesWhen(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-sm text-text-muted">Loading…</div>;
  }
  if (!skill) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
        Select a skill from the left rail, or click <span className="px-1.5">+ New</span> to author one.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-glass flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-base font-semibold text-text-primary truncate">{skill.slug}</h1>
            <Badge cssVar={status === 'ACTIVE' ? '--accent-success' : status === 'DRAFT' ? '--accent-warning' : '--text-muted'} className="text-[10px]">
              {status}
            </Badge>
            {hard && <Badge cssVar="--accent-danger" className="text-[10px]">HARD</Badge>}
          </div>
          <div className="text-[11px] text-text-muted truncate" title={skill.filePath}>
            {skill.filePath}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {status === 'DRAFT' && (
            <Button
              type="button"
              variant="primary"
              onClick={() => save('ACTIVE')}
              disabled={saving}
            >
              Approve → ACTIVE
            </Button>
          )}
          {status === 'ACTIVE' && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => save('DEPRECATED')}
              disabled={saving}
            >
              Deprecate
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            onClick={() => save()}
            disabled={!dirty || saving}
          >
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (confirm(`Delete skill "${skill.slug}"? This removes the file from .claude/skills/ on disk.`)) {
                void onDelete();
              }
            }}
            disabled={saving}
          >
            Delete
          </Button>
        </div>
      </div>

      {error && (
        <div
          className="px-6 py-2 text-xs border-b border-glass"
          style={{ color: 'var(--accent-danger)' }}
        >
          {error}
        </div>
      )}

      {/* Form + editor */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        <section className="space-y-2">
          <label className="block text-[11px] uppercase tracking-wider text-text-muted">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full text-sm px-3 py-2 rounded-md border border-glass bg-transparent text-text-primary focus:border-glass-active focus:outline-none"
          />
        </section>

        <section className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={hard}
              onChange={(e) => setHard(e.target.checked)}
              className="rounded border-glass"
            />
            <span>HARD (acceptance criterion, not just hint)</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <span className="text-[11px] uppercase tracking-wider text-text-muted">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as SkillStatus)}
              className="text-sm px-2 py-1 rounded-md border border-glass bg-transparent text-text-primary"
            >
              <option value="DRAFT">DRAFT</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="DEPRECATED">DEPRECATED</option>
            </select>
          </label>
        </section>

        <section className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-text-muted">applies_when (CSV of values, blank = applies broadly)</div>
          <div className="grid grid-cols-2 gap-2">
            {SCOPE_FIELDS.map((f) => (
              <label key={f} className="flex flex-col gap-1">
                <span className="text-[11px] text-text-secondary">{f}</span>
                <input
                  value={scope[f]}
                  onChange={(e) => setScope((prev) => ({ ...prev, [f]: e.target.value }))}
                  placeholder={
                    f === 'agent' ? 'EXEC-SB, EXEC-SW'
                    : f === 'genre' ? 'comedy'
                    : ''
                  }
                  className="text-sm px-2 py-1 rounded-md border border-glass bg-transparent text-text-primary focus:border-glass-active focus:outline-none"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-text-muted">Body (markdown)</div>
          <div className="rounded-md border border-glass overflow-hidden">
            <MarkdownEditor value={body} onChange={setBody} height={520} />
          </div>
        </section>
      </div>
    </div>
  );
}
