import type { Config } from 'tailwindcss';

// Theme tokens are defined as CSS variables in app/globals.css per uiux.md §6.5.
// Tailwind here only consumes those tokens via `var(--token)` references.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'var(--bg-base)',
          elevated: 'var(--bg-elevated)',
          soft: 'var(--bg-soft)',
        },
        panel: {
          glass: 'var(--panel-glass-bg)',
          'glass-strong': 'var(--panel-glass-bg-strong)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        accent: {
          primary: 'var(--accent-primary)',
          secondary: 'var(--accent-secondary)',
          success: 'var(--accent-success)',
          warning: 'var(--accent-warning)',
          danger: 'var(--accent-danger)',
        },
      },
      borderColor: {
        glass: 'var(--panel-glass-border)',
        'glass-active': 'var(--panel-glass-border-active)',
      },
      backdropBlur: {
        glass: 'var(--panel-glass-blur)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
