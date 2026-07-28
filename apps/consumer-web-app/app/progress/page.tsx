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

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { History as HistoryIcon, ArrowRight, ScanFace, ClipboardList } from 'lucide-react';
import { getRecentCheckins, resolveLocalDate } from '@/app/actions/checkin';
import { getMyWellnessPatterns } from '@/app/actions/wellness-intelligence';
import {
  getMyWellnessIdentityHighlights,
  getMyWellnessStorySummary,
} from '@/app/actions/intelligence-core';
import { getMyHealthProfileSummary } from '@/app/actions/health-profile';
import { getMyProgressComparison } from '@/app/actions/onboarding';
import { getMyWearableMetricHistory } from '@/app/actions/wearables';
import { getMyRootScoreHistory } from '@/app/actions/scoring';
import { getMyCoachingInsightsAction } from '@/app/actions/coaching-insights';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { AvatarLink } from '@/components/AvatarLink';
import { BackButton } from '@/components/BackButton';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { AssessmentComparisonView } from '@/components/AssessmentComparisonView';
import { buildProgressEntryContext } from '@/lib/conversation-coach/entryContext';
import { WellnessPatternsPanel } from './WellnessPatternsPanel';
import { WellnessIdentityPanel } from './WellnessIdentityPanel';
import { WellnessStoryPanel } from './WellnessStoryPanel';
import { ProgressRootScorePanel } from './ProgressRootScorePanel';
import { CoachingInsightsPanel } from './CoachingInsightsPanel';
import { TrendsPanel } from './TrendsPanel';
import { ConsistencyPanel } from './ConsistencyPanel';
import { calculateStreak } from './streak';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
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

  const [
    isCoach,
    { data: profile },
    recentCheckins,
    wellnessPatterns,
    wellnessIdentity,
    wellnessStory,
    healthProfileSummary,
    progressComparison,
    readinessHistory,
    sleepHistory,
    stepsHistory,
    stressHistory,
    rootScoreHistory,
    coachingInsights,
  ] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    supabase.from('profiles').select('display_name, timezone').eq('id', user.id).single(),
    getRecentCheckins(30),
    getMyWellnessPatterns(),
    getMyWellnessIdentityHighlights(),
    getMyWellnessStorySummary(),
    getMyHealthProfileSummary(),
    getMyProgressComparison(),
    getMyWearableMetricHistory('readiness_score', 30),
    getMyWearableMetricHistory('sleep_duration_minutes', 30),
    getMyWearableMetricHistory('steps', 30),
    getMyWearableMetricHistory('stress_score', 30),
    getMyRootScoreHistory(90),
    getMyCoachingInsightsAction(),
  ]);
  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';
  const timezone = profile?.timezone ?? 'America/New_York';
  const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const localDate = await resolveLocalDate(nowInTz, false);
  const streak = calculateStreak(recentCheckins);
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

  const entryContext = buildProgressEntryContext(wellnessPatterns);

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
            so its interpretive line reads as commentary on the number. */}
        {wellnessStory && <WellnessStoryPanel summary={wellnessStory} />}

        {/* One interpretive block: Coaching Insights (promoted to a
            content card, its chips moved here from the old "Talk to
            Root" section), then Wellness Patterns, then Wellness
            Identity. */}
        <CoachingInsightsPanel insights={coachingInsights.insights} entryContext={entryContext} />
        <WellnessPatternsPanel insights={wellnessPatterns} />
        <WellnessIdentityPanel highlights={wellnessIdentity} />

        {/* Trends — one card, a segmented control across every metric
            the check-in and any connected wearable actually capture. */}
        <TrendsPanel
          checkins={recentCheckins}
          readinessHistory={readinessHistory}
          sleepHistory={sleepHistory}
          stepsHistory={stepsHistory}
          stressHistory={stressHistory}
        />

        {/* Consistency — streak / check-ins / avg energy as one
            three-up stat row instead of three full-width cards. */}
        <ConsistencyPanel
          streak={streak}
          checkinCount={recentCheckins.length}
          averageEnergy={averageEnergy}
        />

        {/* Assessment block: From Your Assessments + Baseline vs. Latest
            Comparison, grouped together since both read assessment data. */}
        {healthProfileSummary && activeFindingSeverities.length > 0 && (
          <section className={`${CARD} mef-animate-in mt-5 p-6`}>
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

        <Link
          href="/progress/timeline"
          className={`${CARD} mef-animate-in mt-3 flex items-center justify-between p-6 transition hover:bg-[#FAFAF8]`}
        >
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <HistoryIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Your Health Timeline</p>
          </div>
          <ArrowRight className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
        </Link>

        <Link
          href="/assessment"
          className={`${CARD} mef-animate-in mt-3 flex items-center justify-between p-6 transition hover:bg-[#FAFAF8]`}
        >
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <ScanFace className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Assessments</p>
          </div>
          <ArrowRight className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
        </Link>

        <Link
          href={'/questionnaires' as Route}
          className={`${CARD} mef-animate-in mt-3 flex items-center justify-between p-6 transition hover:bg-[#FAFAF8]`}
        >
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Questionnaires</p>
          </div>
          <ArrowRight className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
        </Link>

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
                    Mood {c.mood_level ?? '—'} · Energy {c.energy_level ?? '—'} · Stress{' '}
                    {c.stress_level ?? '—'}
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
            <p className="mt-3 text-sm text-[#6B7A72]">No check-ins logged yet.</p>
          )}
        </section>
      </main>

      <BottomNav isCoach={isCoach} />

      <FloatingCoachLauncher entryPoint="progress_pattern" entryContext={entryContext} />
    </div>
  );
}
