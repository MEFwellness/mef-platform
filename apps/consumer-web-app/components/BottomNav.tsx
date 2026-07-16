'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import {
  Home,
  Sparkles,
  PlusCircle,
  BarChart2,
  Users,
  User,
  MessageCircle,
  ScanFace,
} from 'lucide-react';

const MEMBER_NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', Icon: Home },
  { label: 'Today', href: '/today', Icon: Sparkles },
  { label: 'Check-in', href: '/checkin', Icon: PlusCircle },
  { label: 'Assessment', href: '/assessment', Icon: ScanFace },
  { label: 'Coaching', href: '/conversation', Icon: MessageCircle },
  { label: 'Progress', href: '/progress', Icon: BarChart2 },
  { label: 'Profile', href: '/profile', Icon: User },
] as const;

const COACH_NAV_ITEM = { label: 'Coach', href: '/coach', Icon: Users } as const;

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
  const navItems = isCoach
    ? [...MEMBER_NAV_ITEMS.slice(0, -1), COACH_NAV_ITEM, MEMBER_NAV_ITEMS.at(-1)!]
    : MEMBER_NAV_ITEMS;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex justify-around overflow-x-auto border-t border-[#1B3A2D]/10 bg-white/95 px-1 py-3 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:inset-y-0 md:left-0 md:right-auto md:top-0 md:h-full md:w-24 md:flex-col md:justify-start md:gap-6 md:overflow-x-visible md:border-r md:border-t-0 md:px-0 md:py-10"
      aria-label="Primary"
    >
      {navItems.map(({ label, href, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={label}
            href={href as Route}
            className={`flex shrink-0 flex-col items-center gap-0.5 rounded-2xl px-1 py-2 text-[10px] font-medium transition-colors md:gap-1 md:px-4 md:text-[11px] ${
              active
                ? 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]'
                : 'text-[#9AA79F] hover:bg-[#1B3A2D]/[0.03] hover:text-[#1B3A2D]'
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.5} aria-hidden="true" />
            <span className="mt-0.5 whitespace-nowrap">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
