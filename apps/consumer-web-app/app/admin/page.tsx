/**
 * The administrator's front door.
 *
 * WHAT THE COACH SIDE EXPERIENCE PASS FOUND HERE, measured on production
 * on a 390px phone. The page was 3,492px, and about 2,400px of that was
 * nine full-width cards stacked one under another, each carrying a three
 * line paragraph explaining a destination its own title already named.
 * The user list, which is the only thing on this screen an administrator
 * touches more than once a month, started below all nine.
 *
 * The nine are now two groups, in the order they are actually used.
 *   FOUR PLACES with a one line description each, because those four do
 *   need a sentence: "Access" does not say by itself that it is where
 *   people who pay outside the app are handled. The paragraphs are
 *   trimmed to their first useful clause, not deleted.
 *   FIVE TOOLS as tiles, because "Exercise Library" and "Push
 *   notifications: send a test to a real phone" explain themselves, and
 *   three of the five are testing tools that are opened rarely.
 *
 * NOTHING WAS REMOVED. All nine destinations are here, in the same order,
 * to the same href, and the user management panel underneath is untouched
 * apart from where it sits.
 *
 * THE TEST ACCOUNT TOGGLE IS UNCHANGED, deliberately: same `includeTest`
 * query string, same default, same pair of counts underneath, still shared
 * with /admin/access so the two lists cannot disagree about what a hidden
 * account is.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { Beaker, Dumbbell, Compass, BellRing, RotateCcw } from 'lucide-react';
import { listUsers, listActiveCoachUserIds, listAssignmentHistory } from '@/app/actions/admin';
import { AdminPanel } from './AdminPanel';
import { StaffPageHeader } from '@/components/staff/StaffPageHeader';
import { StaffToolGrid, type StaffTool } from '@/components/staff/StaffToolGrid';
import { ChangePasswordLink } from '@/components/auth/ChangePasswordLink';
import { getCachedUser } from '@/lib/supabase/currentUser';

/** The four places an administrator goes to do a job, each with the one clause its title does not already say. */
const DESTINATIONS: { section: string; title: string; blurb: string; href: string }[] = [
  {
    section: 'Access',
    title: 'Member access: tiers, trials, and full access grants',
    blurb:
      'Who can open the app and why. This is where members who pay outside the app are handled.',
    href: '/admin/access',
  },
  {
    section: 'Analytics',
    title: 'Product analytics: overview, funnel, features, drop-off, members',
    blurb:
      "Active members, sessions, where people stop, and each member's own engagement state. Test accounts are excluded unless you turn them on.",
    href: '/admin/analytics',
  },
  {
    section: 'Programs',
    title: 'Blueprint Library: named programs and their versions',
    blurb:
      'Programs MEF authors once and gives to many members. Approve a draft so coaches can assign it, archive one, or duplicate it.',
    href: '/admin/blueprints',
  },
  {
    section: 'Acquisition',
    title: 'Where Your Energy Goes: the funnel',
    blurb:
      'Who reached the public entry experience, who finished it, and who created an account, broken down by the source that sent them.',
    href: '/admin/acquisition',
  },
];

/** The five that explain themselves. Three are testing tools, two are the internal movement tools. */
const TOOLS: StaffTool[] = [
  { label: 'Core Values Snapshot: reset and time-shift', href: '/admin/cvs-test-tools', Icon: Beaker },
  {
    label: 'Personal Reset Plan: grant, reset and time-shift',
    href: '/admin/reset-plan-test-tools',
    Icon: RotateCcw,
  },
  { label: 'Push notifications: send a test', href: '/admin/push-test-tools', Icon: BellRing },
  { label: 'Exercise Library', href: '/exercises', Icon: Dumbbell },
  { label: 'Movement Profile', href: '/movement/profile', Icon: Compass },
];

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: { includeTest?: string };
}) {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  // Same switch, same query string and same default as /admin/access, so
  // the two admin lists behave identically rather than each having its own
  // idea of what a hidden account is.
  const includeTest = searchParams?.includeTest === '1';

  const [userList, coachIds, assignmentList] = await Promise.all([
    listUsers(includeTest),
    listActiveCoachUserIds(),
    listAssignmentHistory(includeTest),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <StaffPageHeader
          title="Admin"
          subtitle="User management, coach roles, and client assignments."
        />

        <section className="mt-6 space-y-3">
          {DESTINATIONS.map((destination) => (
            <Link
              key={destination.href}
              href={destination.href as Route}
              className="mef-focus-ring block rounded-[28px] bg-white p-5 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition hover:bg-[#FAFAF8]"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                {destination.section}
              </p>
              <p className="mt-1 text-[15px] font-medium leading-snug text-[#1B3A2D]">
                {destination.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[#6B7A72]">{destination.blurb}</p>
            </Link>
          ))}
        </section>

        <section className="mt-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            Testing and internal tools
          </p>
          <div className="mt-3">
            <StaffToolGrid tools={TOOLS} label="Testing and internal tools" />
          </div>
        </section>

        <AdminPanel
          users={userList.users}
          hiddenUserCount={userList.hiddenTestCount}
          coachIds={coachIds}
          assignments={assignmentList.assignments}
          hiddenAssignmentCount={assignmentList.hiddenTestCount}
          includeTest={includeTest}
        />

        {/* An account errand, not an administrative one. It was third from
            the top of this page and is now at the foot of it. */}
        <ChangePasswordLink className="mt-8" />
      </main>
    </div>
  );
}
