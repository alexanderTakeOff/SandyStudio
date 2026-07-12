// ──────────────────────────────────────────────────────────────────────────────
// components/studio-shell/StudioSidebar.tsx
// Persistent left navigation per uiux.md §8.3 — icon + label, quiet style,
// active section softly highlighted.
//
// Collapse (added 2026-05-25 per Director directive):
//   - Hover over the brand block ("SandyStudio · Production OS") reveals a
//     small chevron toggle in the corner.
//   - Click → sidebar collapses to icon-only column (w-14). Labels hidden via
//     opacity + width, Inbox badge collapses to a tiny dot in the icon corner.
//   - State persisted in localStorage (`sandystudio.sidebar.collapsed`).
//   - Width animates so downstream flex children reflow smoothly.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  LayoutDashboard,
  Inbox,
  Folders,
  Film,
  DollarSign,
  BarChart3,
  Activity as ActivityIcon,
  ListChecks,
  BookOpen,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
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
  { href: '/audience',  label: 'Audience',  icon: BarChart3 },
  { href: '/jobs',      label: 'Jobs',      icon: ListChecks },
  { href: '/activity',  label: 'Activity',  icon: ActivityIcon },
  { href: '/skills',    label: 'Skills',    icon: BookOpen },
];

const COLLAPSED_KEY = 'sandystudio.sidebar.collapsed';

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(COLLAPSED_KEY) === '1';
}

export function StudioSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<boolean>(false);

  // Hydrate from localStorage once on client.
  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  // Persist + expose width as a CSS var so any future flex/grid sibling can
  // observe it for layout decisions (PA panel currently uses --pa-pad-*).
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch { /* ignore */ }
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty(
        '--sidebar-width',
        collapsed ? '3.5rem' : '15rem',
      );
    }
  }, [collapsed]);

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
    <aside
      className={cn(
        'group/sidebar relative z-20 hidden md:flex flex-col h-full shrink-0 border-r border-glass bg-panel-glass backdrop-blur-md',
        'transition-[width] duration-200 ease-out',
        collapsed ? 'w-14' : 'w-60',
      )}
      aria-label="Primary"
    >
      {/* Brand — hover reveals the collapse toggle. shrink-0 so it never
          scrolls away even if nav becomes very long (TD-54.1). */}
      <div className="group/brand relative shrink-0 border-b border-glass">
        <Link
          href="/"
          className={cn(
            'flex items-center gap-2.5 py-5 transition-[padding] duration-200',
            collapsed ? 'px-3 justify-center' : 'px-5',
          )}
        >
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center font-bold text-[var(--text-inverse)] shrink-0"
            style={{
              background: `linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))`,
            }}
          >
            S
          </div>
          <div
            className={cn(
              'leading-tight overflow-hidden transition-all duration-200',
              collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100',
            )}
          >
            <div className="text-sm font-semibold text-text-primary whitespace-nowrap">SandyStudio</div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted whitespace-nowrap">
              Production OS
            </div>
          </div>
        </Link>

        {/* Collapse toggle — only visible on hover over the brand block. */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'absolute top-1/2 -translate-y-1/2 z-10',
            'h-6 w-6 rounded-full flex items-center justify-center',
            'bg-[var(--panel-glass-strong-bg,rgba(20,22,30,0.75))] border border-glass backdrop-blur-md',
            'text-text-secondary hover:text-text-primary',
            'opacity-0 group-hover/brand:opacity-100 focus-visible:opacity-100',
            'transition-opacity duration-150',
            collapsed ? 'right-1' : 'right-2',
          )}
        >
          {collapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
        </button>
      </div>

      {/* Nav — independent overflow so the brand stays put and the
          surrounding shell never scrolls the sidebar away (TD-54.1). */}
      <nav className={cn('flex-1 overflow-y-auto py-4 space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
        {NAV.map((item) => {
          const active =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          const showBadge = item.href === '/inbox' && inboxCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'relative flex items-center gap-3 rounded-lg text-sm transition-colors',
                'hover:bg-[var(--panel-hover-bg)]',
                collapsed ? 'px-2 py-2 justify-center' : 'px-3 py-2',
                active
                  ? 'text-text-primary bg-[var(--panel-hover-bg)] border border-glass-active'
                  : 'text-text-secondary border border-transparent',
              )}
            >
              <Icon size={16} strokeWidth={1.7} className="shrink-0" />
              <span
                className={cn(
                  'truncate flex-1 transition-all duration-200',
                  collapsed ? 'w-0 opacity-0' : 'opacity-100',
                )}
              >
                {item.label}
              </span>
              {showBadge && !collapsed && (
                <span
                  className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-semibold rounded-full"
                  style={{
                    background: 'var(--accent-warning, rgb(251, 146, 60))',
                    color: 'var(--text-inverse, white)',
                  }}
                  title={`${inboxCount} pending item${inboxCount === 1 ? '' : 's'}`}
                >
                  {inboxCount > 99 ? '99+' : inboxCount}
                </span>
              )}
              {showBadge && collapsed && (
                <span
                  className="absolute top-1 right-1 h-2 w-2 rounded-full"
                  style={{ background: 'var(--accent-warning, rgb(251, 146, 60))' }}
                  title={`${inboxCount} pending item${inboxCount === 1 ? '' : 's'}`}
                  aria-label={`${inboxCount} pending`}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom — Settings. shrink-0 keeps it pinned below the scrollable nav. */}
      <div className={cn('shrink-0 pb-4 border-t border-glass pt-3', collapsed ? 'px-2' : 'px-3')}>
        <Link
          href="/settings"
          title={collapsed ? 'Settings' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg text-sm transition-colors',
            'hover:bg-[var(--panel-hover-bg)]',
            collapsed ? 'px-2 py-2 justify-center' : 'px-3 py-2',
            pathname.startsWith('/settings')
              ? 'text-text-primary bg-[var(--panel-hover-bg)]'
              : 'text-text-secondary',
          )}
        >
          <Settings size={16} strokeWidth={1.7} className="shrink-0" />
          <span
            className={cn(
              'transition-all duration-200',
              collapsed ? 'w-0 opacity-0 overflow-hidden' : 'opacity-100',
            )}
          >
            Settings
          </span>
        </Link>
      </div>
    </aside>
  );
}
