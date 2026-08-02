/**
 * apps/consumer-web-app/app/noticing/page.tsx
 *
 * "What We're Noticing" — the member's own view over her active,
 * member-visible Universal Registry findings (app/actions/memberNoticing.ts).
 * Previously a bottom sheet layered over Home (NoticingSheet.tsx); this is
 * a full read (findings list, "Areas Worth Paying Attention To,"
 * "Recommended For You" with a questionnaire link), the same reasoning
 * the case view (/case) already gets its own route instead of a sheet.
 * Same copy and section order as the sheet had, unchanged, except the old
 * "Suggested Next Steps" section — removed as a confirmed bug, not a
 * copy edit: it only ever rendered a suggestion's `reason` sentence
 * ("Based on stress and lifestyle balance noticed recently."), never an
 * actual step, because no step was ever computed anywhere in that
 * pipeline (see memberFacingNoticing.ts's own doc comment).
 */

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { BackButton } from '@/components/BackButton';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { CenterStage } from '@/components/layout';
import { getMyNoticingView } from '@/app/actions/memberNoticing';

/**
 * Screen Layout System (Prompt 2): the empty state below ("Still gathering
 * information") is the one genuinely sparse render this page has — a
 * single short card that used to hug the top of the viewport with a lot
 * of dead space beneath it. `chromeOffsetPx` accounts for everything else
 * still consuming real vertical space around it: this page's own
 * `pt-safe-header` (2rem) + `pb-safe-chat` (9rem, since this page also
 * renders FloatingCoachLauncher) padding, plus the BackButton row and the
 * "What We're Noticing" label row above it (~3.5rem combined, measured
 * from their real text-sm/icon-row heights). Approximate by design, same
 * spirit as the app's other safe-area constants — a few px of slack here
 * is fine, unbounded dead space was the actual bug.
 */
const EMPTY_STATE_CHROME_OFFSET_PX = 232;

export default async function NoticingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [view, isCoach] = await Promise.all([
    getMyNoticingView(),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  const hasAnything =
    !!view &&
    (view.noticing.length > 0 ||
      view.improving.length > 0 ||
      view.worthAttention.length > 0 ||
      view.recommendedInvestigation !== null);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-chat pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back to Dashboard" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">What We&apos;re Noticing</p>
        </div>

        {!hasAnything || !view ? (
          <CenterStage chromeOffsetPx={EMPTY_STATE_CHROME_OFFSET_PX}>
            <section className="mef-card mef-animate-in p-7">
              <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
                Still gathering information
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
                Complete a check-in or an assessment and this page will start filling in.
              </p>
            </section>
          </CenterStage>
        ) : (
          <section className="mef-card mef-animate-in mt-3 p-7">
            {view.noticing.length > 0 && (
              <ul className="space-y-2.5">
                {view.noticing.map((item, i) => (
                  <li key={i} className="text-[15px] leading-relaxed text-[#1B3A2D]">
                    {item}
                  </li>
                ))}
              </ul>
            )}

            {view.improving.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  What&apos;s Improving
                </p>
                <ul className="mt-2 space-y-2">
                  {view.improving.map((item, i) => (
                    <li key={i} className="text-sm leading-relaxed text-[#1B3A2D]">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {view.worthAttention.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  Areas Worth Paying Attention To
                </p>
                <ul className="mt-2 space-y-2">
                  {view.worthAttention.map((item, i) => (
                    <li key={i} className="text-sm leading-relaxed text-[#1B3A2D]">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {view.recommendedInvestigation && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  Recommended For You
                </p>
                <Link
                  href={view.recommendedInvestigation.route as Route}
                  className="mt-2 block text-sm font-medium leading-relaxed text-[#3E5C46] underline underline-offset-2"
                >
                  {view.recommendedInvestigation.displayName}
                </Link>
              </div>
            )}

            {view.educationalNotes.length > 0 && (
              <p className="mt-4 text-xs italic text-[#6B7A72]">{view.educationalNotes[0]}</p>
            )}
          </section>
        )}
      </main>

      <BottomNav isCoach={isCoach} />

      <FloatingCoachLauncher
        entryPoint="dashboard"
        entryContext="Member opened What We're Noticing from the Home dashboard."
      />
    </div>
  );
}
