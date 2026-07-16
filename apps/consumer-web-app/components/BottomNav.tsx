'use client';

/**
 * Premium Product Pass: Check-In is now the visually dominant center
 * action (a larger, elevated gold circle) since it's the single highest-
 * value daily action; the standalone "Coaching" tab is gone entirely
 * since the floating "Ask Root" launcher (FloatingCoachLauncher.tsx)
 * already reaches the same conversation from every screen, making a
 * dedicated nav slot for it redundant. Inactive items use the app's
 * existing gold label color (#854D0E, the same color every card eyebrow
 * label already uses at full strength) instead of a faint gray, so the
 * bar reads as confidently branded rather than washed out; the active
 * page stays the signature MEF green.
 *
 * Mobile alignment fix: the bar is two independent `flex-1` halves (left
 * items, right items) with the Check-In button as a fixed-width sibling
 * between them — since both halves always get an equal share of the
 * remaining width regardless of how many items each holds (2 vs 3 for a
 * member, 3 vs 3 for a coach), Check-In's midpoint lands on the bar's
 * exact horizontal center at any viewport width, with no fixed-pixel
 * positioning. Within each half, items sit in a CSS grid with one equal-
 * width column per item so the gaps between them are always identical,
 * which is what `justify-around` could not guarantee once items of
 * different label lengths (e.g. "Today" vs "Assessments") sat either
 * side of a much larger, differently-shaped center button.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { Home, Sparkles, Plus, BarChart2, Users, User, ScanFace } from 'lucide-react';

type NavItem = { label: string; href: string; Icon: typeof Home };

const LEFT_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', Icon: Home },
  { label: 'Today', href: '/today', Icon: Sparkles },
];

const RIGHT_ITEMS: NavItem[] = [
  { label: 'Assessments', href: '/assessment', Icon: ScanFace },
  { label: 'Progress', href: '/progress', Icon: BarChart2 },
  { label: 'Profile', href: '/profile', Icon: User },
];

const CHECK_IN_HREF = '/checkin';

/** Between Today and the center Check-In button so a coach's extra tab keeps the bar visually balanced (3 items either side of center) instead of only ever growing the right-hand group. */
const COACH_NAV_ITEM: NavItem = { label: 'Coach', href: '/coach', Icon: Users };

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.Icon;
  return (
    <Link
      href={item.href as Route}
      className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-2 text-center text-[7.5px] font-bold uppercase leading-[1.05] tracking-tighter transition-colors min-[400px]:text-[8px] md:gap-2 md:px-4 md:py-3 md:text-[11px] md:leading-normal md:tracking-wide ${
        active
          ? 'text-[#1B3A2D]'
          : 'text-[#854D0E] hover:bg-[#1B3A2D]/[0.04] hover:text-[#6B380A]'
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
      <span className="max-w-full break-words [word-break:break-word] md:whitespace-nowrap">
        {item.label}
      </span>
    </Link>
  );
}

type Props = {
  /**
   * Whether the signed-in user actually holds the coach role — the "Coach"
   * tab (which leads to the coach-only /coach dashboard, middleware- and
   * RLS-gated) is only rendered for them. A member has no use for a link
   * that immediately redirects them away, so it's omitted entirely rather
   * than shown as a dead end. Defaults to false so any caller that forgets
   * to pass it gets the safe (member) nav, not an accidental coach link.
   */
  isCoach?: boolean;
};

export function BottomNav({ isCoach = false }: Props) {
  const pathname = usePathname();
  const leftItems = isCoach ? [...LEFT_ITEMS, COACH_NAV_ITEM] : LEFT_ITEMS;
  const checkInActive = pathname === CHECK_IN_HREF;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex items-center border-t border-[#1B3A2D]/10 bg-white/95 pt-2 backdrop-blur [padding-bottom:max(0.5rem,env(safe-area-inset-bottom))] md:inset-y-0 md:left-0 md:right-auto md:top-0 md:h-full md:w-24 md:flex-col md:justify-start md:gap-6 md:border-r md:border-t-0 md:px-0 md:py-10"
      aria-label="Primary"
    >
      {/*
       * `display: contents` on mobile-only wrapper purpose: the grid divs
       * give the left/right item groups equal-width columns among
       * themselves; `md:contents` removes the wrapper from the desktop
       * layout so each NavLink becomes a direct child of the vertical
       * sidebar stack again, unchanged from before.
       */}
      <div
        className="grid min-w-0 flex-1 items-start gap-0.5 px-1 md:contents"
        style={{ gridTemplateColumns: `repeat(${leftItems.length}, minmax(0, 1fr))` }}
      >
        {leftItems.map((item) => (
          <NavLink key={item.label} item={item} active={pathname === item.href} />
        ))}
      </div>

      <Link
        href={CHECK_IN_HREF as Route}
        aria-label="Check In"
        className="flex shrink-0 flex-col items-center gap-1.5 px-2 -mt-7 md:mt-0 md:gap-2"
      >
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-full bg-[#F5B700] text-[#1B3A2D] shadow-[0_10px_24px_-6px_rgba(245,183,0,0.55)] transition-transform ${
            checkInActive ? 'scale-105 ring-4 ring-[#1B3A2D]/15' : 'hover:scale-105'
          }`}
        >
          <Plus className="h-7 w-7" strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#1B3A2D] md:text-[11px]">
          Check-In
        </span>
      </Link>

      <div
        className="grid min-w-0 flex-1 items-start gap-0.5 px-1 md:contents"
        style={{ gridTemplateColumns: `repeat(${RIGHT_ITEMS.length}, minmax(0, 1fr))` }}
      >
        {RIGHT_ITEMS.map((item) => (
          <NavLink key={item.label} item={item} active={pathname === item.href} />
        ))}
      </div>
    </nav>
  );
}
