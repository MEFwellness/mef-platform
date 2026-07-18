/**
 * Questionnaires — the dedicated landing page for wellness questionnaires,
 * deliberately separate from /assessment (posture/movement Body
 * Assessment). Renders a scalable card grid purely from
 * lib/assessments/registry.ts via getMyQuestionnaireList(): today that's
 * one card (CHEK HLC1 Nutrition & Lifestyle), but the ~10 future
 * questionnaires (Health Appraisal, Breathing, Stress, Circadian & Sleep,
 * Digestive, Hormone, Colon Transit, Right/Left Brain, ...) each need only
 * a new lib/assessments/<id>/ config + one registry line to appear here —
 * this page never changes.
 */

import { redirect } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { getMyQuestionnaireList } from '@/app/actions/assessments';
import { hasActiveRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { AvatarLink } from '@/components/AvatarLink';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';
import { QuestionnaireCard } from '@/components/questionnaires/QuestionnaireCard';

export default async function QuestionnairesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, questionnaires, { data: profile }] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    getMyQuestionnaireList(),
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
  ]);
  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="flex items-center justify-between gap-3">
          <BackButton fallbackHref="/progress" label="Back to Progress" />
          <AvatarLink firstName={firstName} />
        </div>

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Questionnaires</p>
        </div>
        <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Wellness Questionnaires
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6B7A72]">
          In-depth, self-reported check-ins across nutrition, stress, sleep, digestion, and more —
          separate from your posture and movement Body Assessment.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {questionnaires.map((item) => (
            <QuestionnaireCard key={item.questionnaireId} item={item} />
          ))}
        </div>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
