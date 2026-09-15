/**
 * The Relationship Library editor.
 *
 * WHERE THE COACH WRITES DOWN WHAT SHE KNOWS. The Signal Library fills
 * itself from assessments a member has completed. This library fills only
 * from her: one whole-body relationship at a time, in her own words, with
 * a version kept every time she changes her mind.
 *
 * NOTHING IN THIS APP WRITES A ROW IN IT ON HER BEHALF. There is no
 * generator, no seed set and no suggestion anywhere in this feature. The
 * one record it ships with is flagged as an example, is inactive, and says
 * so in the first word of its name.
 *
 * NO MATCHING RUNS HERE. This screen reads definitions and writes
 * definitions. It never reads a member's signals and never decides that a
 * member is showing a pattern, because nothing in this build does that
 * yet. That is Prompt 3.
 *
 * REACHED FROM THE COACH DASHBOARD, not from a new nav tab, which is this
 * codebase's convention for a coach tool (see app/coach/questions/page.tsx
 * for the same note). middleware.ts turns away anyone without the coach
 * grant on every /coach path, and the guard below is the second lock.
 */

import { redirect } from 'next/navigation';
import { Share2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { StaffPageHeader } from '@/components/staff/StaffPageHeader';
import { getRelationshipLibraryAction } from '@/app/actions/crossSystemRelationships';
import { RelationshipLibraryPanel } from '@/components/coach-relationships/RelationshipLibraryPanel';
import { RELATIONSHIP_LIBRARY_LABEL } from '@/lib/cross-system-relationships/constants';

export const dynamic = 'force-dynamic';

export default async function CoachRelationshipsPage() {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (!isCoach && !isAdmin) redirect('/dashboard');

  const state = await getRelationshipLibraryAction();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <StaffPageHeader
          backHref="/coach"
          backLabel="Coach Dashboard"
          eyebrow="Whole-body patterns"
          eyebrowIcon={Share2}
          title={RELATIONSHIP_LIBRARY_LABEL}
          subtitle="Your own cross-system patterns, written down and kept in versions. Coach only, and nothing here is visible to a member."
        />

        <div className="mt-7">
          <RelationshipLibraryPanel
            summaries={state.summaries}
            categories={state.categories}
            bodyAreas={state.bodyAreas}
            signalNames={state.signalNames}
          />
        </div>
      </main>
    </div>
  );
}
