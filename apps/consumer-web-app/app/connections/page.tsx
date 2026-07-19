import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { BackButton } from '@/components/BackButton';
import { getMyWearableConnections } from '@/app/actions/wearables';
import { WEARABLE_PROVIDER_NAMES } from '@/lib/wearables/providers/registry';
import { WearableConnectionCard } from './WearableConnectionCard';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export default async function ConnectionsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  const connections = await getMyWearableConnections();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back" />

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Connected Devices
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6B7A72]">
          Connect a wearable so your coach can see your sleep, recovery, and activity alongside
          everything you already share.
        </p>

        <div className={`${CARD} mt-6 flex items-start gap-3 p-5`}>
          <ShieldCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A2D]/60"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-sm leading-relaxed text-[#1B3A2D]/85">
            We use this information only to personalize your coaching experience. You can disconnect
            a device at any time.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {WEARABLE_PROVIDER_NAMES.map((provider) => (
            <WearableConnectionCard
              key={provider}
              provider={provider}
              connection={connections.find((c) => c.provider === provider) ?? null}
            />
          ))}
        </div>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
