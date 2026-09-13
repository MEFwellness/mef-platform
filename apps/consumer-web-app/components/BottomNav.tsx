'use client';

/**
 * The MEMBER bar, and only the member bar: Home (left), the Check-In
 * button (center), Today (right). Root is reached through the floating
 * "Ask Root" launcher (FloatingCoachLauncher.tsx), never a bottom-nav tab.
 *
 * THREE DOORS, NOT FIVE (Home final structural pass, 2026-09-13). It
 * carried Food Lens and Progress as well, and both of them are also
 * tiles in Home's Quick Actions row. A bar that is on every screen in
 * the app and a row of shortcuts on the main one were advertising the
 * same two destinations, so the persistent chrome gave them up and the
 * row kept them: a shortcut belongs where the member is deciding what to
 * do, and the bar should hold only the three places she is always going.
 * Nothing was removed from the app. /food-lens and /progress are
 * unchanged routes with unchanged permissions, and the Food Lens tile is
 * still decided by the same `tracker.food_lens` rule that used to decide
 * its tab here.
 *
 * THE THREE ITEMS ARE EVENLY BALANCED. Home and Today each take a
 * `flex-1` half and centre their single pill inside it; the Check-In
 * button is a fixed-width sibling between the two halves, so its
 * midpoint lands on the bar's exact horizontal centre and the two labels
 * sit at the midpoints of the halves either side of it.
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
 * equal-width grid columns, which is now one column a side.
 *
 * BRAND COLOUR DISCIPLINE (revised, Home presentation pass 2026-09-13).
 * Inactive items read in muted gray. The active item gets a soft FOREST
 * pill behind it, not a gold one, and its icon and label go to full
 * forest. Gold was doing two different jobs in a bar 64px tall: it was
 * the check-in button, which is the one action this bar exists to offer,
 * and it was also "you are here", which is not an action at all. One of
 * them had to give it up, and it was not the button. The active state is
 * stronger than it was, not weaker: the pill is deeper, the label goes
 * from gray to forest and from medium to semibold, and a 3px forest mark
 * sits above the icon.
 *
 * ONE ICON WEIGHT. Every icon in this bar is 20px at stroke 1.75,
 * including the active one, which used to thicken to 2.25 and so was a
 * different icon from its own inactive self. Weight is not how this bar
 * says "here"; colour and the pill are.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { Home, Sparkles, Plus } from 'lucide-react';
import { StaffNav } from '@/components/StaffNav';
import { QuietLink } from '@/components/nav/QuietLink';

/**
 * `quiet` means this tab does not ask the server for its destination just
 * because the bar is on screen. The bar is on every member screen, so each
 * prefetching tab is a server render on every screen she opens, and Home is
 * the one destination in the app expensive enough for that to matter:
 * measured on production, prefetching `/dashboard` costs 1.06s against
 * 0.29s to 0.32s for every other tab here. The cheap, daily-tapped tabs
 * keep their prefetch, which is what a prefetch is for. See
 * components/nav/QuietLink.tsx.
 */
type NavItem = { label: string; href: string; Icon: typeof Home; quiet?: boolean };

const MEMBER_LEFT_ITEMS: NavItem[] = [
  { label: 'Home', href: '/dashboard', Icon: Home, quiet: true },
];

const MEMBER_RIGHT_ITEMS: NavItem[] = [{ label: 'Today', href: '/today', Icon: Sparkles }];

const MORNING_HREF = '/checkin';
const EVENING_HREF = '/checkin/evening';

/**
 * The tap target and the pill are deliberately two different boxes.
 *
 * They used to be one: the <Link> carried both the full grid column (so
 * the whole cell is tappable, which is right) and the active background
 * (which is not). Each side of this bar is half its width, so the active
 * tab was a slab running from the screen edge to the check-in button,
 * reading like a highlighter stroke rather than a selected tab.
 *
 * So the link keeps the full cell and the pill is capped at 84px and
 * centred inside it. With one item a side that cap is always what the
 * pill takes, which is what makes the three items read as three evenly
 * spaced objects rather than as two slabs either side of a button.
 * Shrink-wrapping the pill to its label was tried when this bar still
 * held five items and truncated "PROGRESS" to "PROGRE..." at 390px;
 * capping is the treatment that survived, and both remaining labels are
 * comfortably shorter than the words that found that bug.
 */
