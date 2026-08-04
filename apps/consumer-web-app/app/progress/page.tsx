/**
 * "Your Wellness Story" — Progress page restructure (2026-07-28).
 *
 * New order: Root Score (biggest, most prominent card) -> Where You Are
 * Right Now (WellnessStoryPanel, paired directly beneath the score) ->
 * one interpretive block (Coaching Insights promoted to a content card
 * with its suggested-question chips, then Wellness Patterns, then
 * Wellness Identity) -> Trends (one card, a segmented control across
 * every metric the daily check-in and any connected wearable actually
 * capture, instead of one full-width card per metric) -> Consistency
 * (streak/check-ins/avg energy collapsed into a three-up stat row) ->
 * the assessment block (From Your Assessments + Baseline vs. Latest
 * Comparison) -> Explore (Health Timeline / Assessments / Questionnaires
 * as nav rows under one small header) -> History, at the very bottom
 * ("Your Wellness Story" rework: a log of past check-ins reads as an
 * appendix, not part of the page's narrative, and previously interrupted
 * that narrative by sitting in the middle of it).
 *
 * The old "Talk to Root" section is gone — its three chips now live
 * inside the Coaching Insights card, in context with the insight they're
 * about. The floating chat launcher remains the one chat entry point.
 *
 * Every section keeps reading the exact data it always read; only the
 * grouping, order, and per-card visual treatment changed. Card
 * treatments deliberately vary (shadowed white / tinted / bordered /
 * plain) so no two adjacent sections look identical, matching the same
 * rotating-treatment approach already used on the Home dashboard.
 */

import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { History as HistoryIcon, ArrowRight, ScanFace, ClipboardList } from 'lucide-react';
import { getRecentCheckins, resolveLocalDate } from '@/app/actions/checkin';
import { getMyWellnessIdentityHighlights } from '@/app/actions/intelligence-core';
import { getMyHealthProfileSummary } from '@/app/actions/health-profile';
import { getMyProgressComparison } from '@/app/actions/onboarding';
import { getMyWearableMetricHistory } from '@/app/actions/wearables';
import { getMyRootScoreHistory } from '@/app/actions/scoring';
import { getMyCoachingInsightsAction } from '@/app/actions/coaching-insights';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { AvatarLink } from '@/components/AvatarLink';
import { firstNameFrom } from '@/lib/profile/greeting';
import { BackButton } from '@/components/BackButton';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { AssessmentComparisonView } from '@/components/AssessmentComparisonView';
import { CardStack } from '@/components/layout';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { LockedCardButton } from '@/components/locked/LockedCardButton';
import { CoachLockBadge } from '@/components/locked/CoachLockBadge';
import { buildProgressEntryContext } from '@/lib/conversation-coach/entryContext';
import { WellnessIdentityPanel } from './WellnessIdentityPanel';
import { ProgressRootScorePanel } from './ProgressRootScorePanel';
import { CoachingInsightsPanel } from './CoachingInsightsPanel';
import { TrendsPanel } from './TrendsPanel';
import { ConsistencyPanel } from './ConsistencyPanel';
import { WellnessStorySection, WellnessStorySectionSkeleton } from './WellnessStorySection';
import { WellnessPatternsSection, WellnessPatternsSectionSkeleton } from './WellnessPatternsSection';
import { RecommendationsSection, RecommendationsSectionSkeleton } from './RecommendationsSection';

const ZONE_LABEL = 'text-xs font-semibold uppercase tracking-wider text-[#1B3A2D]/40';

