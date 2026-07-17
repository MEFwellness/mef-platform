'use client';

/**
 * Premium UX Milestone 1: permanent 5-slot nav — Dashboard, Today,
 * Check-In (center), Food Lens, Progress. Assessments and Profile are
 * intentionally not tabs here anymore: Assessments now lives inside
 * Progress (and stays reachable from Profile), and Profile itself is
 * reached via the avatar in the page header (AvatarLink.tsx) rather than
 * a nav slot — freeing this bar down to the five actions members reach
 * for daily. The standalone "Coaching" tab is gone entirely since the
 * floating "Ask Root" launcher (FloatingCoachLauncher.tsx) already
 * reaches the same conversation from every screen. Inactive items use
 * the app's existing gold label color (#854D0E, the same color every
 * card eyebrow label already uses at full strength) instead of a faint
 * gray, so the bar reads as confidently branded rather than washed out;
 * the active page stays the signature MEF green.
 *
 * Mobile alignment: the bar is two independent `flex-1` halves (left
 * items, right items) with the Check-In button as a fixed-width sibling
 * between them — since both halves always get an equal share of the
 * remaining width regardless of how many items each holds (2 vs 3 for a
 * member, 3 vs 3 for a coach), Check-In's midpoint lands on the bar's
 * exact horizontal center at any viewport width, with no fixed-pixel
 * positioning. Within each half, items sit in a CSS grid with one equal-
 * width column per item so the gaps between them are always identical,
 * which is what `justify-around` could not guarantee once items of
 * different label lengths sat either side of a much larger, differently
 * shaped center button. With only two items per half now (down from up
 * to four), labels get real breathing room, so they render at a larger,
 * always-on-one-line size instead of the old cramped fallback that let
 * long labels wrap.
 *
 * Premium UX Milestone 3 (brand color discipline): inactive items were
 * the app's amber eyebrow color (#854D0E) at full strength — the same
 * color every card's section label used, which meant 4 of these 5 icons
 * were "gold" at rest, the opposite of "gold should remain special."
 * Inactive now reads in muted gray; the active item gets a soft gold
 * pill behind the icon (a real but restrained use of "gold: active
 * navigation") while its text/icon stay dark green for contrast — gold
 * text on white at this size would have been hard to read.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { Home, Sparkles, Plus, BarChart2, Users, UtensilsCrossed } from 'lucide-react';

type NavItem = { label: string; href: string; Icon: typeof Home };

const LEFT_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', Icon: Home },
  { label: 'Today', href: '/today', Icon: Sparkles },
];

const RIGHT_ITEMS: NavItem[] = [
  { label: 'Food Lens', href: '/food-lens', Icon: UtensilsCrossed },
  { label: 'Progress', href: '/progress', Icon: BarChart2 },
];

const CHECK_IN_HREF = '/checkin';

/** Appended after Today for coach accounts only — kept on the left half so it sits next to the member tabs it supplements rather than crowding the newly-trimmed right half. */
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
