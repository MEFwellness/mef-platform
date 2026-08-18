/**
 * Assign a Program — step one: pick the member.
 *
 * The unified door. Everything a coach can put in front of a member starts
 * here: a named program MEF authored, or a corrective program generated
 * from that member's own findings. The corrective screens are not moved or
 * wrapped by this. /coach/corrective-programs still works exactly as
 * coaches know it, and this flow hands off to it by name.
 */
import { redirect } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BackButton } from '@/components/BackButton';
import { listAssignedClients } from '@/app/actions/coach';
import { MemberPickerPanel } from '@/components/coach/MemberPickerPanel';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export const dynamic = 'force-dynamic';

export default async function AssignProgramPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (!isCoach) redirect('/dashboard');

  const clients = await listAssignedClients();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/coach" label="Coach Dashboard" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Assign a Program</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Assign a Program
          </h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Pick a client. You will see what she has told you and what she is already on, then
            choose a named program or build a corrective one from her findings.
          </p>
        </div>

        <div className="mt-7">
          {clients.length > 0 ? (
            <MemberPickerPanel
              basePath="/coach/assign"
              clients={clients.map((c) => ({ id: c.id, name: c.display_name ?? 'Unnamed client' }))}
            />
          ) : (
            <div className={`${CARD} p-6`}>
              <p className="text-sm text-[#6B7A72]">No clients are currently assigned to you.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
