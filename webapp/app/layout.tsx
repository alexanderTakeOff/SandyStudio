// ──────────────────────────────────────────────────────────────────────────────
// app/layout.tsx — root layout.
// Sets up fonts, theme provider, and the html/body shell.
// Auth is handled by middleware.ts + the (studio) route group.
// ──────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { AppearanceProvider } from '@/components/providers/AppearanceProvider';
import './globals.css';

// Self-hosted (next/font/local) instead of next/font/google: the build-time
// fetch of Inter / JetBrains Mono from Google Fonts kept timing out (ETIMEDOUT),
// making every deploy flaky. Variable woff2 (latin) live in app/fonts/ so the
// build never touches the network. Same CSS variables as before.
const inter = localFont({
  src: './fonts/Inter-Variable.woff2',
  variable: '--font-sans',
  display: 'swap',
  weight: '100 900',
});

const mono = localFont({
  src: './fonts/JetBrainsMono-Variable.woff2',
  variable: '--font-mono',
  display: 'swap',
  weight: '100 800',
});

export const metadata: Metadata = {
  title: 'SandyStudio — Production OS',
  description: 'AI animation studio control room.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="slate_blue_cinematic" data-ambient="on" suppressHydrationWarning>
      {/* suppressHydrationWarning on <body> — Grammarly and similar browser extensions
          inject data-* attributes after load, causing React hydration mismatches. */}
      <body className={`${inter.variable} ${mono.variable} antialiased`} suppressHydrationWarning>
        <AppearanceProvider>{children}</AppearanceProvider>
      </body>
    </html>
  );
}
