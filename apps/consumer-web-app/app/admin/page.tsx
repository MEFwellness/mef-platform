import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { listUsers, listActiveCoachUserIds, listAssignmentHistory } from '@/app/actions/admin';
import { AdminPanel } from './AdminPanel';
import { ChangePasswordLink } from '@/components/auth/ChangePasswordLink';
import { getCachedUser } from '@/lib/supabase/currentUser';

export default async function AdminPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const [users, coachIds, assignments] = await Promise.all([
    listUsers(),
    listActiveCoachUserIds(),
    listAssignmentHistory(),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Admin
        </h1>
        <p className="mt-2 text-[15px] text-[#6B7A72]">
          User management, coach roles, and client assignments.
        </p>

        <ChangePasswordLink className="mt-4" />

        <Link
          href={'/admin/access' as Route}
          className="mef-focus-ring mt-6 block rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition hover:bg-[#FAFAF8]"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Access</p>
          <p className="mt-1 text-[15px] font-medium text-[#1B3A2D]">
            Member access: tiers, trials, and full access grants
          </p>
          <p className="mt-1 text-sm text-[#6B7A72]">
            Who can open the app and why. Assign a tier, grant or revoke full access, extend a
            trial, or end someone&apos;s access. This is where members who pay outside the app are
            handled.
          </p>
        </Link>

        <Link
          href={'/admin/analytics' as Route}
          className="mef-focus-ring mt-6 block rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition hover:bg-[#FAFAF8]"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Analytics</p>
          <p className="mt-1 text-[15px] font-medium text-[#1B3A2D]">
            Product analytics: overview, funnel, features, drop-off, members
          </p>
          <p className="mt-1 text-sm text-[#6B7A72]">
            Active members, sessions, where people stop, which features nobody has opened, and each
            member&apos;s own engagement state. Test accounts are excluded unless you turn them on.
          </p>
        </Link>

        <Link
          href={'/admin/blueprints' as Route}
          className="mef-focus-ring mt-6 block rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition hover:bg-[#FAFAF8]"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Programs</p>
          <p className="mt-1 text-[15px] font-medium text-[#1B3A2D]">
            Blueprint Library: named programs and their versions
          </p>
          <p className="mt-1 text-sm text-[#6B7A72]">
            Programs MEF authors once and gives to many members. Read every session and slot,
            approve a draft so coaches can assign it, archive one, or duplicate it into a new
            program.
          </p>
        </Link>

        <Link
          href={'/admin/cvs-test-tools' as Route}
          className="mef-focus-ring mt-3 block rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition hover:bg-[#FAFAF8]"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Testing Tools</p>
          <p className="mt-1 text-[15px] font-medium text-[#1B3A2D]">Core Values Snapshot: reset &amp; time-shift</p>
          <p className="mt-1 text-sm text-[#6B7A72]">
            Retake a test member&apos;s completion, or fire the day-3/day-7 Weekly Experiment follow-ups early.
          </p>
        </Link>

        <Link
          href={'/admin/reset-plan-test-tools' as Route}
          className="mef-focus-ring mt-3 block rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition hover:bg-[#FAFAF8]"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Testing Tools</p>
          <p className="mt-1 text-[15px] font-medium text-[#1B3A2D]">Personal Reset Plan: grant, reset &amp; time-shift</p>
          <p className="mt-1 text-sm text-[#6B7A72]">
            Grant a test member access, reset their plan, or fire the day-3/day-7 follow-ups early.
          </p>
        </Link>

        {/* The two internal movement tools. Both used to sit on the member
            Movement screen and are now coach/admin only (see
            lib/auth/staffRouting.ts's STAFF_ONLY_PREFIXES), so an
            administrator who is not also a coach still has a way in. */}
        <Link
          href={'/exercises' as Route}
          className="mef-focus-ring mt-3 block rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition hover:bg-[#FAFAF8]"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Movement</p>
          <p className="mt-1 text-[15px] font-medium text-[#1B3A2D]">Exercise Library</p>
          <p className="mt-1 text-sm text-[#6B7A72]">
            Search and browse every exercise in the catalog: videos, instructions, and muscles
            worked. Internal tool, not visible to members.
          </p>
        </Link>

        <Link
          href={'/movement/profile' as Route}
          className="mef-focus-ring mt-3 block rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition hover:bg-[#FAFAF8]"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Movement</p>
          <p className="mt-1 text-[15px] font-medium text-[#1B3A2D]">Movement Profile</p>
          <p className="mt-1 text-sm text-[#6B7A72]">
            The movement record recommendations are built from. A specific client&apos;s profile is
            edited from that client&apos;s own page on the coach dashboard.
          </p>
        </Link>

        <AdminPanel users={users} coachIds={coachIds} assignments={assignments} />
      </main>

    </div>
  );
}
