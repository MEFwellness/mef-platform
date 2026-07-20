/**
 * Questionnaires — a guided member journey, not a flat catalog. Built on
 * the Assessment Registry framework (lib/assessment-registry/*): one
 * server action (getMyQuestionnaireJourney) computes status, locks, and a
 * single recommendation for every registered assessment, and this page
 * only ever renders the sections that are actually relevant to this
 * member right now. Deliberately still separate from /assessment
 * (posture/movement Body Assessment) — same existing product decision as
 * before, just now expressed through the framework instead of a hardcoded
 * card list.
 */

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ClipboardList, Sparkles } from 'lucide-react';
import { getMyQuestionnaireJourney } from '@/app/actions/questionnaireJourney';
import { hasActiveRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { AvatarLink } from '@/components/AvatarLink';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';
import { JourneyAssessmentCard } from '@/components/questionnaires/JourneyAssessmentCard';

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <p className="px-1 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">{title}</p>
      {subtitle && <p className="mt-1 px-1 text-xs text-[#6B7A72]">{subtitle}</p>}
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default async function QuestionnairesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, journey, { data: profile }] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    getMyQuestionnaireJourney(),
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
  ]);
  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';

  const hasAnything =
    journey.recommended ||
    journey.continueWhereLeftOff.length > 0 ||
    journey.available.length > 0 ||
    journey.completed.length > 0 ||
    journey.scheduled.length > 0 ||
    journey.locked.length > 0 ||
    journey.comingSoon.length > 0;

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
          In-depth, self-reported check-ins across nutrition, stress, sleep, digestion, and more,
          separate from your posture and movement Body Assessment.
        </p>

        {!hasAnything && (
          <section className="mef-animate-in mt-8 rounded-[28px] bg-white p-7 text-center shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
            <p className="text-sm leading-relaxed text-[#6B7A72]">
              Nothing available right now. Check back soon.
            </p>
          </section>
        )}

        {journey.recommended && (
          <section className="mt-6">
            <div className="flex items-center gap-2 text-[#1B3A2D]">
              <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Recommended Next</p>
            </div>
            <div className="mt-3">
              <JourneyAssessmentCard card={journey.recommended} variant="hero" />
            </div>
          </section>
        )}

        {journey.continueWhereLeftOff.length > 0 && (
          <Section title="Continue Where You Left Off">
            {journey.continueWhereLeftOff.map((card) => (
              <JourneyAssessmentCard key={card.key} card={card} />
            ))}
          </Section>
        )}

        {journey.available.length > 0 && (
          <Section title="Available Assessments">
            {journey.available.map((card) => (
              <JourneyAssessmentCard key={card.key} card={card} />
            ))}
          </Section>
        )}

        {journey.scheduled.length > 0 && (
          <Section title="Scheduled Reassessments">
            {journey.scheduled.map((card) => (
              <JourneyAssessmentCard key={card.key} card={card} />
            ))}
          </Section>
        )}

        {journey.completed.length > 0 && (
          <Section title="Completed Assessments">
            {journey.completed.map((card) => (
              <JourneyAssessmentCard key={card.key} card={card} />
            ))}
          </Section>
        )}

        {journey.locked.length > 0 && (
          <Section title="Locked" subtitle="A few upcoming opportunities as your access grows.">
            {journey.locked.map((card) => (
              <JourneyAssessmentCard key={card.key} card={card} />
            ))}
          </Section>
        )}

        {journey.comingSoon.length > 0 && (
          <Section title="Coming Soon">
            {journey.comingSoon.map((card) => (
              <JourneyAssessmentCard key={card.key} card={card} />
            ))}
          </Section>
        )}
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
