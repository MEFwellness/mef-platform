/**
 * The coach's member view, first screen.
 *
 * The audit assessed the old version of this page against the six things a
 * coach opens a member to find out and found four of them missing or buried
 * behind roughly thirty flat panels: what is improving, what needs
 * attention, how reliable each finding is, what she is working on, what may
 * be getting in the way, and what to ask next.
 *
 * Those six are now the whole first screen, in that order, read entirely
 * from the Member Interpretation Layer, the Visibility Layer, the Priority
 * Card engine and the safety system. Nothing here computes a verdict, which
 * is what keeps this screen and her own screens from disagreeing.
 *
 * Nothing was deleted. Every panel that used to be here is on ./detail,
 * unchanged, including the Visibility Layer's "what her app contains" panel
 * from the previous build, which is also linked directly below.
 */

import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import type { Profile } from '@mef/shared-types-contracts';
import { getClientCoachAlerts } from '@/app/actions/intelligence-engine';
import { resolveLocalDate } from '@/app/actions/checkin';
import { buildCoachDashboard } from '@/lib/coach-dashboard/build';
import { CoachDashboardView } from './CoachDashboardView';
import { TestAccountChip } from '@/components/staff/TestAccountChip';
import { getCachedUser } from '@/lib/supabase/currentUser';

export default async function ClientDashboardPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  // RLS (coach_read_assigned_client_profile, migration 16) is what actually
  // enforces this — an id for a client this coach isn't assigned to simply
  // returns no row, not a permissions error, so this is a clean 404.
  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', params.id)
    .single();
  if (!clientProfile) notFound();

  const profile = clientProfile as Profile;
  const firstName = profile.display_name?.split(' ')[0] ?? 'This client';

  // Her local date, not the server's. Every layer below is keyed on it.
  const localDate = await resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: profile.timezone })),
    false
  );

  // Persisted alert rows, reshaped to the two fields this screen reads.
  // The tier is derived from `alert_type`, which is a stored column, so an
  // alert written months ago tiers exactly the way one written today does.
  const coachAlerts = (await getClientCoachAlerts(profile.id)).map((a) => ({
    alertType: a.alert_type,
    alertKey: a.alert_key,
    title: a.title,
    reason: a.reason,
  }));
  const dashboard = await buildCoachDashboard({
    supabase,
    memberId: profile.id,
    firstName,
    localDate,
    coachAlerts,
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href="/coach"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to clients
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            {profile.display_name ?? 'Unnamed client'}
          </h1>
          {profile.is_test ? <TestAccountChip /> : null}
        </div>
        <p className="mt-1 text-sm text-[#6B7A72]">
          {dashboard.loggedDays} logged day{dashboard.loggedDays === 1 ? '' : 's'} in the last{' '}
          {dashboard.loggedDaysWindow} days behind everything below.
        </p>

        {/* "What she entered" stays above the interpretation, for the same
            reason it always did: what she actually said is the question a
            coach opens a member to answer, and everything below is derived
            from it. */}
        <Link
          href={`/coach/clients/${params.id}/entries` as Route}
          data-member-entries-link="true"
          className="mef-focus-ring mt-5 flex items-center justify-between gap-4 rounded-[28px] bg-white px-5 py-4 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition-colors hover:bg-[#1B3A2D]/[0.03]"
        >
          <span>
            <span className="block text-sm font-semibold uppercase tracking-wider text-[#3E5C46]">
              What {firstName} entered
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-[#6B7A72]">
              Her check-in answers day by day, her stated goals, what she has completed, and her
              conversations with Root. Nothing scored or inferred.
            </span>
          </span>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-[#6B7A72]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </Link>

        {/* The Visibility Layer's panel keeps a direct route from the first
            screen. It is on ./detail too, and it is the one panel a coach
            reaches for deliberately rather than scrolls past. */}
        <Link
          href={`/coach/clients/${params.id}/detail#member-visibility` as Route}
          data-visibility-link="true"
          className="mef-focus-ring mt-4 flex items-center justify-between gap-4 rounded-[28px] bg-white px-5 py-4 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition-colors hover:bg-[#1B3A2D]/[0.03]"
        >
          <span className="flex items-center gap-2">
            <Layers className="h-4 w-4 shrink-0 text-[#3E5C46]" strokeWidth={1.75} aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold uppercase tracking-wider text-[#3E5C46]">
                What {firstName}&apos;s app contains
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-[#6B7A72]">
                Every feature, shown or hidden, and the reason for each.
              </span>
            </span>
          </span>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-[#6B7A72]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </Link>

        <div className="mt-6">
          <CoachDashboardView dashboard={dashboard} memberId={profile.id} />
        </div>
      </main>
    </div>
  );
}
