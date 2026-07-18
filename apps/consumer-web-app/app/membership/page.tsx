import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Gem, HeartPulse, Sparkles, Activity, UtensilsCrossed, ScanFace, Mail } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { BackButton } from '@/components/BackButton';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const INCLUDED: { label: string; Icon: typeof HeartPulse }[] = [
  { label: 'Daily Root Score and cross-domain trends', Icon: Sparkles },
  { label: 'Root — your always-on wellness coach', Icon: HeartPulse },
  { label: 'Guided posture and movement assessments', Icon: ScanFace },
  { label: 'Movement Intelligence, adapted to your recovery', Icon: Activity },
  { label: 'Food Lens meal coaching and label scanning', Icon: UtensilsCrossed },
];

export default async function MembershipPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Gem className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Membership</p>
        </div>
        <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Your Rooted Reset membership
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6B7A72]">
          Signed in as <span className="text-[#1B3A2D]">{user.email}</span>.
        </p>

        <div className={`${CARD} mt-6 p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            What&apos;s Included
          </p>
          <div className="mt-4 space-y-4">
            {INCLUDED.map(({ label, Icon }) => (
              <div key={label} className="flex items-start gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]/50" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm leading-relaxed text-[#1B3A2D]">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={`${CARD} mt-5 flex items-start gap-3 p-6`}>
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A2D]/60" strokeWidth={1.75} aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-[#1B3A2D]">Billing questions</p>
            <p className="mt-1.5 text-sm leading-relaxed text-[#6B7A72]">
              For plan, billing, or renewal questions, reach our team at{' '}
              <a
                href="mailto:support@mefwellness.com"
                className="font-medium text-[#1B3A2D] underline underline-offset-2"
              >
                support@mefwellness.com
              </a>
              .
            </p>
          </div>
        </div>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
