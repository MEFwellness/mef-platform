import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, CalendarClock } from 'lucide-react';
import { getMyAssessmentHistory, getMyProgressComparison } from '@/app/actions/onboarding';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { AssessmentComparisonView } from '@/components/AssessmentComparisonView';
import { AssessmentHistoryList } from '@/components/AssessmentHistoryList';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/** local_date is a plain YYYY-MM-DD calendar string — Date.UTC keeps this pure calendar arithmetic, no timezone involved. Same pattern used throughout app/dashboard and app/coach. */
function addDaysToLocalDate(localDate: string, days: number): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return date.toISOString().slice(0, 10);
}

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function ReassessmentsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const isCoach = await hasActiveRole(supabase, user.id, 'coach');

  const [history, comparison] = await Promise.all([
    getMyAssessmentHistory(),
    getMyProgressComparison(),
  ]);

  const hasBaseline = comparison.baseline !== null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href="/profile"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to profile
        </Link>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Progress & Reassessments
          </h1>
          {hasBaseline && (
            <Link
              href="/profile/reassessments/new"
              className="flex items-center justify-center rounded-full bg-[#1B3A2D] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Start a new reassessment
            </Link>
          )}
        </div>
        <p className="mt-2 text-[15px] text-[#6B7A72]">
          See how things have changed since your Baseline Assessment, and complete a new
          reassessment whenever you&apos;re ready.
        </p>

        {!hasBaseline ? (
          <div className={`${CARD} mt-6 p-6`}>
            <p className="text-sm leading-relaxed text-[#6B7A72]">
              You haven&apos;t completed your onboarding assessment yet.{' '}
              <Link
                href="/onboarding"
                className="font-medium text-[#6B7A72] underline underline-offset-2"
              >
                Complete it now
              </Link>{' '}
              to start tracking progress over time.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <AssessmentComparisonView
              metrics={comparison.metrics}
              summary={comparison.summary}
              hasLatest={comparison.latest !== null}
            />

            {comparison.baseline && comparison.latest === null && (
              <section className={`${CARD} p-6`}>
                <div className="flex items-center gap-2 text-[#6B7A72]">
                  <CalendarClock className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-sm font-semibold uppercase tracking-wider">
                    Suggested Check-in Windows
                  </p>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
                  Many members find it helpful to reassess around 30 and 90 days after their
                  baseline — {formatDate(addDaysToLocalDate(comparison.baseline.localDate, 30))} and{' '}
                  {formatDate(addDaysToLocalDate(comparison.baseline.localDate, 90))} for you.
                  Reminders aren&apos;t built yet, so start whenever you&apos;re ready.
                </p>
              </section>
            )}

            <AssessmentHistoryList
              history={history}
              baselineHref="/profile/baseline"
              reassessmentHref={(id) => `/profile/reassessments/${id}`}
            />
          </div>
        )}
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
