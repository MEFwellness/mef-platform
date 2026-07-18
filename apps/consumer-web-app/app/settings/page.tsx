import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { Settings as SettingsIcon, ChevronRight, User, Bell, Watch } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { BackButton } from '@/components/BackButton';
import { SignOutButton } from '@/components/SignOutButton';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const SETTINGS_LINKS: { label: string; description: string; href: Route; Icon: typeof User }[] = [
  {
    label: 'Account',
    description: 'Name, timezone, and baseline assessment.',
    href: '/profile',
    Icon: User,
  },
  {
    label: 'Notifications',
    description: 'Coach messages, reports, and daily briefs.',
    href: '/notifications',
    Icon: Bell,
  },
  {
    label: 'Connected Devices',
    description: 'Oura, Apple Health, and Google Fit.',
    href: '/connections',
    Icon: Watch,
  },
];

export default async function SettingsPage() {
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
          <SettingsIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Settings</p>
        </div>
        <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Settings
        </h1>

        <div className={`${CARD} mt-6 divide-y divide-[#1B3A2D]/5 p-2`}>
          {SETTINGS_LINKS.map(({ label, description, href, Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-between gap-3 rounded-2xl p-4 transition hover:bg-[#1B3A2D]/[0.03]"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 shrink-0 text-[#1B3A2D]/60" strokeWidth={1.75} aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-[#1B3A2D]">{label}</p>
                  <p className="mt-0.5 text-xs text-[#6B7A72]">{description}</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#1B3A2D]/40" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          ))}
        </div>

        <div className={`${CARD} mt-5 p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">Account</p>
          <p className="mt-2 text-sm text-[#6B7A72]">
            Signed in as <span className="text-[#1B3A2D]">{user.email}</span>
          </p>
          <div className="mt-4">
            <SignOutButton variant="block" />
          </div>
        </div>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
