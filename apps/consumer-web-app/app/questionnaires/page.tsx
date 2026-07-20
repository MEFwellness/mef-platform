/**
 * Questionnaires — the single library-and-doing surface: browse, filter,
 * take, resume. Built on the Assessment Registry framework
 * (lib/assessment-registry/*): one server action
 * (getMyQuestionnaireCatalog) computes section (Available/Premium/
 * Assigned/Completed) and flags (locked/scheduled/reassessment due/coming
 * soon/in progress) for every registered assessment, and this page always
 * renders the full catalog — never a status-shaped flat scroll. Progress
 * (app/progress/page.tsx) is the history-only lens on the same data; it
 * never renders an unstarted questionnaire as something to take, and any
 * reassessment CTA there deep-links back into this page rather than
 * spawning a parallel intake. Deliberately still separate from /assessment
 * (posture/movement Body Assessment) — same existing product decision as
 * before, just now expressed through the framework instead of a hardcoded
 * card list.
 */

import { redirect } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { getMyQuestionnaireCatalog } from '@/app/actions/questionnaireCatalog';
import { hasActiveRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { AvatarLink } from '@/components/AvatarLink';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';
import { QuestionnaireCatalogView } from '@/components/questionnaires/QuestionnaireCatalogView';

export default async function QuestionnairesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, catalog, { data: profile }] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    getMyQuestionnaireCatalog(),
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
  ]);
  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="flex items-center justify-between gap-3">
          <BackButton fallbackHref="/dashboard" label="Back to Home" />
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
        <p className="mt-1 text-sm font-medium text-[#1B3A2D]">
          {catalog.completedCount} of {catalog.totalCount} complete
        </p>

        <QuestionnaireCatalogView catalog={catalog} />
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
