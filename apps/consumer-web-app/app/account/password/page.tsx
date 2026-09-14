import { redirect } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { BackButton } from '@/components/BackButton';
import { Card } from '@/components/layout';
import { ChangePasswordForm } from './ChangePasswordForm';
import { getCachedUser } from '@/lib/supabase/currentUser';

export const dynamic = 'force-dynamic';

/**
 * Change password, for whoever is signed in.
 *
 * Deliberately role-neutral and deliberately outside /profile, /coach and
 * /admin: it reads no role, renders no role-specific chrome, and is gated by
 * nothing but having a session. A member, a coach and an administrator all
 * land on this same screen from their own part of the app, which is what
 * "one shared flow, not three" has to mean in practice. middleware.ts leaves
 * /account alone for exactly that reason.
 *
 * The back control falls back to /profile only when there is no history to
 * go back to, so a coach or administrator who arrived from their own area
 * returns there rather than being dropped into the member profile.
 */
export default async function ChangePasswordPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pl-28">
        <BackButton fallbackHref="/profile" label="Back" />

        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#F5B700] bg-white text-[#1B3A2D]">
            <KeyRound className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-4xl">
              Change password
            </h1>
            <p className="text-[15px] text-[#6B7A72]">{user.email}</p>
          </div>
        </div>

        <Card className="mt-7">
          <ChangePasswordForm />
        </Card>
      </main>
    </div>
  );
}
