/**
 * The Rooted Reset Health Appraisal Questionnaire's own route.
 *
 * ACCESS IS ENFORCED HERE, SERVER SIDE. A member her coach has not assigned
 * this to, and who has never finished one, is sent Home before anything
 * renders, by the same rule the shelf card and every write read
 * (lib/haq/access.ts). The database refuses the same member underneath.
 *
 * THIS RENDER WRITES NOTHING. No instance is opened by a page load; Begin is
 * a button and a Server Action (app/actions/haq.ts).
 *
 * WHAT IS SENT TO HER SCREEN is lib/haq/pageProps.ts: her state, her own
 * answers as response names ("often"), her own body map marks, and the
 * screen she picks up on. No value, total, cutoff or colour is on this
 * page's import graph or in its props (tests/haq-member-safety.test.ts and
 * tests/haq-member-integration.test.ts).
 *
 * A FINISHED INSTANCE shows the completion screen. Her results page arrives
 * with Prompt 3.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { getMyHaq } from '@/lib/haq/view';
import { buildHaqPageProps } from '@/lib/haq/pageProps';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { HaqExperience } from '@/components/haq/HaqExperience';

export default async function HealthAppraisalPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const state = await getMyHaq();
  if (!state) redirect('/dashboard');

  const props = await buildHaqPageProps(createClient(), user.id, state);

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-[680px] px-5 pb-16 pt-safe-header sm:px-6 md:px-10">
        <HaqExperience {...props} />
      </main>
    </div>
  );
}