const SEVERITY_LABEL: Record<string, string> = {
  significant: 'significant',
  moderate: 'moderate',
  mild: 'mild',
  unknown: 'unclassified',
  none: 'resolved',
};

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default async function ProgressPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // getMyWellnessStorySummary and getMyWellnessPatterns recompute their
  // own engines live on every call (recalculateIntelligenceCore /
  // recalculateWellnessIntelligence — by design, not touched here) and are
  // the slowest things this page does. Deliberately not in this batch:
  // each streams in independently via its own Suspense boundary below
  // (WellnessStorySection / WellnessPatternsSection) so the rest of this
  // page — everything in this Promise.all, all of it fast — never waits
  // on them. Same reasoning for RecommendationsSection, which reads a
  // precomputed result and is normally fast, but still gets its own
  // boundary for the rare live-compute path (a member's first-ever visit).
  const [
    isCoach,
    { data: profile },
    recentCheckins,
    wellnessIdentity,
    healthProfileSummary,
    progressComparison,
    readinessHistory,
    sleepHistory,
    stepsHistory,
    stressHistory,
    rootScoreHistory,
    coachingInsights,
    bodyAssessmentAccess,
  ] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    supabase.from('profiles').select('display_name, timezone').eq('id', user.id).single(),
    getRecentCheckins(30),
    getMyWellnessIdentityHighlights(),
    getMyHealthProfileSummary(),
    getMyProgressComparison(),
    getMyWearableMetricHistory('readiness_score', 30),
    getMyWearableMetricHistory('sleep_duration_minutes', 30),
    getMyWearableMetricHistory('steps', 30),
    getMyWearableMetricHistory('stress_score', 30),
    getMyRootScoreHistory(90),
    getMyCoachingInsightsAction(),
    // Coach-Assign-Only Gating task (2026-08-04) — locks the "Assessments"
    // Explore row below when this member has no Body Assessment history
    // and no pending coach assignment for it.
    checkAssessmentAccess(supabase, user.id, 'body-assessment'),
  ]);
  const firstName = firstNameFrom(profile?.display_name);
  const timezone = profile?.timezone ?? 'America/New_York';
  const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const localDate = await resolveLocalDate(nowInTz, false);
  const history = [...recentCheckins].reverse(); // most recent first for the list
  const averageEnergy =
    recentCheckins.length > 0
      ? recentCheckins.reduce((sum, c) => sum + (c.energy_level ?? 0), 0) / recentCheckins.length
      : null;

  const activeFindingSeverities = healthProfileSummary
    ? Object.entries(healthProfileSummary.activeRegistryFindingsBySeverity).filter(
        ([, count]) => count > 0
      )
    : [];

  // Previously built from wellnessPatterns (the same data
  // WellnessPatternsSection now streams in independently below) — kept
  // fast and synchronous here on purpose: computing this from the same
  // slow recalculateWellnessIntelligence call would block this page's
  // entire top-level render on the one thing this task moved out of the
  // critical path. Never member-visible UI text — only the invisible
  // context the coach chat launcher sends itself when opened — so a
  // slightly less specific default until the member's next reload doesn't
  // change anything this page displays.
  const entryContext = buildProgressEntryContext([]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      {/* Status-bar scrim: fixed and opaque, pinned to exactly the
          device's safe-area-inset-top zone regardless of scroll
          position. Without this, page content (this page has no fixed
          header of its own) scrolls straight through that zone with
          nothing behind it, colliding with the iOS clock/battery
          indicator. Matches the page's own top gradient color so it's
          invisible as a seam at rest. */}
      <div
        className="fixed inset-x-0 top-0 z-40 bg-[#EFF6F1]"
        style={{ height: 'env(safe-area-inset-top)' }}
        aria-hidden="true"
      />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back to Home" />

        <div className="mt-4 flex items-start justify-between gap-3">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Your Wellness Story
          </h1>
          <AvatarLink firstName={firstName} />
        </div>

        {/* Root Score — biggest, most prominent card on the page. */}
        <ProgressRootScorePanel history={rootScoreHistory} todayLocalDate={localDate} />

        {/* Where You Are Right Now — paired directly beneath the score
            so its interpretive line reads as commentary on the number.
            Own Suspense boundary: recalculateIntelligenceCore is the
            slowest thing this page does, so it streams in independently
            instead of holding up everything below. */}
        <Suspense fallback={<WellnessStorySectionSkeleton />}>
          <WellnessStorySection />
        </Suspense>

        {/* One interpretive block: Coaching Insights (promoted to a
            content card, its chips moved here from the old "Talk to
            Root" section), then Wellness Patterns, then Wellness
            Identity. Wellness Patterns gets its own Suspense boundary for
            the same reason as Wellness Story above
            (recalculateWellnessIntelligence). */}
        <CoachingInsightsPanel insights={coachingInsights.insights} entryContext={entryContext} />
        <Suspense fallback={<WellnessPatternsSectionSkeleton />}>
          <WellnessPatternsSection />
        </Suspense>
        <WellnessIdentityPanel highlights={wellnessIdentity} />

        {/* Recommendations — reads the Recommendation Engine's precomputed
            result (member_recommendation_computations) instead of
            computing it live on this page's render path; the same stored
            result and staleness rule the Dashboard and /recommendations
            read from. Own Suspense boundary for the rare live-compute
            path (a member's first-ever visit with nothing stored yet). */}
        <Suspense fallback={<RecommendationsSectionSkeleton />}>
          <RecommendationsSection />
        </Suspense>

        {/* Trends — one card, a segmented control across every metric
            the check-in and any connected wearable actually capture. */}
        <TrendsPanel
          checkins={recentCheckins}
          readinessHistory={readinessHistory}
          sleepHistory={sleepHistory}
          stepsHistory={stepsHistory}
          stressHistory={stressHistory}
        />

        {/* Consistency — Avg Energy only now; Streak and Check-ins were
            removed (distribution card task, 2026-07-28) after confirming
            both appear elsewhere in the app. See ConsistencyPanel.tsx's
            own doc comment for the full accounting. */}
        <ConsistencyPanel averageEnergy={averageEnergy} />

        {/* Assessment block: From Your Assessments + Baseline vs. Latest
            Comparison, grouped together since both read assessment data. */}
        {healthProfileSummary && activeFindingSeverities.length > 0 && (
          <section className="mef-card mef-animate-in mt-5 p-6">
            {/* Reading width (Prompt 2), capped without auto-centering (see
                the identical note in WellnessStoryPanel.tsx): this card is
                pure prose sitting inside the page's own md:max-w-5xl shell
                — at tablet/desktop widths the card runs much wider than a
                comfortable text measure, and every other text block on this
                page stays flush left, so this one shouldn't become the one
                inset/centered exception. */}
            <div className="max-w-[var(--mef-reading-max-width)]">
              <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                From Your Assessments
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#1B3A2D]">
                {activeFindingSeverities
                  .map(
                    ([severity, count]) =>
                      `${count} ${SEVERITY_LABEL[severity] ?? severity} finding${count === 1 ? '' : 's'}`
                  )
                  .join(', ')}{' '}
                currently active
                {healthProfileSummary.lastAssessmentPublishedAt
                  ? ` since your last published report (${new Date(healthProfileSummary.lastAssessmentPublishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}).`
                  : '.'}
              </p>
            </div>
          </section>
        )}

        <div className="mt-5">
          <AssessmentComparisonView
            metrics={progressComparison.metrics}
            summary={progressComparison.summary}
            hasLatest={Boolean(progressComparison.latest)}
          />
        </div>

        {/* Explore — Health Timeline, Assessments, Questionnaires as
            plain nav rows beneath one small section header, distinct
            from the card blocks above. */}
        <p className={`${ZONE_LABEL} mt-8`}>Explore</p>

        <div className="mt-3">
          <CardStack>
            <Link
              href="/progress/timeline"
              className="mef-card mef-animate-in flex items-center justify-between p-6 transition hover:bg-[#FAFAF8]"
            >
              <div className="flex items-center gap-2 text-[#6B7A72]">
                <HistoryIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Your Health Timeline</p>
              </div>
              <ArrowRight className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
            </Link>

            {bodyAssessmentAccess.allowed ? (
              <Link
                href="/assessment"
                className="mef-card mef-animate-in flex items-center justify-between p-6 transition hover:bg-[#FAFAF8]"
              >
                <div className="flex items-center gap-2 text-[#6B7A72]">
                  <ScanFace className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-sm font-semibold uppercase tracking-wider">Assessments</p>
                </div>
                <ArrowRight className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
              </Link>
            ) : (
              <div className="relative">
                <LockedCardButton ariaLabel="Assessments, locked. Tap to hear from Root about it.">
                  <div className="mef-card mef-animate-in flex items-center justify-between p-6 opacity-55 grayscale-[0.4]">
                    <div className="flex items-center gap-2 text-[#6B7A72]">
                      <ScanFace className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      <p className="text-sm font-semibold uppercase tracking-wider">Assessments</p>
                    </div>
                  </div>
                </LockedCardButton>
                <CoachLockBadge />
              </div>
            )}

            <Link
              href={'/questionnaires' as Route}
              className="mef-card mef-animate-in flex items-center justify-between p-6 transition hover:bg-[#FAFAF8]"
            >
              <div className="flex items-center gap-2 text-[#6B7A72]">
                <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Questionnaires</p>
              </div>
              <ArrowRight className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </CardStack>
        </div>

        {/* History — moved to the very bottom of the page (below Explore):
            a log of past check-ins reads as an appendix/reference, not
            part of the page's main narrative arc, and used to interrupt
            that arc by sitting in the middle of it. Position change only —
            same content, same "edited" badge, same styling. */}
        <section className="mt-8 rounded-[28px] bg-[#FAFAF8] p-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">History</p>
          {history.length > 0 ? (
            <div className="mt-3 divide-y divide-[#1B3A2D]/5">
              {history.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span className="w-28 shrink-0 font-medium text-[#1B3A2D]">
                    {formatDate(c.local_date)}
                  </span>
                  <span className="flex-1 text-[#6B7A72]">
                    Mood {c.mood_level ?? '-'} · Energy {c.energy_level ?? '-'} · Stress{' '}
                    {c.stress_level ?? '-'}
                    {c.sleep_duration ? ` · Sleep ${c.sleep_duration}` : ''}
                  </span>
                  {c.checkin_version > 1 && (
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs text-[#1B3A2D]">
                      edited
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#6B7A72]">
              I don&apos;t have any check-ins to show yet. They&apos;ll build up here as you go.
            </p>
          )}
        </section>
      </main>

      <BottomNav isCoach={isCoach} />

      <FloatingCoachLauncher entryPoint="progress_pattern" entryContext={entryContext} />
    </div>
  );
}
