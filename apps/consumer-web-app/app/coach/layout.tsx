/**
 * The coach side's chrome, decided once for the whole /coach subtree.
 *
 * Companion to app/admin/layout.tsx, and there for the same reason: the
 * navigation a staff screen shows is a property of the section, not of
 * each page, so a new coach screen inherits the right bar rather than
 * having to remember to ask for it. Every coach page used to render
 * `<BottomNav isCoach />` by hand, which worked only for as long as
 * nobody forgot.
 *
 * The bar itself carries whichever staff destinations this account
 * actually holds, so a coach who is also an administrator gets both tabs
 * here and does not have to type a URL to cross between the two sides.
 *
 * NOT A GUARD. middleware.ts turns away anyone without the coach grant on
 * every /coach path, and RLS decides what a coach may read about which
 * client. This layout only draws navigation.
 */

import type { ReactNode } from 'react';
import { StaffNav } from '@/components/StaffNav';
import { getStaffRoles } from '@/lib/auth/staffRoles';

export const dynamic = 'force-dynamic';

export default async function CoachLayout({ children }: { children: ReactNode }) {
  const { isCoach, isAdmin } = await getStaffRoles();

  return (
    <>
      {children}
      <StaffNav isCoach={isCoach} isAdmin={isAdmin} />
    </>
  );
}
