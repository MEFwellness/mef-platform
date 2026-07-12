import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import {
  getTodaysCheckin,
  getActiveHabits,
  getHabitLogsForDate,
  resolveLocalDate,
} from '@/app/actions/checkin';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { CheckinForm } from './CheckinForm';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export default async function CheckinPage({ searchParams }: { searchParams: { date?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single();
  const isCoach = await hasActiveRole(supabase, user.id, 'coach');

  const timezone = profile?.timezone ?? 'America/New_York';
  const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const requestedYesterday = searchParams?.date === 'yesterday';
  const localDate = await resolveLocalDate(nowInTz, requestedYesterday);
  const hoursSinceMidnight = nowInTz.getHours() + nowInTz.getMinutes() / 60;
  const canLogYesterday = hoursSinceMidnight < 6;

  const [existingCheckin, habits, habitLogs] = await Promise.all([
    getTodaysCheckin(localDate),
    getActiveHabits(),
    getHabitLogsForDate(localDate),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          {requestedYesterday ? "Yesterday's check-in" : "Today's check-in"}
        </h1>
        <p className="mt-2 text-[15px] text-[#6B7A72]">
          {existingCheckin
            ? "You've already logged this day — update anything below."
            : 'Takes about a minute. Every field is optional except mood, sleep quality, energy, and stress.'}
        </p>

        {!requestedYesterday && canLogYesterday && (
          <Link
            href={{ pathname: '/checkin', query: { date: 'yesterday' } }}
            className="mt-2 inline-block text-sm font-medium text-[#854D0E] underline underline-offset-2"
          >
            Actually logging for yesterday?
          </Link>
        )}
        {requestedYesterday && (
          <Link
            href="/checkin"
            className="mt-2 inline-block text-sm font-medium text-[#854D0E] underline underline-offset-2"
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
          cardClassName={CARD}
        />
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
