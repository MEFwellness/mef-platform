'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, PlusCircle, BarChart2, Users, User } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', Icon: Home },
  { label: 'Check-in', href: '/checkin', Icon: PlusCircle },
  // No dedicated /progress page exists yet — the trend chart lives on the
  // dashboard itself, so this points there rather than to a dead link.
  { label: 'Progress', href: '/dashboard', Icon: BarChart2 },
  { label: 'Coach', href: '/coach', Icon: Users },
  { label: 'Profile', href: '/profile', Icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-[#1B3A2D]/10 bg-white/95 px-3 py-3 backdrop-blur md:inset-y-0 md:left-0 md:right-auto md:top-0 md:h-full md:w-24 md:flex-col md:justify-start md:gap-6 md:border-r md:border-t-0 md:py-10"
      aria-label="Primary"
    >
      {NAV_ITEMS.map(({ label, href, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={label}
            href={href}
            className={`flex flex-col items-center gap-1 rounded-2xl px-4 py-2 text-[11px] font-medium transition-colors ${
              active
                ? 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]'
                : 'text-[#9AA79F] hover:bg-[#1B3A2D]/[0.03] hover:text-[#1B3A2D]'
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.5} aria-hidden="true" />
            <span className="mt-0.5">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}