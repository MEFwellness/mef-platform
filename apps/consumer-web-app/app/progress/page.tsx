import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { TrendingUp, Flame, MessageCircle, History as HistoryIcon, ArrowRight, ScanFace, ClipboardList } from 'lucide-react';
import { getRecentCheckins } from '@/app/actions/checkin';
import { getMyWellnessPatterns } from '@/app/actions/wellness-intelligence';
import { getMyWellnessIdentityHighlights, getMyWellnessStorySummary } from '@/app/actions/intelligence-core';
import { getMyHealthProfileSummary } from '@/app/actions/health-profile';
import { getMyProgressComparison } from '@/app/actions/onboarding';
import { getMyWearableMetricHistory } from '@/app/actions/wearables';
import { getMyRootScoreHistory } from '@/app/actions/scoring';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { AvatarLink } from '@/components/AvatarLink';
import { BackButton } from '@/components/BackButton';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { RootQuickLink } from '@/components/RootQuickLink';
import { EnergyTrendChart } from '@/components/EnergyTrendChart';
import { AssessmentComparisonView } from '@/components/AssessmentComparisonView';
import { buildProgressEntryContext } from '@/lib/conversation-coach/entryContext';
import { WellnessPatternsPanel } from './WellnessPatternsPanel';
import { WellnessIdentityPanel } from './WellnessIdentityPanel';
import { WellnessStoryPanel } from './WellnessStoryPanel';
import { WearableTrendsPanel } from './WearableTrendsPanel';
import { ProgressRootScorePanel } from './ProgressRootScorePanel';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const SEVERITY_LABEL: Record<string, string> = {
  significant: 'significant',
  moderate: 'moderate',
  mild: 'mild',
  unknown: 'unclassified',
  none: 'resolved',
};

