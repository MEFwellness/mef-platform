import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Bell } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { BackButton } from '@/components/BackButton';
import { getMyNotifications } from '@/app/actions/notifications';
import { NotificationsList } from './NotificationsList';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export default async function NotificationsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, notifications] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    getMyNotifications(50),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Bell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Notifications</p>
        </div>
        <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Notifications
        </h1>

        {notifications.length === 0 ? (
          <section className={`${CARD} mt-6 p-8 text-center`}>
            <p className="text-sm leading-relaxed text-[#6B7A72]">
              Nothing here yet. Coach messages, report updates, and daily briefs will show up in
              this list.
            </p>
          </section>
        ) : (
          <div className={`${CARD} mt-6 p-2`}>
            <NotificationsList notifications={notifications} />
          </div>
        )}
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
