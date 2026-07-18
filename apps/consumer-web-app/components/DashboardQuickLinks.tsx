import Link from 'next/link';
import type { Route } from 'next';
import { Activity, UtensilsCrossed, ChevronRight } from 'lucide-react';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const LINKS: { label: string; description: string; href: Route; Icon: typeof Activity }[] = [
  {
    label: 'Movement',
    description: "Today's session",
    href: '/movement',
    Icon: Activity,
  },
  {
    label: 'Food Lens',
    description: 'Scan & log meals',
    href: '/food-lens',
    Icon: UtensilsCrossed,
  },
];

/**
 * Premium Dashboard Experience milestone — Movement and Food Lens lost
 * their permanent bottom-nav slots when the bar was trimmed back to the
 * 5-item Home/Today/Check-In/Progress/Root spec (BottomNav.tsx), so this
 * gives both flagship dashboards a real, prominent entry point here
 * instead of leaving them reachable only by typing the URL.
 */
export function DashboardQuickLinks() {
  return (
    <div className="grid grid-cols-2 gap-5">
      {LINKS.map(({ label, description, href, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`${CARD} flex flex-col justify-between p-5 transition hover:shadow-[0_4px_28px_-4px_rgba(27,58,45,0.18)]`}
        >
          <div className="flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1B3A2D]/[0.06]">
              <Icon className="h-5 w-5 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <ChevronRight className="h-4 w-4 text-[#1B3A2D]/30" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="mt-4">
            <p className="text-base font-semibold text-[#1B3A2D]">{label}</p>
            <p className="mt-0.5 text-xs text-[#6B7A72]">{description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
