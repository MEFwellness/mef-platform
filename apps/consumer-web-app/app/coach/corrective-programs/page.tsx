/**
 * Corrective Programs — entry screen. Pick a client, then generate/review
 * their corrective program drafts on the next screen
 * (/coach/corrective-programs/[memberId]). Reached from the coach
 * dashboard card, same "no persistent nav, reached from /coach" convention
 * as Program Library/Generate/Question Bank.
 */
import { redirect } from 'next/navigation';
import { Activity } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BackButton } from '@/components/BackButton';
import { listAssignedClients } from '@/app/actions/coach';
import { MemberPickerPanel } from '@/components/coach/MemberPickerPanel';
import { getCachedUser } from '@/lib/supabase/currentUser';

export default async function CorrectiveProgramsPage() {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (!isCoach) redirect('/dashboard');

  const clients = await listAssignedClients();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/coach" label="Coach Dashboard" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Activity className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Corrective Programs</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Corrective Programs
          </h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Pick a client to generate a 4-week corrective program from their posture assessment
            findings, review it, and assign it.
          </p>
        </div>

        <div className="mt-7">
          {clients.length > 0 ? (
            <MemberPickerPanel
              basePath="/coach/corrective-programs"
              clients={clients.map((c) => ({
                id: c.id,
                name: c.display_name ?? 'Unnamed client',
                isTest: Boolean(c.is_test),
              }))}
            />
          ) : (
            <div className="rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
              <p className="text-sm text-[#6B7A72]">No clients are currently assigned to you.</p>
            </div>
          )}
        </div>
      </main>

    </div>
  );
}
