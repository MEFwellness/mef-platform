/**
 * The member bar.
 *
 * A server component wrapping the unchanged presentational
 * components/BottomNav.tsx, which is a client component because it reads
 * the current path.
 *
 * IT NO LONGER RESOLVES ANYTHING (Home final structural pass,
 * 2026-09-13). It existed to answer one question on the server before the
 * bar was drawn: whether this member's own rules had revealed Food Lens,
 * because a tab on every screen in the app is the most persistent
 * advertisement it has. The bar holds three items now, Home, Check-In and
 * Today, and none of them is gated, so there is nothing left to read.
 *
 * THE RULE DID NOT GO ANYWHERE. Food Lens is a tile in Home's Quick
 * Actions row and that row asks `tracker.food_lens` before it draws the
 * tile, which is the same question this file used to ask. What changed is
 * where the advertisement lives, not who may see it.
 *
 * Staff accounts get StaffNav, exactly as before: a coach or an
 * administrator is never handed a member tab.
 */

import { BottomNav } from '@/components/BottomNav';

export async function MemberBottomNav({
  isCoach = false,
  isAdmin = false,
}: {
  isCoach?: boolean;
  isAdmin?: boolean;
}) {
  return <BottomNav isCoach={isCoach} isAdmin={isAdmin} />;
}
