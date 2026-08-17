'use client';

/**
 * The MEMBER bar, and only the member bar: Home, Food Lens (left), the
 * Check-In button (center), Progress, Today (right), two evenly-weighted
 * tabs on each side of the center button. Root is reached through the
 * floating "Ask Root" launcher (FloatingCoachLauncher.tsx), never a
 * bottom-nav tab.
 *
 * IT NO LONGER DRAWS A STAFF BAR. This component used to take an
 * `isCoach` boolean and draw a small coach bar when it was true. Coach and
 * admin screens now get their navigation from their own route layouts
 * (app/coach/layout.tsx, app/admin/layout.tsx) instead, and no screen
 * under /coach or /admin imports this file at all. That is the fix for an
 * administrator who did not also hold the coach grant seeing the full
 * member bar, five member doors wide, underneath the admin screens: the
 * page was passing `isCoach: false` and false meant "member".
 *
 * The `isCoach`/`isAdmin` props that remain are a net, not the mechanism.
 * middleware.ts redirects staff off every member surface already, and the
 * staff screens no longer render this component, so the only way a staff
 * account reaches this code is a role-neutral screen (/about, /help) that
 * genuinely serves all three roles. Those get StaffNav, so a coach or an
 * administrator is never handed a member tab to tap.
 *
 * Mobile alignment: two independent `flex-1` halves (left items, right
 * items) with the Check-In button as a fixed-width sibling between them,
 * so Check-In's midpoint always lands on the bar's exact horizontal
 * center regardless of viewport width. Each half renders its items as
 * equal-width grid columns, so two items per side stay symmetrical.
 *
 * Brand color discipline: inactive items read in muted gray; the active
 * item gets a soft gold pill behind the icon while its text/icon stay
 * dark green for contrast.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { Home, Sparkles, Plus, UtensilsCrossed, BarChart2 } from 'lucide-react';
import { StaffNav } from '@/components/StaffNav';

type NavItem = { label: string; href: string; Icon: typeof Home };

const MEMBER_LEFT_ITEMS: NavItem[] = [
  { label: 'Home', href: '/dashboard', Icon: Home },
  { label: 'Food Lens', href: '/food-lens', Icon: UtensilsCrossed },
];

const MEMBER_RIGHT_ITEMS: NavItem[] = [
  { label: 'Progress', href: '/progress', Icon: BarChart2 },
  { label: 'Today', href: '/today', Icon: Sparkles },
];

const MORNING_HREF = '/checkin';
const EVENING_HREF = '/checkin/evening';

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.Icon;
  return (
    <Link
      href={item.href as Route}
      aria-current={active ? 'page' : undefined}
      className={`flex min-w-0 min-h-[52px] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 text-center text-[9px] font-bold uppercase leading-[1.05] tracking-tight transition-colors md:min-h-0 md:gap-2 md:px-4 md:py-3 md:text-[11px] md:leading-normal md:tracking-wide ${
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
   * Whether the signed-in account holds the coach grant, and whether it
   * holds the platform administrator grant. Either one true means this is
   * a staff account, and a staff account never gets a member tab: StaffNav
   * is rendered in place of this bar. Both default to false, so any caller
   * that passes nothing gets the member bar, which is the only one an
   * ordinary account can use anyway.
   *
   * Every screen under /coach and /admin gets StaffNav from its own layout
   * and does not render this component at all, so these props only decide
   * the role-neutral screens (/about, /help) that all three roles share.
   */
  isCoach?: boolean;
  isAdmin?: boolean;
  /**
   * VISIBILITY LAYER (2026-08-17). The bar is on every member screen, so a
   * tab in it is the most persistent advertisement in the app. Food Lens is
   * a real feature with a real audience (a member working on what she eats)
   * and no audience at all for someone who came here about her lower back,
   * so the tab exists only when her own rule reveals it. Home is the tab
   * that takes its place, which keeps the left half of the bar balanced
   * against the right rather than leaving a hole beside the check-in
   * button.
   *
   * Defaults to true so that any caller which has not been given the
   * server-resolved answer behaves exactly as this bar always has. The
   * server component that DOES resolve it is components/MemberBottomNav.tsx,
   * and it is what every member screen renders.
   */
  showFoodLens?: boolean;
};

export function BottomNav({ isCoach = false, isAdmin = false, showFoodLens = true }: Props) {
  const pathname = usePathname();

  // A staff account gets the staff bar and nothing else. Returned before
  // any member item is even built, so there is no arrangement of props
  // that produces a member tab for a coach or an administrator.
  if (isCoach || isAdmin) return <StaffNav isCoach={isCoach} isAdmin={isAdmin} />;

  const leftItems: NavItem[] = showFoodLens
    ? MEMBER_LEFT_ITEMS
    : MEMBER_LEFT_ITEMS.filter((item) => item.href !== '/food-lens');
  const rightItems: NavItem[] = MEMBER_RIGHT_ITEMS;
  const checkInActive = pathname === MORNING_HREF || pathname === EVENING_HREF;

  // One required check-in a day (task requirement 2): the primary nav
  // button always goes to Morning Readiness, at every hour — this used to
  // swap to Evening Reflection from 5pm onward, presenting the two as
  // equally-weighted halves of one obligation. Evening is now reached
  // deliberately, from its own optional entry point on Today/Home, never
  // from this always-visible central button.
  const checkInHref = MORNING_HREF;

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
        <span className="text-[9px] font-bold uppercase tracking-wide text-[#1B3A2D] md:text-[11px]">
          Check-In
        </span>
      </Link>

      <div
        className="grid min-w-0 flex-1 items-start gap-0.5 px-1 md:contents"
        style={{ gridTemplateColumns: `repeat(${rightItems.length}, minmax(0, 1fr))` }}
      >
        {rightItems.map((item) => (
          <NavLink key={item.label} item={item} active={pathname === item.href} />
        ))}
      </div>
    </nav>
  );
}
