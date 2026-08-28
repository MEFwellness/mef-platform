/**
 * ONE ANSWER FOR THE WHOLE MEMBER TREE (A3, 2026-08-28).
 *
 * `/coach/assign/<memberId>` and the plan review under it each load
 * their own data. Deciding "may this coach see this member at all" on
 * each of them is exactly the per-screen judgement that let the Safety
 * Review Queue drift, so it is decided here instead, once, for every
 * screen in the tree including any added later.
 *
 * NOT THE SECURITY BOUNDARY. RLS (migration 16) is what stops a coach
 * reading a member outside their caseload, and it does that whatever this
 * file says. This only enforces the product rule that a seeded test
 * account is not part of a real coach's caseload, so a typed URL for one
 * is a plain "not found" rather than a fixture rendered in full.
 */

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isMemberVisibleToStaff } from '@/lib/staff/testAccounts';

export const dynamic = 'force-dynamic';

export default async function CoachAssignMemberScopeLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { memberId: string };
}) {
  const supabase = createClient();
  if (!(await isMemberVisibleToStaff(supabase, params.memberId))) notFound();
  return <>{children}</>;
}
