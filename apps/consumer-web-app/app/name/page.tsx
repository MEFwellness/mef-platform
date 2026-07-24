import Image from 'next/image';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NameForm } from './NameForm';

/**
 * The one-time "what should we call you" prompt reached via the auth
 * callback's redirect (app/api/auth/callback/route.ts) immediately after a
 * brand-new member verifies their email — the account already exists by
 * the time this renders, which is the whole point (the old signup form
 * asked for this before the account existed; see app/actions/auth.ts's
 * signUp() comment). Not in middleware.ts's PUBLIC_PATHS, so an
 * unauthenticated visitor is already redirected to /login before this
 * ever renders; the check below is defense-in-depth, matching every other
 * authenticated page in this app.
 */
export default async function NamePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();

  // Already set — e.g. a member revisiting this URL after skipping once
  // and setting it later from /profile, or a direct navigation. Nothing
  // to do here; send them into the normal routing hub.
  if (profile?.display_name) redirect('/');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] px-5 py-12 font-[family-name:var(--font-dm-sans)]">
      <main className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          <Image
            src="/images/rooted-reset-logo.png"
            alt="Rooted Reset"
            width={36}
            height={36}
            style={{ objectFit: 'contain', borderRadius: '8px' }}
          />
          <div className="leading-tight">
            <span className="block font-[family-name:var(--font-cormorant-garamond)] text-lg tracking-wide text-[#1B3A2D]">
              Rooted Reset
            </span>
            <span className="block text-[11px] font-medium uppercase tracking-wider text-[#6B7A72]">
              by MEF Wellness
            </span>
          </div>
        </div>

        <div className="rounded-[28px] bg-white p-7 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
          <NameForm />
        </div>
      </main>
    </div>
  );
}
