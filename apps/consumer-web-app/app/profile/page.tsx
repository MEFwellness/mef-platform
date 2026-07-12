import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { signOut } from '@/app/actions/auth';
import { BottomNav } from '@/components/BottomNav';
import { ProfileForm } from './ProfileForm';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, timezone')
    .eq('id', user.id)
    .single();

  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-[#F5B700] bg-white text-lg font-medium text-[#1B3A2D]">
            {firstName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-4xl">
              Profile
            </h1>
            <p className="text-[15px] text-[#6B7A72]">{user.email}</p>
          </div>
        </div>

        <div className={`${CARD} mt-7 p-6`}>
          <ProfileForm
            displayName={profile?.display_name ?? ''}
            timezone={profile?.timezone ?? 'America/New_York'}
          />
        </div>

        <div className={`${CARD} mt-5 p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Account</p>
          <p className="mt-2 text-sm text-[#6B7A72]">
            Signed in as <span className="text-[#1B3A2D]">{user.email}</span>
          </p>
          <form action={signOut} className="mt-4">
            <button
              type="submit"
              className="w-full rounded-full border border-[#1B3A2D]/10 px-4 py-2.5 text-sm font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/30"
            >
              Sign out
            </button>
          </form>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
