/**
 * Coach Question Bank — manage the daily check-in's driver_probe_questions
 * (migrations 106/109/110): add, edit, retire/restore, and read all 88
 * questions in one sitting, without a deploy. Reached from the coach
 * dashboard, same as Program Library — see that page's own comment for
 * this codebase's "reached from the coach dashboard, not a new nav tab"
 * convention, followed here rather than inventing a new one.
 */

import { redirect } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';
import { getQuestionBankDataAction } from '@/app/actions/driverProbeAdmin';
import { QuestionBankPanel } from '@/components/coach-questions/QuestionBankPanel';

export default async function CoachQuestionsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (!isCoach) redirect('/dashboard');

  const data = await getQuestionBankDataAction();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/coach" label="Coach Dashboard" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Question Bank</p>
        </div>

        <div className="mt-2">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Check-in Questions
          </h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Add, edit, or retire the questions members see in Morning Readiness and Evening
            Reflection, changes take effect in tomorrow&apos;s check-in, no deploy needed.
          </p>
        </div>

        <div className="mt-7">
          {data ? (
            <QuestionBankPanel
              initialQuestions={data.questions}
              drivers={data.drivers}
              domains={data.domains}
            />
          ) : (
            <div className="rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
              <p className="text-sm text-[#6B7A72]">
                Couldn&apos;t load the question bank. Try refreshing the page.
              </p>
            </div>
          )}
        </div>
      </main>

      <BottomNav isCoach />
    </div>
  );
}
