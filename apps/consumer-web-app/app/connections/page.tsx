import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { BackButton } from '@/components/BackButton';
import { getMyWearableConnections } from '@/app/actions/wearables';
import { WEARABLE_PROVIDER_NAMES } from '@/lib/wearables/providers/registry';
import { WearableConnectionCard } from './WearableConnectionCard';
import { memberTimezone } from '@/lib/time/memberToday';
import { Card } from '@/components/layout';

export default async function ConnectionsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, connections, timeZone] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    getMyWearableConnections(),
    // "Last synced" is her clock, not the server's. See lib/time/displayDate.ts.
    memberTimezone(supabase, user.id),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back" />

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Connected Devices
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#4F645A]">
          Connect a wearable so your coach can see your sleep, recovery, and activity alongside
          everything you already share.
        </p>

        <Card className="mt-6 flex items-start gap-3">
          <ShieldCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A2D]/60"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-sm leading-relaxed text-[#1B3A2D]/85">
            We use this information only to personalize your coaching experience. You can disconnect
            a device at any time.
          </p>
        </Card>

        <div className="mt-6 space-y-4">
          {WEARABLE_PROVIDER_NAMES.map((provider) => (
            <WearableConnectionCard
              key={provider}
              provider={provider}
              connection={connections.find((c) => c.provider === provider) ?? null}
              timeZone={timeZone}
            />
          ))}
        </div>
      </main>

      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