function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.Icon;
  // The pill is built once and handed to whichever link this tab uses.
  // Selecting the component into a variable instead (`quiet ? QuietLink :
  // Link`) type-checks in isolation and then fails the production build:
  // both are generic over the route, and the union of the two is more than
  // TypeScript will represent.
  const inner = (
    <span
      /* EVERY PIXEL OF THE CELL GOES TO THE LABEL. The pass that raised this
         from 9px to 10px truncated "FOOD LENS" and "PROGRESS" on a 390px
         screen, which is the exact bug the note above this component
         records being fixed once already. The room came back from the
         three paddings stacked between the screen edge and the word (the
         group's, the link's and the pill's), not from shrinking the type
         again, and `tracking-wide` went with it: at 10px in caps the
         default tracking is enough. Measured on a 390px viewport, both
         words spell themselves out with room to spare. */
      className={`relative flex w-full max-w-[84px] flex-col items-center gap-1.5 rounded-2xl px-1 py-2 text-center text-[10px] uppercase leading-[1.05] transition-colors md:max-w-none md:gap-2 md:px-3.5 md:py-2.5 md:text-[11px] md:leading-normal md:tracking-wide ${
        active
          ? 'bg-[#1B3A2D]/[0.07] font-semibold text-[#1B3A2D]'
          : 'font-medium text-[#6B7A72] group-hover:bg-[#1B3A2D]/[0.04] group-hover:text-[#1B3A2D]'
      }`}
    >
      {/* The "you are here" mark. A 3px bar on the pill's top edge, which
          is what makes the active tab legible at a glance on a bar where
          every item is otherwise the same shape and the same weight. */}
      {active && (
        <span
          className="absolute left-1/2 top-0 h-[3px] w-6 -translate-x-1/2 rounded-full bg-[#1B3A2D]"
          aria-hidden="true"
        />
      )}
      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="w-full truncate">{item.label}</span>
    </span>
  );

  const className =
    'group flex min-h-[52px] min-w-0 flex-col items-center justify-center px-0.5 py-1 md:min-h-0 md:px-1 md:py-1.5';
  const ariaCurrent = active ? ('page' as const) : undefined;

  if (item.quiet) {
    return (
      <QuietLink href={item.href as Route} aria-current={ariaCurrent} className={className}>
        {inner}
      </QuietLink>
    );
  }

  return (
    <Link href={item.href as Route} aria-current={ariaCurrent} className={className}>
      {inner}
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
};

export function BottomNav({ isCoach = false, isAdmin = false }: Props) {
  const pathname = usePathname();

  // A staff account gets the staff bar and nothing else. Returned before
  // any member item is even built, so there is no arrangement of props
  // that produces a member tab for a coach or an administrator.
  if (isCoach || isAdmin) return <StaffNav isCoach={isCoach} isAdmin={isAdmin} />;

  /*
   * VISIBILITY LAYER (2026-08-17), and where it went. Food Lens used to be
   * a tab here, revealed only by its own `tracker.food_lens` rule, because
   * a tab on every screen in the app is the most persistent advertisement
   * it has. The tab is gone and the rule is not: Home's Quick Actions row
   * asks the identical question before it draws the Food Lens tile
   * (app/dashboard/page.tsx). So this bar no longer needs a server read to
   * decide what it holds, and the three items below are the same three for
   * every member.
   */
  const leftItems: NavItem[] = MEMBER_LEFT_ITEMS;
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
      /* LESS WEIGHT, MORE ROOM. The 10% border read as a gray rule under
         every screen in the app; at 6% over a blurred cream it reads as
         an edge without reading as a line. The bar sits on the cream
         rather than on white for the same reason. */
      className="fixed inset-x-0 bottom-0 z-20 flex items-center border-t border-[#1B3A2D]/[0.06] bg-[#FCFAF5]/92 pt-2.5 backdrop-blur-md [padding-bottom:max(0.625rem,env(safe-area-inset-bottom))] md:inset-y-0 md:left-0 md:right-auto md:top-0 md:h-full md:w-24 md:flex-col md:justify-start md:gap-6 md:border-r md:border-t-0 md:px-0 md:py-10"
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
        className="grid min-w-0 flex-1 items-start gap-1 px-1 md:contents"
        style={{ gridTemplateColumns: `repeat(${leftItems.length}, minmax(0, 1fr))` }}
      >
        {leftItems.map((item) => (
          <NavLink key={item.label} item={item} active={pathname === item.href} />
        ))}
      </div>

      <Link
        href={checkInHref as Route}
        aria-label="Check In"
        className="mef-focus-ring flex shrink-0 flex-col items-center gap-1.5 px-2 -mt-7 md:mt-0 md:gap-2"
      >
        {/* THE ONE GOLD OBJECT IN THE APP'S CHROME. Unchanged in size,
            colour and icon; the ring it wears when it is the current
            screen is now gold-on-gold rather than a dark collar, and the
            drop is softer and wider so it reads as lit rather than as
            stuck on. */}
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-full bg-[#F5B700] text-[#1B3A2D] shadow-[0_12px_28px_-10px_rgba(245,183,0,0.7)] transition-transform ${
            checkInActive ? 'scale-105 ring-4 ring-[#F5B700]/25' : 'hover:scale-105'
          }`}
        >
          <Plus className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#1B3A2D] md:text-[11px]">
          Check-In
        </span>
      </Link>

      <div
        className="grid min-w-0 flex-1 items-start gap-1 px-1 md:contents"
        style={{ gridTemplateColumns: `repeat(${rightItems.length}, minmax(0, 1fr))` }}
      >
        {rightItems.map((item) => (
          <NavLink key={item.label} item={item} active={pathname === item.href} />
        ))}
      </div>
    </nav>
  );
}
