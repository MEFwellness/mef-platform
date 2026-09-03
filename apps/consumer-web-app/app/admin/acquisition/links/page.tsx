/**
 * The link builder: where every tracking link is made, and the only place
 * one should ever come from.
 *
 * WHY A SCREEN AND NOT A NOTE SOMEWHERE. A tracking link typed by hand
 * fails quietly. A missing `utm_campaign` reads as organic traffic, a
 * capitalised creative becomes a second creative that will never be added
 * back to the first, and a typo in a partner code becomes a partner nobody
 * can find. None of those announce themselves; they just make the report
 * wrong in a way that still looks like an answer. This screen builds the
 * whole URL from one form, normalises every value the same way the reader
 * on the other end normalises it, and stores the exact string it generated.
 *
 * ONE FORM WRITES BOTH THINGS. The link, and the record of what its code
 * stands for: the partner's name and the physical place, when there is one.
 * They are the same decision, so they are the same submit, and neither can
 * exist without the other.
 *
 * WHAT THIS SCREEN IS NOT. It is not a report. It shows no arrivals, no
 * counts and no conversion. The funnel next door at /admin/acquisition
 * shows those, and the acquisition report that will read everything this
 * screen writes is a separate build.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { BackButton } from '@/components/BackButton';
import { listTrackingLinksAction } from '@/app/actions/acquisitionLinks';
import { trackingLinkOrigin } from '@/lib/acquisition/links';
import { LinkBuilderPanel } from './LinkBuilderPanel';

export const dynamic = 'force-dynamic';

export default async function AcquisitionLinksPage() {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (!isAdmin) redirect('/dashboard');

  const [links, existingSources] = await Promise.all([
    listTrackingLinksAction(),
    supabase
      .from('public_entry_sources')
      .select('code, label, is_test')
      .order('code'),
  ]);

  const takenCodes = ((existingSources.data ?? []) as { code: string; label: string; is_test: boolean }[]).map(
    (source) => ({ code: source.code, label: source.label, isTest: source.is_test })
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-4xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/admin/acquisition" label="Back to Acquisition" forceFallback />

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
          Tracking links
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#4F645A]">
          Build every link here rather than typing one. The form writes the link and the record of
          who its code stands for at the same time, so the two can never disagree, and it puts every
          value into one shape so the same partner never turns into two rows in a report.
        </p>

        <LinkBuilderPanel
          origin={trackingLinkOrigin()}
          initialLinks={links.ok ? links.data : []}
          loadError={links.ok ? null : links.error}
          takenCodes={takenCodes}
        />
      </main>
    </div>
  );
}
