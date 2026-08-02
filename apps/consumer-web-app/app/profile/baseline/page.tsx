import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getMyBaselineAssessment } from '@/app/actions/onboarding';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { buildAssessmentEntryContext } from '@/lib/conversation-coach/entryContext';
import { BaselineAssessmentView } from '@/components/BaselineAssessmentView';
import { CenterStage, Card } from '@/components/layout';

const DESCRIPTION =
  'Your Baseline Assessment reflects the information you shared when you first joined. It gives you and your coach a starting point for measuring progress over time.';

export default async function BaselineAssessmentPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const isCoach = await hasActiveRole(supabase, user.id, 'coach');

  const baseline = await getMyBaselineAssessment();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href="/profile"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to profile
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Baseline Assessment
        </h1>

        {baseline ? (
          <div className="mt-6">
            <BaselineAssessmentView baseline={baseline} description={DESCRIPTION} />
          </div>
        ) : (
          <CenterStage>
            <Card className="mt-6">
              <p className="text-sm leading-relaxed text-[#6B7A72]">
                You haven&apos;t completed your onboarding assessment yet.{' '}
                <Link
                  href="/onboarding"
                  className="font-medium text-[#6B7A72] underline underline-offset-2"
                >
                  Complete it now
                </Link>
                .
              </p>
            </Card>
          </CenterStage>
        )}
      </main>

      <BottomNav isCoach={isCoach} />

      {baseline && (
        <FloatingCoachLauncher
          entryPoint="assessment"
          entryContext={buildAssessmentEntryContext('baseline', baseline.localDate)}
        />
      )}
    </div>
  );
}
