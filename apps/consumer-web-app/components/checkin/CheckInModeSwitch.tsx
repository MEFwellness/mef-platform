import Link from 'next/link';
import type { Route } from 'next';

/**
 * Small segmented control shown on both /checkin and /checkin/evening so
 * a member can always move to the other one regardless of which the
 * time-based default (BottomNav.tsx) sent them to.
 */
export function CheckInModeSwitch({ active }: { active: 'morning' | 'evening' }) {
  const OPTION =
    'flex-1 rounded-full px-4 py-2 text-center text-[13px] font-semibold transition-colors';
  const ACTIVE = 'bg-[#1B3A2D] text-white';
  const INACTIVE = 'text-[#6B7A72] hover:text-[#1B3A2D]';

  return (
    <div className="mt-4 inline-flex rounded-full bg-[#1B3A2D]/[0.05] p-1">
      <Link
        href={'/checkin' as Route}
        aria-current={active === 'morning' ? 'page' : undefined}
        className={`${OPTION} ${active === 'morning' ? ACTIVE : INACTIVE}`}
      >
        Morning Readiness
      </Link>
      <Link
        href={'/checkin/evening' as Route}
        aria-current={active === 'evening' ? 'page' : undefined}
        className={`${OPTION} ${active === 'evening' ? ACTIVE : INACTIVE}`}
      >
        Evening Reflection
      </Link>
    </div>
  );
}
