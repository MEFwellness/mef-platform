import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import {
  getTodaysCheckin,
  getActiveHabits,
  getHabitLogsForDate,
  getRecentCheckins,
  resolveLocalDate,
} from '@/app/actions/checkin';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { AvatarLink } from '@/components/AvatarLink';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { RootQuickLink } from '@/components/RootQuickLink';
import { CheckInModeSwitch } from '@/components/checkin/CheckInModeSwitch';
import { buildCheckinEntryContext } from '@/lib/conversation-coach/entryContext';
import { CheckinForm } from './CheckinForm';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export default async function CheckinPage({ searchParams }: { searchParams: { date?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, isCoach] = await Promise.all([
    supabase.from('profiles').select('display_name, timezone').eq('id', user.id).single(),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';
  const timezone = profile?.timezone ?? 'America/New_York';
  const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const requestedYesterday = searchParams?.date === 'yesterday';
  const localDate = await resolveLocalDate(nowInTz, requestedYesterday);
  const hoursSinceMidnight = nowInTz.getHours() + nowInTz.getMinutes() / 60;
  const canLogYesterday = hoursSinceMidnight < 6;

  const [existingCheckin, habits, habitLogs, priorCheckins] = await Promise.all([
    getTodaysCheckin(localDate),
    getActiveHabits(),
    getHabitLogsForDate(localDate),
    getRecentCheckins(1),
  ]);
  // True only when this member has never completed any check-in before —
  // drives the Milestone 4 first-check-in transition on Dashboard, not
  // just "haven't logged today yet."
  const isFirstCheckin = existingCheckin === null && priorCheckins.length === 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            {requestedYesterday ? "Yesterday's Morning Readiness" : 'Morning Readiness'}
          </h1>
          <AvatarLink firstName={firstName} />
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6B7A72]">
          {existingCheckin
            ? "You've already logged this day. Update anything below."
            : 'A few gentle questions so Root understands how today actually feels. Takes about a minute. This stands on its own. Nothing here depends on an evening reflection.'}
        </p>
        <CheckInModeSwitch active="morning" />

        {!requestedYesterday && canLogYesterday && (
          <Link
            href={{ pathname: '/checkin', query: { date: 'yesterday' } }}
            className="mt-2 inline-block text-sm font-medium text-[#6B7A72] underline underline-offset-2"
          >
            Actually logging for yesterday?
          </Link>
        )}
        {requestedYesterday && (
          <Link
            href="/checkin"
            className="mt-2 inline-block text-sm font-medium text-[#6B7A72] underline underline-offset-2"
          >
            ← Back to today
          </Link>
        )}

        <CheckinForm
          localDate={localDate}
          timezone={timezone}
          existingCheckin={existingCheckin}
          habits={habits}
          initialHabitLogs={habitLogs}
          isFirstCheckin={isFirstCheckin}
        />

        <section className={`${CARD} mt-5 p-5`}>
          <p className="text-sm font-medium text-[#1B3A2D]">Want to talk it through instead?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <RootQuickLink
              entryPoint="checkin_feeling"
              entryContext={buildCheckinEntryContext(!!existingCheckin)}
            >
              I want to explain how I&apos;m feeling
            </RootQuickLink>
            <RootQuickLink
              entryPoint="checkin_explain"
              entryContext={buildCheckinEntryContext(!!existingCheckin)}
            >
              Something affected my answers today
            </RootQuickLink>
          </div>
        </section>
      </main>

      <BottomNav isCoach={isCoach} />

      <FloatingCoachLauncher
        entryPoint="checkin_feeling"
        entryContext={buildCheckinEntryContext(!!existingCheckin)}
      />
    </div>
  );
}
