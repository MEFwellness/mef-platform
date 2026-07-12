import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getMyAssessmentById } from '@/app/actions/onboarding';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { BaselineAssessmentView } from '@/components/BaselineAssessmentView';

const DESCRIPTION =
  'This reassessment reflects the information you shared at this point in time — compare it with your Baseline Assessment to see how things have changed.';

export default async function ReassessmentDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const isCoach = await hasActiveRole(supabase, user.id, 'coach');

  const assessment = await getMyAssessmentById(params.id);
  if (!assessment) notFound();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href="/profile/reassessments"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to progress
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Reassessment
        </h1>

        <div className="mt-6">
          <BaselineAssessmentView baseline={assessment} description={DESCRIPTION} />
        </div>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
