/**
 * Member access, the administrator's console.
 *
 * This screen is how Osei runs access until in-app billing exists, and how
 * people who pay outside the app entirely (Zelle, an external Stripe link
 * on Leadpages) are handled permanently, billing build or no billing build.
 *
 * Everything on it is one member's entitlement: which tier they are on, how
 * that tier was granted, their trial window, their status, and whether they
 * hold a full access grant. Every control writes through
 * admin_set_member_access(), which is the only thing in the entire system
 * allowed to change a manual assignment, and every write leaves a
 * membership_tier_changed event behind it.
 *
 * NOT A MEMBER SCREEN. Nothing here is rendered to a member, and the
 * administrator's own note about a member ("paid by Zelle on the 12th") is
 * never shown to them and never reaches an analytics payload.
 *
 * The access check runs in middleware.ts (every /admin path), again here,
 * again inside every action this page calls, and again inside every
 * database function those actions reach.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { BackButton } from '@/components/BackButton';
import { listMemberAccessAction } from '@/app/actions/memberAccess';
import type { MemberAccessRow } from '@/app/actions/memberAccess';
import { decideMemberAccess, describeAccess, trialDaysRemaining } from '@/lib/membership/access';
import { MemberAccessPanel } from './MemberAccessPanel';
import type { MemberAccessView } from './MemberAccessPanel';

export const metadata: Metadata = { title: 'Member access' };

export const dynamic = 'force-dynamic';

/**
 * The derived state is computed here, on the server, and passed down as a
 * finished string. Computing it inside the client component would mean the
 * server rendering it against server time and the browser re-rendering it
 * against browser time, which is a hydration mismatch waiting for the one
 * member whose trial ends between the two.
 */
function toView(row: MemberAccessRow, now: Date): MemberAccessView {
  const subscription =
    row.tier && row.status && row.trialStartedAt && row.trialEndsAt
      ? {
          memberId: row.memberId,
          tier: row.tier,
          source: (row.source ?? 'system') as 'manual' | 'billing' | 'system',
          status: row.status,
          fullAccess: row.fullAccess,
          trialStartedAt: row.trialStartedAt,
          trialEndsAt: row.trialEndsAt,
        }
      : null;

  const decision = decideMemberAccess({ subscription, isTest: row.isTest, now });

  return {
    ...row,
    accessLabel: describeAccess(decision),
    allowed: decision.allowed,
    trialDaysLeft: row.trialEndsAt ? trialDaysRemaining(new Date(row.trialEndsAt), now) : null,
  };
}

export default async function AdminMemberAccessPage({
  searchParams,
}: {
  searchParams?: { includeTest?: string };
}) {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');
  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (!isAdmin) redirect('/dashboard');
  const isCoach = await hasActiveRole(supabase, user.id, 'coach');

  const includeTest = searchParams?.includeTest === '1';
  const result = await listMemberAccessAction(includeTest);
  const now = new Date();
  const rows = result.ok ? result.data.map((row) => toView(row, now)) : [];
  const lockedCount = rows.filter((row) => !row.allowed).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F5F0E4] to-[#FAF8F1] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/admin" label="Admin" />

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Member access
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#4F645A]">
          Who can open the app, and why. Assign a tier, grant full access, extend a trial, or end
          someone&apos;s access. Changes take effect on their very next screen.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          {rows.length} {rows.length === 1 ? 'member' : 'members'}, {lockedCount} currently locked
          out.
        </p>

        {!result.ok && (
          <p role="alert" className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {result.error}
          </p>
        )}

        <MemberAccessPanel rows={rows} includeTest={includeTest} />
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
