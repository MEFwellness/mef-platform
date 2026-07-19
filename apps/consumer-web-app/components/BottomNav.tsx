'use client';

/**
 * Primary navigation. The fixed bottom bar is deliberately minimal — Home
 * on the left, the large centered Check-In action, and Today on the
 * right. Every other primary surface (Movement, Food Lens, Progress) is
 * reached from Dashboard quick-access cards instead (see
 * components/DashboardQuickLinks.tsx), and Root is reached through the
 * floating "Ask Root" launcher (FloatingCoachLauncher.tsx) — never a
 * bottom-nav tab. This is an explicit, deliberate scope: three items,
 * nothing more, not a redesign to fit more tabs in.
 *
 * Mobile alignment: two independent `flex-1` halves (left items, right
 * items) with the Check-In button as a fixed-width sibling between them,
 * so Check-In's midpoint always lands on the bar's exact horizontal
 * center regardless of viewport width. With exactly one item per half for
 * a member, the bar reads as three clearly separated, evenly-weighted
 * targets — Home, Check-In, Today — with no crowding at any phone width.
 *
 * Brand color discipline: inactive items read in muted gray; the active
 * item gets a soft gold pill behind the icon while its text/icon stay
 * dark green for contrast.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { Home, Sparkles, Plus, Users } from 'lucide-react';

type NavItem = { label: string; href: string; Icon: typeof Home };

const LEFT_ITEMS: NavItem[] = [{ label: 'Home', href: '/dashboard', Icon: Home }];

const RIGHT_ITEMS: NavItem[] = [{ label: 'Today', href: '/today', Icon: Sparkles }];

const MORNING_HREF = '/checkin';
const EVENING_HREF = '/checkin/evening';

/**
 * 5:00 AM-11:59 AM local device time defaults to Morning Readiness,
 * 5:00 PM onward (through the night, wrapping past midnight) defaults to
 * Evening Reflection, and the hours in between leave the button on
 * Morning Readiness since no default is specified for midday — a member
 * can always switch manually from either check-in page regardless of
 * this default. Device-local, not profile timezone, per the polish
 * milestone spec ("user's local device time").
 */
function checkInHrefForLocalHour(hour: number): string {
  if (hour >= 17 || hour < 5) return EVENING_HREF;
  return MORNING_HREF;
}

/** Appended after Home for coach accounts only — a distinct role-gated surface, not part of the three-item member nav this bar is otherwise scoped to. */
const COACH_NAV_ITEM: NavItem = { label: 'Coach', href: '/coach', Icon: Users };

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.Icon;
  return (
    <Link
      href={item.href as Route}
      aria-current={active ? 'page' : undefined}
      className={`flex min-w-0 min-h-[52px] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 text-center text-[10px] font-bold uppercase leading-[1.05] tracking-tight transition-colors md:min-h-0 md:gap-2 md:px-4 md:py-3 md:text-[11px] md:leading-normal md:tracking-wide ${
        active
          ? 'bg-[#F5B700]/[0.16] text-[#1B3A2D]'
          : 'text-[#6B7A72] hover:bg-[#1B3A2D]/[0.04] hover:text-[#1B3A2D]'
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
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
  const checkInActive = pathname === MORNING_HREF || pathname === EVENING_HREF;

  // Defaults to Morning on first paint (matches the server-rendered
  // markup, avoiding a hydration mismatch), then swaps to the
  // time-appropriate check-in a moment after mount, once the browser's
  // local clock is available.
  const [checkInHref, setCheckInHref] = useState(MORNING_HREF);
  useEffect(() => {
    setCheckInHref(checkInHrefForLocalHour(new Date().getHours()));
  }, []);

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
        href={checkInHref as Route}
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
