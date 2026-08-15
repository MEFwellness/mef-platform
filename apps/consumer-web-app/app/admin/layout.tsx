/**
 * The administrator side's chrome, decided once for the whole /admin
 * subtree instead of once per page.
 *
 * THE DEFECT THIS FIXES. Every admin page used to render
 * `<BottomNav isCoach={isCoach} />` itself, where `isCoach` came from that
 * page's own role lookup. An administrator who does not also hold the
 * coach grant produced `false`, and `false` was BottomNav's instruction to
 * draw the full member bar: Home, Food Lens, the gold Check-In button,
 * Progress and Today, pinned under every admin screen, each tab a door
 * into the member experience that an administrator is not supposed to be
 * in. Deciding chrome inside pages meant the decision was only ever as
 * right as the last page anyone remembered to update.
 *
 * Now the decision is a layout. Every admin route, including ones that do
 * not exist yet, inherits the staff bar automatically, and no admin page
 * imports the member navigation at all.
 *
 * NOT A GUARD. middleware.ts already turns away anyone without the
 * platform_administrator grant on every /admin path, each page checks
 * again, each action those pages call checks again, and the database
 * functions underneath check a fourth time. This layout only draws
 * navigation, so it never redirects: a request that reached it has already
 * passed the checks that matter.
 */

import type { ReactNode } from 'react';
import { StaffNav } from '@/components/StaffNav';
import { getStaffRoles } from '@/lib/auth/staffRoles';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { isCoach, isAdmin } = await getStaffRoles();

  return (
    <>
      {children}
      <StaffNav isCoach={isCoach} isAdmin={isAdmin} />
    </>
  );
}
