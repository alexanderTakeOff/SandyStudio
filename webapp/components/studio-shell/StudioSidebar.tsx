// ──────────────────────────────────────────────────────────────────────────────
// components/studio-shell/StudioSidebar.tsx
// Persistent left navigation per uiux.md §8.3 — icon + label, quiet style,
// active section softly highlighted.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import {
  LayoutDashboard,
  Inbox,
  Folders,
  Film,
  DollarSign,
  Activity as ActivityIcon,
  ListChecks,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetcher } from '@/lib/swr';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

// Order reflects production workflow: Series (universe) → Episodes → Inbox →
// Budget → Jobs → Activity. Dashboard sits on top as the cockpit overview.
const NAV: NavItem[] = [
  { href: '/',          label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inbox',     label: 'Inbox',     icon: Inbox },
  { href: '/series',    label: 'Series',    icon: Folders },
  { href: '/episodes',  label: 'Episodes',  icon: Film },
  { href: '/budget',    label: 'Budget',    icon: DollarSign },
  { href: '/jobs',      label: 'Jobs',      icon: ListChecks },
  { href: '/activity',  label: 'Activity',  icon: ActivityIcon },
];

export function StudioSidebar() {
  const pathname = usePathname();

  // Inbox count badge — surfaces unresolved approval/decision/extension events
  // and REVIEW assets so Director sees pending work in the left rail without
  // navigating. Refreshes every 8s so it picks up new pipeline events.
  const { data: inboxRes } = useSWR<{ data: unknown[] }>(
    '/api/director/inbox?limit=50',
    fetcher,
    { refreshInterval: 8_000, revalidateOnFocus: true },
  );
  const inboxCount = inboxRes?.data?.length ?? 0;

  return (
    <aside className="relative z-20 hidden md:flex flex-col w-60 shrink-0 border-r border-glass bg-panel-glass backdrop-blur-md">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-glass">
        <Link href="/" className="flex items-center gap-2.5">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center font-bold text-[var(--text-inverse)]"
            style={{
              background: `linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))`,
            }}
          >
            S
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-text-primary">SandyStudio</div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Production OS</div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((item) => {
          const active =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                'hover:bg-[var(--panel-hover-bg)]',
                active
                  ? 'text-text-primary bg-[var(--panel-hover-bg)] border border-glass-active'
                  : 'text-text-secondary border border-transparent',
              )}
            >
              <Icon size={16} strokeWidth={1.7} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom — Settings */}
      <div className="px-3 pb-4 border-t border-glass pt-3">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
            'hover:bg-[var(--panel-hover-bg)]',
            pathname.startsWith('/settings')
              ? 'text-text-primary bg-[var(--panel-hover-bg)]'
              : 'text-text-secondary',
          )}
        >
          <Settings size={16} strokeWidth={1.7} />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
}
