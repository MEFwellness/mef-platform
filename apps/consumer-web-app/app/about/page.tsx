import Image from 'next/image';
import { redirect } from 'next/navigation';
import { Info, Mail } from 'lucide-react';
import { getStaffRoles } from '@/lib/auth/staffRoles';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { BackButton } from '@/components/BackButton';
import { getCachedUser } from '@/lib/supabase/currentUser';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const APP_VERSION = '0.1.0';

export default async function AboutPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  // Role-neutral screen: members, coaches and administrators all reach it.
  // Whoever this is gets their own bar, so a coach or an administrator is
  // never handed a member tab here.
  const { isCoach, isAdmin } = await getStaffRoles();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Info className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">About</p>
        </div>

        <div className={`${CARD} mt-6 flex flex-col items-center p-8 text-center`}>
          <Image
            src="/images/rooted-reset-logo.png"
            alt="Rooted Reset"
            width={56}
            height={56}
            style={{ objectFit: 'contain', borderRadius: '12px' }}
          />
          <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
            Rooted Reset
          </h1>
          <p className="mt-1 text-xs font-medium uppercase tracking-wider text-[#6B7A72]">
            by MEF Wellness
          </p>
          <p className="mt-4 text-sm leading-relaxed text-[#6B7A72]">
            Daily wellness check-ins, trends, and coaching, built around your history, focused on
            your future.
          </p>
          <p className="mt-4 text-xs text-[#6B7A72]/70">Version {APP_VERSION}</p>
        </div>

        <div className={`${CARD} mt-5 flex items-start gap-3 p-6`}>
          <Mail
            className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A2D]/60"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold text-[#1B3A2D]">Get in touch</p>
            <p className="mt-1.5 text-sm leading-relaxed text-[#6B7A72]">
              <a
                href="mailto:support@mefwellness.com"
                className="font-medium text-[#1B3A2D] underline underline-offset-2"
              >
                support@mefwellness.com
              </a>
            </p>
          </div>
        </div>
      </main>

      <MemberBottomNav isCoach={isCoach} isAdmin={isAdmin} />
    </div>
  );
}
