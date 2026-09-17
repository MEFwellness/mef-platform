/**
 * Her own Health Appraisal results.
 *
 * HER OWN FINISHED SITTING IS THE WHOLE PERMISSION. This page shows nobody
 * anything but their own, and row level security is what enforces that: the
 * instances are read through her own session, and her colours arrive through
 * haq_member_section_results(), which filters on auth.uid() itself. A member
 * who has never finished a sitting has nothing to read, so she is sent back
 * to her questionnaires rather than shown an empty page.
 *
 * THIS RENDER WRITES NOTHING, and there is nothing here it could write: the
 * results were computed once, in the transaction that completed the sitting
 * (migration 262), and a completed instance is never changed again.
 *
 * NO NUMBER OF THE INSTRUMENT IS ON THIS PAGE'S IMPORT GRAPH. No total, no
 * cutoff, no hidden value and no overall grade: they live in tables with no
 * member policy at all, and tests/haq-member-safety.test.ts fails if this
 * route ever reaches the module that holds them.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { buildHaqMemberResults } from '@/lib/haq/results';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { BackButton } from '@/components/BackButton';
import { HaqResults } from '@/components/haq/HaqResults';

export default async function HealthAppraisalResultsPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const results = await buildHaqMemberResults(createClient(), user.id);
  if (!results) redirect('/questionnaires');

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-[680px] px-5 pb-16 pt-safe-header sm:px-6 md:px-10">
        <BackButton fallbackHref="/questionnaires" label="Back to Questionnaires" forceFallback />
        <div className="mt-4">
          <HaqResults results={results} />
        </div>
      </main>
    </div>
  );
}
