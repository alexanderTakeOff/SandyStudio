// ──────────────────────────────────────────────────────────────────────────────
// components/editor/MarkdownEditor.tsx
// CodeMirror 6 wrapper for editing markdown / prompt files.
//
// Phase 5d step 2: simple — no preview pane, no autocomplete on character
// names, no template helpers. The "smart editor" Phase 5d+ adds those on top
// of this same primitive.
//
// Reasoning behind CodeMirror 6 over @uiw/react-md-editor (split-pane preview):
//   - 60kb modular vs ~100kb monolithic
//   - First-class platform for adding prompt-template autocomplete later
//   - Works well with prompt YAML/JSON blocks via lang-markdown's nested code
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';

export interface MarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  /** Pixel height of the editor body. Default 420. */
  height?: number;
  /** Read-only mode — preview without editing. */
  readOnly?: boolean;
  /** Force theme regardless of system dark mode. */
  theme?: 'dark' | 'light';
}

const editorTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    fontFamily:
      'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace',
    background: 'transparent',
  },
  '.cm-scroller': {
    fontFamily:
      'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace',
  },
  '.cm-gutters': {
    background: 'transparent',
    borderRight: '1px solid var(--border-glass)',
  },
  '.cm-content': {
    padding: '12px 0',
  },
  '.cm-line': {
    padding: '0 12px',
  },
});

export function MarkdownEditor({
  value,
  onChange,
  height = 420,
  readOnly = false,
  theme = 'dark',
}: MarkdownEditorProps) {
  return (
    <div
      className="rounded-lg border border-glass overflow-hidden"
      style={{ background: 'var(--bg-elevated)' }}
    >
      <CodeMirror
        value={value}
        height={`${height}px`}
        theme={theme === 'dark' ? oneDark : undefined}
        extensions={[markdown(), editorTheme]}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
        }}
        onChange={(next) => onChange(next)}
      />
    </div>
  );
}
