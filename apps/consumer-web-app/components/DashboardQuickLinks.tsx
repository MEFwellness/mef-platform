import Link from 'next/link';
import type { Route } from 'next';
import { Activity, UtensilsCrossed, BarChart2, ChevronRight } from 'lucide-react';

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
  {
    label: 'Progress',
    description: 'Trends & history',
    href: '/progress',
    Icon: BarChart2,
  },
];

/**
 * The fixed bottom nav is scoped to exactly Home / Check-In / Today — see
 * BottomNav.tsx. Movement, Food Lens, and Progress are each full
 * dashboards in their own right, so they still need a fast, reliable
 * entry point; this is it. Three equal-weight cards, one tap each,
 * right under the Root Score card members already look at first.
 */
export function DashboardQuickLinks() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {LINKS.map(({ label, description, href, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`${CARD} flex flex-col items-start p-4 transition hover:shadow-[0_4px_28px_-4px_rgba(27,58,45,0.18)]`}
        >
          <div className="flex w-full items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1B3A2D]/[0.06]">
              <Icon className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <ChevronRight
              className="h-3.5 w-3.5 text-[#1B3A2D]/30"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>
          <div className="mt-3">
            <p className="text-sm font-semibold text-[#1B3A2D]">{label}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-[#6B7A72]">{description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
