import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import type { BodyAssessmentType } from '@mef/shared-types-contracts';
import { ASSESSMENT_TYPE_ORDER } from '@/lib/body-assessment/assessmentTypes';
import { AssessmentWizard } from '@/components/body-assessment/AssessmentWizard';

const VALID_TYPES = new Set<BodyAssessmentType>(ASSESSMENT_TYPE_ORDER);

export default async function NewAssessmentPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const requested = searchParams.type;
  if (!requested || !VALID_TYPES.has(requested as BodyAssessmentType)) {
    redirect('/assessment');
  }
  const assessmentType = requested as BodyAssessmentType;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pl-28">
        <Link
          href="/assessment"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back
        </Link>

        <div className="mt-4">
          <AssessmentWizard assessmentType={assessmentType} />
        </div>
      </main>
    </div>
  );
}
