import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { hasCompletedConsent } from '../actions/consent';
import {
  getOnboardingAssessmentBank,
  getOnboardingAssessmentBankForGuest,
} from '../actions/onboarding';
import { fetchLatestMemberGoalSelection } from '@/lib/member-goals/data';
import { getMemberOrigin } from '@/lib/public-entry/data';
import { PUBLIC_ENTRY_PRIMARY_CONCERN } from '@/lib/public-entry/questions';
import { CenterStage } from '@/components/layout';
import { ConsentForm } from './ConsentForm';
import { OnboardingFlow } from './OnboardingFlow';
import { TrackOnboardingStarted } from '@/components/analytics/TrackSurfaceView';
import { getCachedUser } from '@/lib/supabase/currentUser';

const CARD = 'mef-card'; // Screen Layout System (Prompt 2): standardized card recipe, app/globals.css
const SHELL =
  'min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]';
const CONTAINER = 'mx-auto w-full max-w-md px-5 py-10 sm:px-6 md:max-w-2xl md:px-10';
const HEADING =
  'font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]';
const PRIMARY_BUTTON =
  'flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110';
const SECONDARY_BUTTON =
  'flex w-full items-center justify-center rounded-full border-2 border-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-[#1B3A2D] transition hover:bg-[#1B3A2D]/5';

/**
 * FIX 3 (2026-08-03): this state and the "already complete" state below
 * shared the same layout bug — a heading and a line or two of text hugging
 * the top of an otherwise blank screen, with (on the "already complete"
 * screen) two easy-to-miss underlined text links instead of real buttons.
 * `CenterStage` (Screen Layout System, Prompt 2) is this app's established
 * fix for exactly this shape — already used by OnboardingCompletionScreen.tsx
 * and app/profile/reassessments/new/page.tsx's own "We'll be right with
 * you" state — so both now use it instead of a plain top-anchored div. The
 * consent gate just below is deliberately left as-is; see its own comment.
 */
function UnavailableNotice() {
  return (
    <div className={SHELL}>
      <main className={CONTAINER}>
        <CenterStage className="text-center">
          <h1 className={HEADING}>We&apos;ll be right with you</h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Your onboarding assessment isn&apos;t available right now. Please try again in a few
            minutes, or contact support if this continues.
          </p>
        </CenterStage>
      </main>
    </div>
  );
}

export default async function OnboardingPage() {
  const supabase = createClient();
  const user = await getCachedUser();

  // No account required — a visitor can take the assessment before
  // signing up (middleware.ts's PUBLIC_PATHS exempts /onboarding for
  // exactly this). The question list is fetched via a service-role read
  // (getOnboardingAssessmentBankForGuest) since onboarding_questions' RLS
  // requires an authenticated session and this app has no anonymous auth.
  // Nothing is written to Postgres in this branch — OnboardingFlow's
  // guest mode stores answers in localStorage and only ever submits them
  // for real once the member signs in with a real account (see
  // OnboardingFlow.tsx's member-mode migration effect).
  if (!user) {
    const questions = await getOnboardingAssessmentBankForGuest();
    if (questions.length === 0) return <UnavailableNotice />;

    return (
      <div className={SHELL}>
        <main className={CONTAINER}>
          <OnboardingFlow questions={questions} mode="guest" />
        </main>
      </div>
    );
  }

  const consented = await hasCompletedConsent(user.id);

  if (!consented) {
    // Deliberately NOT wrapped in CenterStage (FIX 3, 2026-08-03): unlike
    // the pure single-message states elsewhere in this file, this gate
    // holds a real multi-section form with a validation error that can
    // appear/grow (ConsentForm.tsx) — exactly the case CenterStage's own
    // header comment (components/layout/CenterStage.tsx) says not to
    // center, since centering content that grows causes a layout jump.
    return (
      <div className={SHELL}>
        <main className={CONTAINER}>
          <h1 className={HEADING}>Before we start</h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Please review and accept the following before completing your assessment.
          </p>
          <div className={`${CARD} mt-6 p-6`}>
            <ConsentForm />
          </div>
        </main>
      </div>
    );
  }

  // Existence check, not .maybeSingle() — onboarding_submissions has no
  // unique constraint on user_id by design (lib/onboarding/baseline.ts),
  // so a future reassessment adding a second row here must never turn this
  // into a hard error. This only asks "has the member ever submitted."
  const { data: existing } = await supabase
    .from('onboarding_submissions')
    .select('id')
    .eq('user_id', user.id)
    .limit(1);

  if (existing && existing.length > 0) {
    return (
      <div className={SHELL}>
        <main className={CONTAINER}>
          <CenterStage className="text-center">
            <h1 className={HEADING}>Onboarding already complete</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-[#4F645A]">
              Thanks, your onboarding assessment is on file.
            </p>
            <div className="mt-7 space-y-3">
              <Link href="/checkin" className={PRIMARY_BUTTON}>
                Go to today&apos;s check-in
              </Link>
              <Link href="/profile/baseline" className={SECONDARY_BUTTON}>
                Review your Baseline Assessment
              </Link>
            </div>
          </CenterStage>
        </main>
      </div>
    );
  }

  const questions = await getOnboardingAssessmentBank();

  // getOnboardingAssessmentBank() returns [] both on a real fetch error (logged
  // there) and if reference data is missing — a config problem, never
  // something the member can fix. Show a calm apology instead of an empty
  // form with a submit button that has nothing to submit.
  if (questions.length === 0) {
    return <UnavailableNotice />;
  }

  // The welcome flow's goal screen may already have told us what matters
  // most (member_goal_selections, migration 104) — if so, the
  // `primary_concern` question is confirmed rather than asked cold (see
  // OnboardingForm.tsx's knownPrimaryGoal prop). Members who backfilled
  // with no primary ever chosen, or who never went through the welcome
  // flow at all, get `null` here and see the original cold-ask question,
  // unchanged.
  const latestGoalSelection = await fetchLatestMemberGoalSelection(supabase, user.id);
  const knownPrimaryGoal =
    latestGoalSelection?.primaryGoal != null
      ? { goals: latestGoalSelection.goals, primaryGoalKey: latestGoalSelection.primaryGoal }
      : null;

  // She may have arrived through the public entry experience (migration
  // 197). If so, `primary_concern` is confirmed rather than asked cold, the
  // same affordance the welcome flow's goal screen already earns, so
  // somebody who told us what she came for before she had an account is not
  // asked the identical question the moment she does.
  //
  // This is a READ of member_public_entry_origin, whose own columns are
  // check-constrained to say "preliminary public acquisition". Nothing is
  // pre-filled from it: the value only becomes an answer when she taps the
  // tile. See OnboardingForm.tsx's PublicEntryConcernConfirmControl.
  const publicEntryOrigin = knownPrimaryGoal
    ? null
    : await getMemberOrigin(supabase, user.id);
  const publicEntryConcern = publicEntryOrigin ? PUBLIC_ENTRY_PRIMARY_CONCERN : null;

  return (
    <div className={SHELL}>
      {/* Only ever reached once every earlier guard (consent, already
          complete, unavailable) has passed and the real question flow is
          about to render, so this fires on a genuine onboarding start and
          not on the consent gate or the already-complete screen. */}
      <TrackOnboardingStarted />
      <main className={CONTAINER}>
        <OnboardingFlow
          questions={questions}
          mode="member"
          knownPrimaryGoal={knownPrimaryGoal}
          publicEntryConcern={publicEntryConcern}
        />
      </main>
    </div>
  );
}
