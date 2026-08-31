/**
 * Push notifications, admin testing tools. Not linked anywhere a member or
 * coach can see; reachable only from the Admin page, and every action
 * behind it requires an active platform_administrator role (checked here
 * for a clean redirect, enforced for real by RLS, see
 * app/actions/pushNotificationsAdmin.ts's own header comment).
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import {
  isPushSendingConfiguredAction,
  listPushTestableMembersAction,
} from '@/app/actions/pushNotificationsAdmin';
import { BackButton } from '@/components/BackButton';
import { PushTestToolsPanel } from '@/components/admin/PushTestToolsPanel';
import { getCachedUser } from '@/lib/supabase/currentUser';

export default async function PushTestToolsPage() {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (!isAdmin) redirect('/dashboard');

  const [members, sendingConfigured] = await Promise.all([
    listPushTestableMembersAction(),
    isPushSendingConfiguredAction(),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/admin" label="Back to Admin" forceFallback />

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
          Push Notifications: Test Tools
        </h1>
        <p className="mt-2 text-[15px] text-[#6B7A72]">
          Send one real notification to one member&apos;s phone, right now, so you can see it arrive
          before anything is scheduled. Nothing on this platform sends notifications on a schedule
          yet.
        </p>

        <PushTestToolsPanel members={members} sendingConfigured={sendingConfigured} />
      </main>
    </div>
  );
}
