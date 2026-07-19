/**
 * Evening Reflection — always accessible, never hour-gated. No check here
 * against time of day: a member can open and complete this at 9am if they
 * want to, same as at 9pm. It may be surfaced more prominently in the
 * evening elsewhere (see the dashboard's time-aware quick action), but
 * this page itself never refuses to render.
 */

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTodaysEveningReflection } from '@/app/actions/eveningReflection';
import { getTodaysCheckin } from '@/app/actions/checkin';
import { todaysLocalDate } from '@/lib/time/localDate';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { AvatarLink } from '@/components/AvatarLink';
import { CheckInModeSwitch } from '@/components/checkin/CheckInModeSwitch';
import { EveningReflectionForm } from './EveningReflectionForm';

export default async function EveningReflectionPage() {
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
  const timezone = profile?.timezone ?? 'America/New_York';
  const localDate = todaysLocalDate(timezone);

  const [isCoach, existing, todaysCheckin] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    getTodaysEveningReflection(),
    getTodaysCheckin(localDate),
  ]);

  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Evening Reflection
          </h1>
          <AvatarLink firstName={firstName} />
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6B7A72]">
          {existing
            ? "You've already reflected on today. Update anything below."
            : 'A short close to the day. Available any time, morning or night. Your Morning Readiness never depends on this.'}
        </p>
        <CheckInModeSwitch active="evening" />

        <EveningReflectionForm
          existing={existing}
          localDate={localDate}
          timezone={timezone}
          todaysCheckin={todaysCheckin}
        />
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
