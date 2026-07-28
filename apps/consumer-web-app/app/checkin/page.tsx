import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import {
  getTodaysCheckin,
  getActiveHabits,
  getHabitLogsForDate,
  getRecentCheckins,
  resolveLocalDate,
  getMyCoachFirstName,
} from '@/app/actions/checkin';
import {
  getTodaysCheckinPlanAction,
  getLocalFollowUpQuestionsAction,
  getProbeAnswersForDateAction,
} from '@/app/actions/dailyCheckinPlan';
import { typicalSleepTimes } from '@/lib/daily-checkin-adaptive/sleepHistory';
import { AvatarLink } from '@/components/AvatarLink';
import { CheckinForm } from './CheckinForm';

/** How many recent days feed the sleep dial's "typical bedtime/wake" pre-fill — same window RECENCY_CAP_DAYS already uses elsewhere in this feature for "how overdue" weighting, reused here for consistency rather than a new arbitrary number. */
const SLEEP_HISTORY_WINDOW_DAYS = 14;

export default async function CheckinPage({ searchParams }: { searchParams: { date?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, timezone')
    .eq('id', user.id)
    .single();

  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';
  const timezone = profile?.timezone ?? 'America/New_York';
  const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const requestedYesterday = searchParams?.date === 'yesterday';
  const localDate = await resolveLocalDate(nowInTz, requestedYesterday);
  const hoursSinceMidnight = nowInTz.getHours() + nowInTz.getMinutes() / 60;
  const canLogYesterday = hoursSinceMidnight < 6;

  const [existingCheckin, habits, habitLogs, priorCheckins, checkinPlan, localFollowUps, initialProbeAnswers, coachFirstName] =
    await Promise.all([
      getTodaysCheckin(localDate),
      getActiveHabits(),
      getHabitLogsForDate(localDate),
      getRecentCheckins(SLEEP_HISTORY_WINDOW_DAYS),
      getTodaysCheckinPlanAction(localDate),
      getLocalFollowUpQuestionsAction('morning'),
      getProbeAnswersForDateAction(localDate),
      getMyCoachFirstName(),
    ]);
  const rotatingProbes = (checkinPlan?.rotatingProbes ?? []).filter((p) => p.screen === 'morning');
  // True only when this member has never completed any check-in before —
  // drives the Milestone 4 first-check-in transition on Dashboard, not
  // just "haven't logged today yet." priorCheckins now fetches
  // SLEEP_HISTORY_WINDOW_DAYS worth of rows (reused below for the sleep
  // dial's typical-time pre-fill) rather than a dedicated 1-row query —
  // an empty result means the same thing either way.
  const isFirstCheckin = existingCheckin === null && priorCheckins.length === 0;
  // Sleep dial pre-fill (task 3c): "seed both handles from her recent
  // check-ins' typical bedtime and wake time." Only ever used as the
  // *initial* state for a fresh (not-yet-answered-today) check-in —
  // CheckinForm falls back to it solely when existingCheckin has no
  // bedtime/wake of its own yet, never overriding a real answer.
  const typicalSleep = typicalSleepTimes(priorCheckins);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF1DE] via-[#F5F0E4] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-12 pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pl-28">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-[2.5rem]">
              {requestedYesterday ? "Yesterday's Morning Readiness" : 'Morning Readiness'}
            </h1>
            {!requestedYesterday && canLogYesterday && (
              <Link
                href={{ pathname: '/checkin', query: { date: 'yesterday' } }}
                className="mef-press shrink-0 rounded-full bg-[#1B3A2D]/[0.06] px-3 py-1 text-xs font-semibold text-[#1B3A2D]"
              >
                Log yesterday
              </Link>
            )}
            {requestedYesterday && (
              <Link
                href="/checkin"
                className="mef-press shrink-0 rounded-full bg-[#1B3A2D]/[0.06] px-3 py-1 text-xs font-semibold text-[#1B3A2D]"
              >
                ← Today
              </Link>
            )}
          </div>
          <AvatarLink firstName={firstName} />
        </div>

        <CheckinForm
          localDate={localDate}
          timezone={timezone}
          existingCheckin={existingCheckin}
          habits={habits}
          initialHabitLogs={habitLogs}
          isFirstCheckin={isFirstCheckin}
          rotatingProbes={rotatingProbes}
          localFollowUps={localFollowUps}
          initialProbeAnswers={initialProbeAnswers}
          coachFirstName={coachFirstName}
          typicalSleep={typicalSleep}
        />
      </main>
    </div>
  );
}
