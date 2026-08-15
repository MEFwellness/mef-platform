'use client';

/**
 * The coach and administrator navigation bar, and the only navigation any
 * staff screen renders.
 *
 * WHY IT EXISTS. Every coach and admin page used to render
 * components/BottomNav.tsx and pass it a single `isCoach` boolean. For an
 * account holding the coach role that produced a one tab coach bar, but
 * for an administrator who was not also a coach it produced the full
 * MEMBER bar (Home, Food Lens, Check-In, Progress, Today) underneath the
 * admin screens, with five tabs leading straight into the member
 * experience. Staff chrome now comes from the route group's own layout
 * (app/coach/layout.tsx, app/admin/layout.tsx), which knows both roles, so
 * every future coach or admin page inherits the correct bar without
 * remembering to ask for it.
 *
 * WHAT IS DELIBERATELY ABSENT. No member destination appears here at all,
 * not even as a hidden tab. middleware.ts redirects a coach or an
 * administrator off every member surface (lib/auth/staffRouting.ts), so a
 * member tab on this bar would be a tab that bounces, and a dead end is
 * worse than an absent one.
 *
 * Visual pattern is BottomNav's, unchanged: a fixed bottom bar on mobile
 * that becomes a fixed left rail from `md` up, muted gray for inactive
 * items, a soft gold pill behind the active one.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { Users, ShieldCheck } from 'lucide-react';
import { SignOutButton } from '@/components/SignOutButton';
import {
  STAFF_NAV_BAR_CLASS,
  STAFF_NAV_ITEM_CLASS,
  STAFF_NAV_ITEM_ACTIVE_CLASS,
  STAFF_NAV_ITEM_IDLE_CLASS,
} from '@/components/staffNavStyles';
import { COACH_HOME_PATH, ADMIN_HOME_PATH } from '@/lib/auth/staffRouting';

type StaffNavItem = { label: string; href: string; Icon: typeof Users };

function StaffNavLink({ item, active }: { item: StaffNavItem; active: boolean }) {
  const Icon = item.Icon;
  return (
    <Link
      href={item.href as Route}
      aria-current={active ? 'page' : undefined}
      className={`${STAFF_NAV_ITEM_CLASS} ${
        active ? STAFF_NAV_ITEM_ACTIVE_CLASS : STAFF_NAV_ITEM_IDLE_CLASS
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
      <span className="w-full truncate">{item.label}</span>
    </Link>
  );
}

export type StaffNavProps = {
  isCoach: boolean;
  isAdmin: boolean;
};

/**
 * An account holding both grants gets both tabs, in the same order
 * staffHomePath() ranks them (coach first, because an account that coaches
 * real clients has people waiting on it). An account holding neither would
 * render a bar of nothing but Sign Out, which is still the honest answer:
 * middleware.ts has already redirected that request, so this only happens
 * if a role lookup failed, and offering a way out beats offering nothing.
 */
export function StaffNav({ isCoach, isAdmin }: StaffNavProps) {
  const pathname = usePathname();

  const items: StaffNavItem[] = [];
  if (isCoach) items.push({ label: 'Coach', href: COACH_HOME_PATH, Icon: Users });
  if (isAdmin) items.push({ label: 'Admin', href: ADMIN_HOME_PATH, Icon: ShieldCheck });

  return (
    <nav className={STAFF_NAV_BAR_CLASS} aria-label="Staff">
      <div
        className="grid min-w-0 flex-1 items-stretch gap-0.5 px-1 md:contents"
        style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <StaffNavLink
            key={item.label}
            item={item}
            active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
          />
        ))}
        {/*
         * The confirmation copy follows the same coach-wins-over-admin
         * order staffHomePath() uses, so an account holding both grants is
         * told about the clients it actually has rather than about the
         * platform tools it reaches one tap away.
         */}
        <SignOutButton variant="nav" audience={isCoach ? 'coach' : 'admin'} />
      </div>
    </nav>
  );
}
