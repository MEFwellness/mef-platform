/**
 * Evening Reflection — always accessible, never hour-gated. No check here
 * against time of day: a member can open and complete this at 9am if they
 * want to, same as at 9pm. It may be surfaced more prominently in the
 * evening elsewhere (see the dashboard's time-aware quick action), but
 * this page itself never refuses to render.
 */

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTodaysEveningReflection, getTomorrowsForecastPrediction } from '@/app/actions/eveningReflection';
import { getRecentCheckins } from '@/app/actions/checkin';
import {
  getTodaysCheckinPlanAction,
  getLocalFollowUpQuestionsAction,
  getProbeAnswersForDateAction,
} from '@/app/actions/dailyCheckinPlan';
import { todaysLocalDate } from '@/lib/time/localDate';
import { AvatarLink } from '@/components/AvatarLink';
import { firstNameFrom } from '@/lib/profile/greeting';
import { EveningReflectionForm } from './EveningReflectionForm';
import { memberProfileCore } from '@/lib/member/profileCore';
import { getCachedUser } from '@/lib/supabase/currentUser';

export default async function EveningReflectionPage() {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const profile = await memberProfileCore(supabase, user.id);
  const timezone = profile.timezone ?? 'America/New_York';
  const localDate = todaysLocalDate(timezone);

  const [existing, checkinPlan, localFollowUps, initialProbeAnswers, existingForecastLevel, priorCheckins] =
    await Promise.all([
      getTodaysEveningReflection(),
      getTodaysCheckinPlanAction(localDate),
      getLocalFollowUpQuestionsAction('evening'),
      getProbeAnswersForDateAction(localDate),
      getTomorrowsForecastPrediction(),
      getRecentCheckins(1),
    ]);
  const rotatingProbes = (checkinPlan?.rotatingProbes ?? []).filter((p) => p.screen === 'evening');

  const firstName = firstNameFrom(profile.displayName);
  // Same "never touched any check-in before" signal the morning page
  // computes — cinematic mode applies here too on the rare chance her
  // very first-ever check-in happens to be an evening one.
  const isFirstCheckin = existing === null && priorCheckins.length === 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1B3A2D]/[0.09] via-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-12 pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pl-28">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-[2.5rem]">
            Evening Reflection
          </h1>
          <AvatarLink firstName={firstName} />
        </div>

        <EveningReflectionForm
          existing={existing}
          localDate={localDate}
          rotatingProbes={rotatingProbes}
          localFollowUps={localFollowUps}
          initialProbeAnswers={initialProbeAnswers}
          existingForecastLevel={existingForecastLevel}
          isFirstCheckin={isFirstCheckin}
        />
      </main>
    </div>
  );
}
