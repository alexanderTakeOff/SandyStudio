// ──────────────────────────────────────────────────────────────────────────────
// app/layout.tsx — root layout.
// Sets up fonts, theme provider, and the html/body shell.
// Auth is handled by middleware.ts + the (studio) route group.
// ──────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { AppearanceProvider } from '@/components/providers/AppearanceProvider';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
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
