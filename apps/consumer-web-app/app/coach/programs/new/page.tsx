import { redirect } from 'next/navigation';
import { Dumbbell } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';
import { NewProgramForm } from '@/components/coach-program-builder/NewProgramForm';

export default async function NewProgramPage({
  searchParams,
}: {
  searchParams: { forClient?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (!isCoach) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/coach/programs" label="Program Library" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Dumbbell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">New Program</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            New Program
          </h1>
        </div>

        <div className="mt-7">
          <NewProgramForm forClientId={searchParams.forClient} />
        </div>
      </main>

      <BottomNav isCoach />
    </div>
  );
}
