/**
 * The Body Systems Survey question to signal mapping, for the coach to
 * review and adjust.
 *
 * WHAT SHE IS LOOKING AT. Every question the survey asks, and the canonical
 * signal an answer to it is filed under in the Signal Library. That filing
 * is what lets Root read a survey answer the same way it reads a sentence
 * she wrote. Each change is kept as a version.
 *
 * REACHED FROM THE COACH DASHBOARD, not from a new nav tab, which is this
 * codebase's convention for a coach tool. middleware.ts turns away anyone
 * without the coach grant on every /coach path, and the guard below is the
 * second lock. Nothing on this screen is visible to a member.
 */

import { redirect } from 'next/navigation';
import { Route } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { StaffPageHeader } from '@/components/staff/StaffPageHeader';
import { getSurveySignalMappingAction } from '@/app/actions/crossSystemSignalMappings';
import { SurveySignalMappingPanel } from '@/components/coach-signal-mappings/SurveySignalMappingPanel';
import { SURVEY_SIGNAL_MAPPING_LABEL } from '@/lib/cross-system-signals/surveyMapping';

export const dynamic = 'force-dynamic';

export default async function CoachSignalMappingsPage() {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (!isCoach && !isAdmin) redirect('/dashboard');

  const state = await getSurveySignalMappingAction();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <StaffPageHeader
          backHref="/coach"
          backLabel="Coach Dashboard"
          eyebrow="Body Systems Survey"
          eyebrowIcon={Route}
          title={SURVEY_SIGNAL_MAPPING_LABEL}
          subtitle="The canonical signal each survey question is filed under, so Root can read her answers. Every change is kept as a version. Coach only, and nothing here is visible to a member."
        />

        <div className="mt-7">
          <SurveySignalMappingPanel
            view={state.view}
            signalNames={state.signalNames}
            bodyAreas={state.bodyAreas}
          />
        </div>
      </main>
    </div>
  );
}
