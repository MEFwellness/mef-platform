/**
 * The end-of-phase review, for one member and one program.
 *
 * Opening this screen OPENS a review (or returns the one already open) and
 * writes nothing else. Everything a coach can do from here is a button on
 * the panel below, and every one of those buttons produces a draft she then
 * has to approve separately.
 *
 * Reachable early. A coach who wants to look at week 2 of a four week
 * program can, and the review records that she opened it early rather than
 * pretending the phase was over.
 */

import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ClipboardCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getClientProgramAssignmentSummariesAction } from '@/app/actions/coach-programs';
import { openProgramReviewAction } from '@/app/actions/program-review';
import { buildCoachProgramGroups } from '@/lib/program-lifecycle/coachView';
import { ProgramReviewPanel } from '@/components/coach-program-builder/ProgramReviewPanel';
import { memberTodayLocalDate } from '@/lib/time/memberToday';
import { getCachedUser } from '@/lib/supabase/currentUser';

export default async function ProgramPhaseReviewPage({
  params,
}: {
  params: { id: string; groupKey: string };
}) {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', params.id)
    .single();
  if (!clientProfile) notFound();
  const firstName = clientProfile.display_name?.split(' ')[0] ?? 'This client';

  const groupKey = decodeURIComponent(params.groupKey);
  const summaries = await getClientProgramAssignmentSummariesAction(params.id);
  const group = buildCoachProgramGroups(summaries).find((g) => g.groupKey === groupKey);
  if (!group) notFound();

  // Resolved on the server, in the member's own timezone, so the start-date
  // field renders the same on both passes. See lib/time/memberToday.ts.
  const memberToday = await memberTodayLocalDate(supabase, params.id);

  const result = await openProgramReviewAction({
    memberId: params.id,
    groupKey,
    programName: group.name,
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href={`/coach/clients/${params.id}/programs`}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to {firstName}&apos;s programs
        </Link>

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <ClipboardCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">End of phase review</p>
        </div>

        <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          {group.name}
        </h1>

        <div className="mt-7">
          {'error' in result ? (
            <p className="rounded-[28px] bg-white p-5 text-sm text-[#1B3A2D] shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
              {result.error}
            </p>
          ) : (
            <ProgramReviewPanel
              firstName={firstName}
              screen={result}
              programsHref={`/coach/clients/${params.id}/programs`}
              defaultStartDate={group.endDate ? nextDay(group.endDate) : null}
              memberToday={memberToday}
            />
          )}
        </div>
      </main>
    </div>
  );
}

/** The day after a date, in plain YYYY-MM-DD. The next phase starts the day the last one ended, plus one. */
function nextDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + 1));
  return date.toISOString().slice(0, 10);
}
