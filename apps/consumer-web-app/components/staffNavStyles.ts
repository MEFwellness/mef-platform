/**
 * The shared look of one tab in the staff navigation bar
 * (components/StaffNav.tsx).
 *
 * It lives in its own module rather than in StaffNav.tsx because the Sign
 * Out control is a button, not a link, so it comes from
 * components/SignOutButton.tsx instead. Importing the class from StaffNav
 * would make StaffNav and SignOutButton import each other. Both import
 * this, and this imports nothing.
 *
 * Same geometry and the same muted gray as BottomNav's member tabs, so the
 * two bars read as one design rather than two.
 */

/**
 * `print:hidden` is the one thing here BottomNav does not also do. One
 * coach screen is a printable report
 * (app/coach/clients/[id]/body-assessments/[assessmentId]/report), and it
 * only started sitting under a fixed bar when the staff bar moved into the
 * route layout. A bar pinned to the bottom of the viewport has no business
 * on a printed page.
 */
export const STAFF_NAV_BAR_CLASS =
  'fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t border-[#1B3A2D]/10 bg-white/95 pt-2 backdrop-blur [padding-bottom:max(0.5rem,env(safe-area-inset-bottom))] print:hidden md:inset-y-0 md:left-0 md:right-auto md:top-0 md:h-full md:w-24 md:flex-col md:justify-start md:gap-6 md:border-r md:border-t-0 md:px-0 md:py-10';

export const STAFF_NAV_ITEM_CLASS =
  'flex min-w-0 min-h-[52px] w-full flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 text-center text-[9px] font-bold uppercase leading-[1.05] tracking-tight transition-colors md:min-h-0 md:gap-2 md:px-4 md:py-3 md:text-[11px] md:leading-normal md:tracking-wide';

export const STAFF_NAV_ITEM_IDLE_CLASS =
  'text-[#6B7A72] hover:bg-[#1B3A2D]/[0.04] hover:text-[#1B3A2D]';

export const STAFF_NAV_ITEM_ACTIVE_CLASS = 'bg-[#F5B700]/[0.16] text-[#1B3A2D]';
