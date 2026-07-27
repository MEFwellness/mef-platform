import Link from 'next/link';
import type { Route } from 'next';

/**
 * One required check-in a day (task requirement 2): this used to be a
 * segmented control presenting Morning and Evening as two equal halves of
 * one obligation. It's now an asymmetric link pair — Morning Readiness
 * reads as the primary destination (solid pill when active), Evening
 * Reflection reads as a lighter, explicitly optional detour (its own
 * "optional" label, never styled as an equal alternative) — while still
 * letting a member on either screen move to the other in one tap.
 */
export function CheckInModeSwitch({ active }: { active: 'morning' | 'evening' }) {
  const PRIMARY_ACTIVE = 'bg-[#1B3A2D] text-white';
  const PRIMARY_INACTIVE = 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]/70 hover:bg-[#1B3A2D]/10';

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Link
        href={'/checkin' as Route}
        aria-current={active === 'morning' ? 'page' : undefined}
        className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[12px] font-semibold transition-colors ${
          active === 'morning' ? PRIMARY_ACTIVE : PRIMARY_INACTIVE
        }`}
      >
        Morning Readiness
      </Link>
      <Link
        href={'/checkin/evening' as Route}
        aria-current={active === 'evening' ? 'page' : undefined}
        className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium underline decoration-[#1B3A2D]/25 underline-offset-2 transition-colors ${
          active === 'evening' ? 'text-[#1B3A2D]' : 'text-[#6B7A72] hover:text-[#1B3A2D]'
        }`}
      >
        Evening Reflection <span className="text-[#6B7A72]">(optional)</span>
      </Link>
    </div>
  );
}
