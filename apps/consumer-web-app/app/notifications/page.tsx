import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Bell } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { BackButton } from '@/components/BackButton';
import { getMyNotifications } from '@/app/actions/notifications';
import { NotificationsList } from './NotificationsList';
import { memberTimezone } from '@/lib/time/memberToday';
import { CenterStage, Card } from '@/components/layout';
import { Breathe } from '@/components/motion/Breathe';

export default async function NotificationsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, notifications, timeZone] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    getMyNotifications(50),
    // Her own zone, so "Aug 27" is the day she got it and both render
    // passes agree on the string. See lib/time/displayDate.ts.
    memberTimezone(supabase, user.id),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Bell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Notifications</p>
        </div>
        <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Notifications
        </h1>

        {notifications.length === 0 ? (
          <CenterStage>
            <Card as="section" className="mef-animate-in text-center">
              <Breathe speed="waiting" className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#1B3A2D]/[0.06] text-[#1B3A2D]">
                <Bell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </Breathe>
              <p className="mt-4 text-sm leading-relaxed text-[#6B7A72]">
                I don&apos;t have anything to tell you yet. Coach messages, report updates, and your
                daily brief will land here the moment there&apos;s something worth showing you.
              </p>
            </Card>
          </CenterStage>
        ) : (
          <Card className="mt-6 !p-2">
            <NotificationsList notifications={notifications} timeZone={timeZone} />
          </Card>
        )}
      </main>

      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
