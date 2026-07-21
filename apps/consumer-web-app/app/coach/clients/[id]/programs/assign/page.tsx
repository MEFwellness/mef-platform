import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Dumbbell } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { BottomNav } from '@/components/BottomNav';
import { listMyProgramTemplatesAction } from '@/app/actions/coach-programs';
import { AssignProgramPanel } from '@/components/coach-program-builder/AssignProgramPanel';

export default async function AssignProgramPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', params.id)
    .single();
  if (!clientProfile) notFound();
  const firstName = clientProfile.display_name?.split(' ')[0] ?? 'This client';

  const templates = await listMyProgramTemplatesAction({ status: 'active' });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href={`/coach/clients/${params.id}/programs`}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back
        </Link>

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Dumbbell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Assign a Program</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Assign to {firstName}
          </h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Assigning creates a frozen snapshot — future edits to the program template will never
            change what {firstName} sees for this assignment.
          </p>
        </div>

        <div className="mt-7">
          <AssignProgramPanel clientId={params.id} templates={templates} />
        </div>
      </main>

      <BottomNav isCoach />
    </div>
  );
}
