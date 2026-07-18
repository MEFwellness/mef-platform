'use client';

/**
 * Primary navigation. Every first-class member surface gets a permanent
 * slot: Home, Today, Movement, Food Lens, Progress, and Root, with
 * Check-In as the large centered action between the two halves. Root's
 * tab (linking to the full /conversation page) is additive to the
 * floating "Ask Root" launcher, not a replacement for it — the launcher
 * stays for quick, in-context questions from any screen, this tab is
 * Root's own home.
 *
 * Correction: an earlier pass trimmed this bar down to 5 slots and moved
 * Movement and Food Lens onto Dashboard quick-access cards instead. That
 * demoted two flagship, frequently-used dashboards behind an extra tap
 * (Home, then a card) without being asked to — this restores both to the
 * bar itself so every primary feature stays one tap away, which is the
 * navigation philosophy the rest of this app follows (nothing a member
 * reaches for daily should require a detour through another page first).
 *
 * Mobile alignment: two independent `flex-1` halves (left items, right
 * items) with the Check-In button as a fixed-width sibling between them,
 * so Check-In's midpoint always lands on the bar's exact horizontal
 * center regardless of viewport width or how many items sit in the
 * coach-only left half. Left/right are balanced 3-and-3 for a member
 * (Home/Today/Movement, Food Lens/Progress/Root) — the same item count
 * per half this app already shipped and validated for coaches before
 * Root existed (3 member items + Coach on the left, 3 on the right).
 *
 * Brand color discipline: inactive items read in muted gray; the active
 * item gets a soft gold pill behind the icon while its text/icon stay
 * dark green for contrast.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import {
  Home,
  Sparkles,
  Plus,
  BarChart2,
  Users,
  Sprout,
  Activity,
  UtensilsCrossed,
} from 'lucide-react';

type NavItem = { label: string; href: string; Icon: typeof Home };

const LEFT_ITEMS: NavItem[] = [
  { label: 'Home', href: '/dashboard', Icon: Home },
  { label: 'Today', href: '/today', Icon: Sparkles },
  { label: 'Movement', href: '/movement', Icon: Activity },
];

const RIGHT_ITEMS: NavItem[] = [
  { label: 'Food Lens', href: '/food-lens', Icon: UtensilsCrossed },
  { label: 'Progress', href: '/progress', Icon: BarChart2 },
  { label: 'Root', href: '/conversation', Icon: Sprout },
];

const CHECK_IN_HREF = '/checkin';

/** Appended after Movement for coach accounts only — kept on the left half so it sits next to the member tabs it supplements rather than crowding the right half. */
const COACH_NAV_ITEM: NavItem = { label: 'Coach', href: '/coach', Icon: Users };

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.Icon;
  return (
    <Link
      href={item.href as Route}
      aria-current={active ? 'page' : undefined}
      className={`flex min-w-0 min-h-[52px] flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-2.5 text-center text-[9px] font-bold uppercase leading-[1.05] tracking-tight transition-colors md:min-h-0 md:gap-2 md:px-4 md:py-3 md:text-[11px] md:leading-normal md:tracking-wide ${
        active
          ? 'bg-[#F5B700]/[0.16] text-[#1B3A2D]'
          : 'text-[#6B7A72] hover:bg-[#1B3A2D]/[0.04] hover:text-[#1B3A2D]'
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
      {/* `truncate` (not just `whitespace-nowrap`) so a long label on a
          narrow phone clips with an ellipsis inside its own grid column
          instead of overflowing, unclipped, into the next tab's label —
          the bug that made e.g. "Food Lens" and "Progress" visually run
          together at 320-390px widths once the bar grew from 5 to 6
          member-facing tabs. `w-full` gives the span the grid column's
          actual width to truncate against (a flex child otherwise sizes
          to its own content, which defeats truncation). */}
      <span className="w-full truncate">{item.label}</span>
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