function calculateStreak(checkinsOldestFirst: { local_date: string }[]): number {
  if (checkinsOldestFirst.length === 0) return 0;

  let streak = 1;
  for (let i = checkinsOldestFirst.length - 1; i > 0; i--) {
    const current = new Date(checkinsOldestFirst[i]!.local_date);
    const previous = new Date(checkinsOldestFirst[i - 1]!.local_date);
    const dayDiff = Math.round((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));
    if (dayDiff === 1) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

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
  ] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    getRecentCheckins(30),
    getMyWellnessPatterns(),
    getMyWellnessIdentityHighlights(),
    getMyWellnessStorySummary(),
    getMyHealthProfileSummary(),
    getMyProgressComparison(),
    getMyWearableMetricHistory('readiness_score', 14),
    getMyWearableMetricHistory('sleep_duration_minutes', 7),
    getMyWearableMetricHistory('steps', 7),
    getMyWearableMetricHistory('stress_score', 7),
    getMyRootScoreHistory(90),
  ]);
  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';
  const streak = calculateStreak(recentCheckins);
  const history = [...recentCheckins].reverse(); // most recent first for the list

  const activeFindingSeverities = healthProfileSummary
    ? Object.entries(healthProfileSummary.activeRegistryFindingsBySeverity).filter(([, count]) => count > 0)
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back to Home" />

        <div className="mt-4 flex items-start justify-between gap-3">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Your Wellness Story
          </h1>
          <AvatarLink firstName={firstName} />
        </div>
        <p className="mt-2 text-[15px] text-[#6B7A72]">
          Your health journey so far — trends, strengths, and what to focus on next.
        </p>

        <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-3">
          <section className={`${CARD} p-6`}>
            <div className="flex items-center gap-2 text-[#6B7A72]">
              <Flame className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Current streak</p>
            </div>
            {streak > 0 ? (
              <p className="mt-3 text-3xl font-semibold text-[#1B3A2D]">
                {streak}{' '}
                <span className="text-base font-normal text-[#6B7A72]">
                  day{streak === 1 ? '' : 's'}
                </span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-[#6B7A72]">Check in today to start a streak.</p>
            )}
          </section>

          <section className={`${CARD} p-6`}>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
              Check-ins logged
            </p>
            <p className="mt-3 text-3xl font-semibold text-[#1B3A2D]">{recentCheckins.length}</p>
            <p className="mt-1 text-sm text-[#6B7A72]">In the last 30 recorded days</p>
          </section>

          <section className={`${CARD} p-6`}>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
              Average energy
            </p>
            {recentCheckins.length > 0 ? (
              <p className="mt-3 text-3xl font-semibold text-[#1B3A2D]">
                {(
                  recentCheckins.reduce((sum, c) => sum + (c.energy_level ?? 0), 0) /
                  recentCheckins.length
                ).toFixed(1)}
                <span className="text-base font-normal text-[#6B7A72]"> / 5</span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-[#6B7A72]">Not enough data yet</p>
            )}
          </section>
        </div>

        <ProgressRootScorePanel history={rootScoreHistory} />

        <section className={`${CARD} mt-5 p-6`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#6B7A72]">
              <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Energy trend</p>
            </div>
            <span className="text-xs text-[#6B7A72]">
              {recentCheckins.length > 0 ? `Last ${recentCheckins.length} check-ins` : ''}
            </span>
          </div>
          <EnergyTrendChart checkins={recentCheckins} />
        </section>

        <WearableTrendsPanel
          readinessHistory={readinessHistory}
          sleepHistory={sleepHistory}
          stepsHistory={stepsHistory}
          stressHistory={stressHistory}
        />

        {healthProfileSummary && activeFindingSeverities.length > 0 && (
          <section className={`${CARD} mef-animate-in mt-5 p-6`}>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
              From Your Assessments
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[#1B3A2D]">
              {activeFindingSeverities
                .map(([severity, count]) => `${count} ${SEVERITY_LABEL[severity] ?? severity} finding${count === 1 ? '' : 's'}`)
                .join(', ')}{' '}
              currently active
              {healthProfileSummary.lastAssessmentPublishedAt
                ? ` since your last published report (${new Date(healthProfileSummary.lastAssessmentPublishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}).`
                : '.'}
            </p>
          </section>
        )}

        {wellnessStory && <WellnessStoryPanel summary={wellnessStory} />}

        <WellnessPatternsPanel insights={wellnessPatterns} />
        <WellnessIdentityPanel highlights={wellnessIdentity} />

        <AssessmentComparisonView
          metrics={progressComparison.metrics}
          summary={progressComparison.summary}
          hasLatest={Boolean(progressComparison.latest)}
        />

        <Link
          href="/progress/timeline"
          className={`${CARD} mef-animate-in mt-5 flex items-center justify-between p-6 transition hover:bg-[#FAFAF8]`}
        >
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <HistoryIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Your Health Timeline</p>
          </div>
          <ArrowRight className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
        </Link>

        {/* Two separate, equal-weight, full-width stacked cards — same
            pattern as every other card on this page, no grid/breakpoint
            logic that could collapse or hide either one on any viewport.
            Assessments (posture/movement, Body Assessment at /assessment)
            is unchanged from before; Questionnaires (self-reported wellness
            questionnaires, starting with CHEK HLC1 Nutrition & Lifestyle)
            is its own dedicated area at /questionnaires, not a card inside
            Assessments. Both moved here from the bottom nav (Premium UX
            Milestone 1) rather than getting their own permanent tabs. */}
        <Link
          href="/assessment"
          className={`${CARD} mef-animate-in mt-5 flex items-center justify-between p-6 transition hover:bg-[#FAFAF8]`}
        >
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <ScanFace className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Assessments</p>
          </div>
          <ArrowRight className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
        </Link>

        <Link
          href={'/questionnaires' as Route}
          className={`${CARD} mef-animate-in mt-5 flex items-center justify-between p-6 transition hover:bg-[#FAFAF8]`}
        >
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Questionnaires</p>
          </div>
          <ArrowRight className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
        </Link>

        <section className={`${CARD} mt-5 p-6`}>
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Talk to Root</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <RootQuickLink
              entryPoint="progress_pattern"
              entryContext={buildProgressEntryContext(wellnessPatterns)}
            >
              Help me understand this pattern
            </RootQuickLink>
            <RootQuickLink
              entryPoint="progress_improved"
              entryContext={buildProgressEntryContext(wellnessPatterns)}
            >
              What has improved?
            </RootQuickLink>
            <RootQuickLink
              entryPoint="progress_focus"
              entryContext={buildProgressEntryContext(wellnessPatterns)}
            >
              What should I focus on?
            </RootQuickLink>
          </div>
        </section>

        <section className={`${CARD} mt-5 p-6`}>
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
                    <span className="shrink-0 rounded-full bg-[#EFF6F1] px-2 py-0.5 text-xs text-[#1B3A2D]">
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

      <FloatingCoachLauncher
        entryPoint="progress_pattern"
        entryContext={buildProgressEntryContext(wellnessPatterns)}
      />
    </div>
  );
}
