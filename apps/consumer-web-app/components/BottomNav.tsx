'use client';

/**
 * Premium Dashboard Experience milestone, part 1 — the 5-slot bar this
 * milestone specifies: Home, Today, Check-In (center), Progress, Root.
 * Root now gets its own permanent tab (linking to the full /conversation
 * page) rather than being reachable only through the floating "Ask Root"
 * launcher — the launcher stays for quick, in-context questions from any
 * screen, this tab is Root's own home. Movement and Food Lens — both full
 * dashboards in their own right — are no longer nav slots; they're reached
 * from their Dashboard quick-access cards instead (see
 * app/dashboard/page.tsx), the same "drill-down, not a permanent tab"
 * treatment Root Score and Assessments already had. This intentionally
 * restores the bar to the original 5-item design Premium UX Milestone 1
 * described but never actually shipped (Movement's arrival afterward had
 * widened it to 6).
 *
 * Mobile alignment: unchanged mechanics from Premium UX Milestone 1 — two
 * independent `flex-1` halves (left items, right items) with the Check-In
 * button as a fixed-width sibling between them, so Check-In's midpoint
 * always lands on the bar's exact horizontal center regardless of viewport
 * width or how many items sit in the coach-only left half. With exactly
 * two items per half for a member (Home/Today, Progress/Root), the two
 * halves are symmetric for the first time since Milestone 1's original
 * design — a coach's extra "Coach" tab still only affects the left half.
 *
 * Brand color discipline (Premium UX Milestone 3, unchanged): inactive
 * items read in muted gray; the active item gets a soft gold pill behind
 * the icon while its text/icon stay dark green for contrast.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { Home, Sparkles, Plus, BarChart2, Users, Sprout } from 'lucide-react';

type NavItem = { label: string; href: string; Icon: typeof Home };

const LEFT_ITEMS: NavItem[] = [
  { label: 'Home', href: '/dashboard', Icon: Home },
  { label: 'Today', href: '/today', Icon: Sparkles },
];

const RIGHT_ITEMS: NavItem[] = [
  { label: 'Progress', href: '/progress', Icon: BarChart2 },
  { label: 'Root', href: '/conversation', Icon: Sprout },
];

const CHECK_IN_HREF = '/checkin';

/** Appended after Today for coach accounts only — kept on the left half so it sits next to the member tabs it supplements rather than crowding the right half. */
const COACH_NAV_ITEM: NavItem = { label: 'Coach', href: '/coach', Icon: Users };

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.Icon;
  return (
    <Link
      href={item.href as Route}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 text-center text-[10px] font-bold uppercase leading-[1.05] tracking-tight transition-colors md:min-h-0 md:gap-2 md:px-4 md:py-3 md:text-[11px] md:leading-normal md:tracking-wide ${
        active
          ? 'bg-[#F5B700]/[0.16] text-[#1B3A2D]'
          : 'text-[#6B7A72] hover:bg-[#1B3A2D]/[0.04] hover:text-[#1B3A2D]'
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
      <span className="max-w-full whitespace-nowrap">{item.label}</span>
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
