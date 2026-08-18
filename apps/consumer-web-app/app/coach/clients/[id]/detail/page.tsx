/**
 * Everything the coach's member view used to show, on one page, unchanged.
 *
 * The audit counted roughly thirty panels here in one flat column, all the
 * same visual weight, and found that the six questions a coach opens a
 * member to answer had to be answered by scrolling past all of them. Those
 * six questions are now the first screen (../page.tsx). Nothing was
 * deleted: every panel that was on that page is on this one, in the same
 * order, doing the same thing, one tap away.
 *
 * "What her app contains", the Visibility Layer panel from the previous
 * build, is still here and is also linked directly from the first screen,
 * because it is the panel a coach reaches for deliberately rather than
 * stumbles onto.
 */

import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Droplet,
  Moon,
  Activity,
  Bone,
  TrendingUp,
  Smile,
  Utensils,
  Footprints,
  Zap,
  Lightbulb,
  ListChecks,
  History,
  ClipboardList,
} from 'lucide-react';
import type { Route } from 'next';
import type { Profile } from '@mef/shared-types-contracts';
import {
  getClientHabits,
  getClientHabitLogs,
  getCoachNotes,
  getClientBaselineAssessment,
  getClientAssessmentHistory,
  getClientProgressComparison,
} from '@/app/actions/coach';
import { getClientNarrative } from '@/app/actions/narrative';
import { getClientFeedHistory, listContentLibraryForCoach } from '@/app/actions/feed';
import { getClientCoachingDecision } from '@/app/actions/coaching-brain';
import { getClientWellnessIntelligence } from '@/app/actions/wellness-intelligence';
import {
  getClientIntelligenceReport,
  getClientCoachAlerts,
} from '@/app/actions/intelligence-engine';
import { getClientRootCauseSignals } from '@/app/actions/rootCauseSignals';
import { getClientRootMap } from '@/app/actions/rootMap';
import { getClientCaseViewAction } from '@/app/actions/caseView';
import { getClientCoachingEscalationsAction } from '@/app/actions/coachingEscalations';
import { getClientHydrationFocusState } from '@/app/actions/hydration';
import { getClientRecommendations } from '@/app/actions/recommendations';
import { getClientLifestyleExperiments } from '@/app/actions/lifestyleExperiments';
import {
  getClientLongitudinalSignals,
  getClientRecommendationEvents,
} from '@/app/actions/longitudinalIntelligence';
import { getClientCoachWorkspaceSummary } from '@/app/actions/rootCoaching';
import { getClientIntelligenceCoreSummary } from '@/app/actions/intelligence-core';
import {
  getClientConversationSessionsAction,
  getClientConversationMessagesAction,
  getSessionHandoffsAction,
} from '@/app/actions/conversation-coach';
import { getClientBodyAssessmentsAction } from '@/app/actions/body-assessment';
import { getClientWbsaSessionsAction } from '@/app/actions/wbsa';
import { getClientCvsSessionsAction } from '@/app/actions/coreValuesSnapshot';
import { getClientLscSessionsAction } from '@/app/actions/lifeSignalCheck';
import { getClientRplSessionsAction } from '@/app/actions/readinessPulse';
import { getClientResetPlanAction } from '@/app/actions/resetPlan';
import { getClientAssessmentAssignments } from '@/app/actions/assessmentAssignments';
import {
  getClientMovementProfile,
  getClientMovementProfileReviewQueue,
} from '@/app/actions/movement-profile';
import { getClientProgramAssignmentSummariesAction } from '@/app/actions/coach-programs';
import {
  listAssessmentRegistryEntries,
  listAssignableAssessments,
} from '@/lib/assessment-registry/registry';
import { buildClientSummary } from '../../../lib';
import { EnergyTrendChart } from '@/components/EnergyTrendChart';
import { WellnessIndexCard } from '@/app/dashboard/WellnessIndexCard';
import { BaselineAssessmentView } from '@/components/BaselineAssessmentView';
import { AssessmentComparisonView } from '@/components/AssessmentComparisonView';
import { AssessmentHistoryList } from '@/components/AssessmentHistoryList';
import { CoachNotesPanel } from '../CoachNotesPanel';
import { HydrationTrackingToggle } from '../HydrationTrackingToggle';
import { MemberVisibilityPanel } from '../MemberVisibilityPanel';
import { getMemberVisibilityForCoachAction } from '@/app/actions/visibility';
import { NarrativePanel } from '../NarrativePanel';
import { FeedPanel } from '../FeedPanel';
import { BrainPanel } from '../BrainPanel';
import { IntelligencePanel } from '../IntelligencePanel';
import { MemberIntelligencePanel } from '../MemberIntelligencePanel';
import { RootCauseSignalsPanel } from '../RootCauseSignalsPanel';
import { RootMapPanel } from '../RootMapPanel';
import { CaseViewPanel } from '../CaseViewPanel';
import { CoachingEscalationsPanel } from '../CoachingEscalationsPanel';
import { RecommendationsPanel } from '../RecommendationsPanel';
import { LongitudinalIntelligencePanel } from '../LongitudinalIntelligencePanel';
import { CoachWorkspacePanel } from '../CoachWorkspacePanel';
import { IntelligenceCorePanel } from '../IntelligenceCorePanel';
import { ConversationPanel } from '../ConversationPanel';
import { BodyAssessmentPanel } from '../BodyAssessmentPanel';
import { WbsaPanel } from '../WbsaPanel';
import { CoreValuesSnapshotPanel } from '../CoreValuesSnapshotPanel';
import { LifeSignalCheckPanel } from '../LifeSignalCheckPanel';
import { ReadinessPulsePanel } from '../ReadinessPulsePanel';
import { PersonalResetPlanPanel } from '../PersonalResetPlanPanel';
import { AssessmentAssignmentPanel } from '../AssessmentAssignmentPanel';
import { MovementProfilePanel } from '../MovementProfilePanel';
import { ClientProgramsSummaryCard } from '@/components/coach-program-builder/ClientProgramsSummaryCard';
import {
  stressStatus,
  painStatus,
  sleepQualityStatus,
  sleepDurationStatus,
  waterStatus,
  moodStatus,
  digestionStatus,
  movementStatus,
  STATUS_STYLES,
} from '@/lib/wellness/status';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const TRACKER_CARD = `${CARD} flex min-h-[152px] flex-col p-5`;

function stressLabel(level: number | null): string {
  if (level === null) return 'Not logged';
  if (level <= 2) return 'Low';
  if (level === 3) return 'Moderate';
  return 'High';
}
function painLabel(level: number | null): string {
  if (level === null) return 'Not logged';
  if (level === 0) return 'None';
  if (level === 1) return 'Mild';
  if (level <= 3) return 'Moderate';
  return 'Severe';
}
function moodLabel(level: number | null): string {
  if (level === null) return 'Not logged';
  if (level <= 2) return 'Low';
  if (level === 3) return 'Neutral';
  return 'Good';
}
function digestionLabel(level: number | null): string {
  if (level === null) return 'Not logged';
  if (level <= 2) return 'Poor';
  if (level === 3) return 'Fair';
  return 'Good';
}
function movementLabel(level: 'none' | 'light' | 'moderate' | 'full_session' | null): string {
  if (level === null) return 'Not logged';
  if (level === 'none') return 'None';
  if (level === 'light') return 'Light';
  if (level === 'moderate') return 'Moderate';
  return 'Full session';
}

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default async function ClientDetailFullPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: coachProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  const coachName = coachProfile?.display_name ?? 'Your coach';

  // RLS (coach_read_assigned_client_profile, migration 16) is what actually
  // enforces this — an id for a client this coach isn't assigned to simply
  // returns no row, not a permissions error, so this is a clean 404.
  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', params.id)
    .single();
  if (!clientProfile) notFound();

  const profile = clientProfile as Profile;
  const firstName = profile.display_name?.split(' ')[0] ?? 'This client';

  const summary = await buildClientSummary(profile);
  const [
    habits,
    habitLogs,
    notes,
    baseline,
    assessmentHistory,
    progressComparison,
    narrativeItems,
    feedHistory,
    contentLibrary,
    brainDecision,
    wellnessIntelligence,
    conversationSessions,
    intelligenceReport,
    coachAlerts,
    intelligenceCoreSummary,
    bodyAssessments,
    wbsaSessions,
    cvsSessions,
    lscSessions,
    rplSessions,
    resetPlanView,
    assessmentAssignments,
    movementProfile,
    movementProfileReviewItems,
    programAssignmentSummaries,
    rootCauseSignals,
    rootMap,
    clientRecommendations,
    clientExperiments,
    clientLongitudinalSignals,
    clientRecommendationEvents,
    coachWorkspaceSummary,
    clientCaseView,
    coachingEscalations,
    hydrationFocusState,
  ] = await Promise.all([
    getClientHabits(profile.id),
    getClientHabitLogs(profile.id, summary.todaysLocalDate),
    getCoachNotes(profile.id),
    getClientBaselineAssessment(profile.id),
    getClientAssessmentHistory(profile.id),
    getClientProgressComparison(profile.id),
    getClientNarrative(profile.id),
    getClientFeedHistory(profile.id),
    listContentLibraryForCoach(),
    getClientCoachingDecision(profile.id),
    getClientWellnessIntelligence(profile.id),
    getClientConversationSessionsAction(profile.id),
    getClientIntelligenceReport(profile.id),
    getClientCoachAlerts(profile.id),
    getClientIntelligenceCoreSummary(profile.id),
    getClientBodyAssessmentsAction(profile.id),
    getClientWbsaSessionsAction(profile.id),
    getClientCvsSessionsAction(profile.id),
    getClientLscSessionsAction(profile.id),
    getClientRplSessionsAction(profile.id),
    getClientResetPlanAction(profile.id),
    getClientAssessmentAssignments(profile.id),
    getClientMovementProfile(profile.id),
    getClientMovementProfileReviewQueue(profile.id),
    getClientProgramAssignmentSummariesAction(profile.id),
    getClientRootCauseSignals(profile.id),
    getClientRootMap(profile.id),
    getClientRecommendations(profile.id),
    getClientLifestyleExperiments(profile.id),
    getClientLongitudinalSignals(profile.id),
    getClientRecommendationEvents(profile.id),
    getClientCoachWorkspaceSummary(profile.id),
    getClientCaseViewAction(profile.id),
    getClientCoachingEscalationsAction(profile.id),
    getClientHydrationFocusState(profile.id),
  ]);

  // Conditional water tracking (migration 163). One value, used both to
  // decide whether the Water tracker card below exists for this client and
  // as the current position of the coach's own toggle, so the card and the
  // control can never contradict each other.
  const hydrationTracked = hydrationFocusState.focus !== false;

  const assignableAssessments = listAssignableAssessments().map((e) => ({
    key: e.key,
    displayName: e.displayName,
  }));
  const assessmentDisplayNameById = Object.fromEntries(
    listAssessmentRegistryEntries().map((e) => [e.databaseId, e.displayName])
  );

  const latestConversationSession = conversationSessions[0] ?? null;
  const [conversationMessages, conversationHandoffs] = latestConversationSession
    ? await Promise.all([
        getClientConversationMessagesAction(latestConversationSession.id),
        getSessionHandoffsAction(latestConversationSession.id),
      ])
    : [[], []];

  const checkin = summary.todaysCheckin;
  const chartCheckins = [...summary.checkins].reverse(); // oldest first, matches EnergyTrendChart's contract

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href={`/coach/clients/${params.id}` as Route}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to {profile.display_name?.split(' ')[0] ?? 'this client'}
        </Link>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
              {profile.display_name ?? 'Unnamed client'}
            </h1>
            <p className="mt-1 text-sm text-[#6B7A72]">
              {summary.hasCheckedInToday
                ? 'Checked in today'
                : `Last check-in: ${summary.lastCheckinDate ? formatDate(summary.lastCheckinDate) : 'none yet'}`}
            </p>
          </div>
          {summary.attentionReasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {summary.attentionReasons.map((reason) => (
                <span
                  key={reason}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES.poor.bg} ${STATUS_STYLES.poor.text}`}
                >
                  {reason}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Member Detail — the one place a coach reads what this member
            actually entered (her check-in answers day by day, the adaptive
            follow-ups, her stated goals, her completed questionnaires and
            her conversations with Root). Everything derived from those
            answers stays in the panels below; this link is deliberately
            above them because "what did she actually say" is the question a
            coach opens a client to answer. */}
        <Link
          href={`/coach/clients/${params.id}/entries` as Route}
          data-member-entries-link="true"
          className="mef-focus-ring mt-5 flex items-center justify-between gap-4 rounded-[28px] bg-white px-5 py-4 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition-colors hover:bg-[#1B3A2D]/[0.03]"
        >
          <span>
            <span className="block text-sm font-semibold uppercase tracking-wider text-[#3E5C46]">
              What {profile.display_name?.split(' ')[0] ?? 'she'} entered
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-[#6B7A72]">
              Her check-in answers day by day, her stated goals, what she has completed, and her
              conversations with Root. Nothing scored or inferred.
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
        </Link>

        <div className="mt-6 space-y-5">
          {/* Daily Wellness Index, Today's Priority, Strongest Area — coach voice */}
          <WellnessIndexCard
            result={summary.wellnessIndex}
            previousScore={summary.previousWellnessIndex?.score ?? null}
            clientFirstName={firstName}
          />

          {/* Conditional water tracking (migration 163) — the coach's
              override of what this member said about her own water intake.
              Placed with the day's trackers rather than buried in a settings
              panel, because it changes what those trackers show. */}
          <HydrationTrackingToggle
            memberId={profile.id}
            focus={hydrationFocusState.focus}
            source={hydrationFocusState.source}
          />

          {/* VISIBILITY LAYER (2026-08-17) — which of her features are on,
              which are off, and the reason for each. Sits directly beneath
              the hydration toggle because that toggle is the same kind of
              decision, made one feature at a time; this is every other
              feature in the app on the same terms. */}
          <div id="member-visibility">
          <MemberVisibilityPanel
            memberId={profile.id}
            features={await getMemberVisibilityForCoachAction(profile.id)}
          />
          </div>

          {/* Mood / Energy / Sleep / Stress / Water / Pain / Digestion / Movement */}
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            <div className={TRACKER_CARD}>
              <div className="flex items-center gap-2 text-[#854D0E]">
                <Smile className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Mood</p>
              </div>
              <p
                className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[moodStatus(checkin?.mood_level ?? null)].text}`}
              >
                {moodLabel(checkin?.mood_level ?? null)}
              </p>
            </div>

            <div className={TRACKER_CARD}>
              <div className="flex items-center gap-2 text-[#854D0E]">
                <Zap className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Energy</p>
              </div>
              <p className="mt-3 text-2xl font-semibold text-[#1B3A2D]">
                {checkin?.energy_level != null ? `${checkin.energy_level} / 5` : 'Not logged'}
              </p>
            </div>

            <div className={TRACKER_CARD}>
              <div className="flex items-center gap-2 text-[#854D0E]">
                <Moon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Sleep</p>
              </div>
              <p
                className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[sleepDurationStatus(checkin?.sleep_duration ?? null)].text}`}
              >
                {checkin?.sleep_duration ?? 'Not logged'}
              </p>
              {checkin?.sleep_quality != null && (
                <p
                  className={`mt-1 text-xs ${STATUS_STYLES[sleepQualityStatus(checkin.sleep_quality)].text}`}
                >
                  Quality {checkin.sleep_quality} / 5
                </p>
              )}
            </div>

            <div className={TRACKER_CARD}>
              <div className="flex items-center gap-2 text-[#854D0E]">
                <Activity className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Stress</p>
              </div>
              <p
                className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[stressStatus(checkin?.stress_level ?? null)].text}`}
              >
                {stressLabel(checkin?.stress_level ?? null)}
              </p>
            </div>

            {/* Conditional water tracking (migration 163) — no Water card at
                all for a client who does not track water. "Not logged" here
                would read as a missed day rather than a metric that does not
                apply to her, which is exactly the false signal this feature
                exists to remove. */}
            {hydrationTracked && (
              <div className={TRACKER_CARD}>
                <div className="flex items-center gap-2 text-[#854D0E]">
                  <Droplet className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-sm font-semibold uppercase tracking-wider">Water</p>
                </div>
                <p
                  className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[waterStatus(checkin?.water_cups ?? null)].text}`}
                >
                  {checkin?.water_cups != null ? `${checkin.water_cups} cups` : 'Not logged'}
                </p>
              </div>
            )}

            <div className={TRACKER_CARD}>
              <div className="flex items-center gap-2 text-[#854D0E]">
                <Bone className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Pain</p>
              </div>
              <p
                className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[painStatus(checkin?.pain_discomfort_level ?? null)].text}`}
              >
                {painLabel(checkin?.pain_discomfort_level ?? null)}
              </p>
            </div>

            <div className={TRACKER_CARD}>
              <div className="flex items-center gap-2 text-[#854D0E]">
                <Utensils className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Digestion</p>
              </div>
              <p
                className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[digestionStatus(checkin?.digestion_rating ?? null)].text}`}
              >
                {digestionLabel(checkin?.digestion_rating ?? null)}
              </p>
            </div>

            <div className={TRACKER_CARD}>
              <div className="flex items-center gap-2 text-[#854D0E]">
                <Footprints className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Movement</p>
              </div>
              <p
                className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[movementStatus(checkin?.movement_today ?? null)].text}`}
              >
                {movementLabel(checkin?.movement_today ?? null)}
              </p>
            </div>
          </div>

          {/* Energy Trend chart — same component/behavior as the member dashboard */}
          <section className={`${CARD} p-6`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#854D0E]">
                <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Energy Trend</p>
              </div>
              <span className="text-xs text-[#6B7A72]">
                {chartCheckins.length > 0 ? `Last ${chartCheckins.length} check-ins` : ''}
              </span>
            </div>
            <EnergyTrendChart checkins={chartCheckins} showBars />
          </section>

          {/* Coaching Insights — automatically detected patterns, real data only */}
          <section className={`${CARD} p-6`}>
            <div className="flex items-center gap-2 text-[#854D0E]">
              <Lightbulb className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Coaching Insights</p>
            </div>
            {summary.insights.length > 0 ? (
              <ul className="mt-3 space-y-2.5">
                {summary.insights.map((insight) => (
                  <li
                    key={`${insight.key}-${insight.kind}`}
                    className={`rounded-2xl p-4 text-sm leading-relaxed ${
                      insight.direction === 'declining'
                        ? `${STATUS_STYLES.attention.bg} ${STATUS_STYLES.attention.text}`
                        : `${STATUS_STYLES.good.bg} ${STATUS_STYLES.good.text}`
                    }`}
                  >
                    {insight.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[#6B7A72]">
                No notable patterns yet, insights build as more check-ins come in.
              </p>
            )}
          </section>

          {/* Coaching Brain — the same Daily Decision Object the client's own /today page renders (Milestone 5) */}
          <BrainPanel decision={brainDecision} />

          {/* Root has flagged (Adaptive Coaching Direction Part 3) — the
              coaching threads Root offered as written, then smaller, then
              reframed, and could not make land. Sits directly under the
              Coaching Brain because it is about the same daily decision
              layer, and above the longer-horizon intelligence panels
              because it is the one thing here that is waiting on the
              coach to do something. Renders in its empty state too, so
              "nothing is flagged" is distinguishable from a broken
              section. */}
          <CoachingEscalationsPanel clientId={profile.id} escalations={coachingEscalations} />

          {/* Personal Wellness Intelligence — longer-term trends/patterns across weeks and months (Milestone 6) */}
          <IntelligencePanel clientId={profile.id} insights={wellnessIntelligence} />

          {/* MEF Intelligence Engine — the centralized longitudinal layer
              (Member Health Profile, longitudinal trends, patterns, root
              cause hypotheses, coaching priorities, recommendations,
              member summary, coach alerts) every coaching surface now
              shares (Milestone 8) */}
          {intelligenceReport && (
            <MemberIntelligencePanel
              clientId={profile.id}
              report={intelligenceReport}
              alerts={coachAlerts}
            />
          )}

          {/* Root Cause Signals — the Universal Assessment Intelligence
              Engine's cross-assessment view: most-supported hypotheses
              enriched with which assessments back them, cross-assessment
              correlations, the finding timeline, and finding-driven
              assessment/reassessment suggestions (Prompt 6). Coach-only. */}
          {rootCauseSignals && <RootCauseSignalsPanel signals={rootCauseSignals} />}

          {/* Root Map (Prompt 10) — the member-facing plain-language,
              per-domain view, extended here with safety flags, pending
              reassessments, and Root Router decision history. Coach-only. */}
          {rootMap && <RootMapPanel rootMap={rootMap} />}

          {/* Case View — the member's own goal/driver/correlation case
              view, extended here with the raw numbers behind each
              finding (observation count, span, rho, split-window
              agreement). Same builder as the member sees, nothing
              computed here. Coach-only. */}
          <div id="case-view">
            <CaseViewPanel caseView={clientCaseView} localDate={summary.todaysLocalDate} />
          </div>

          {/* Recommendations (Prompt 11) — the Recommendation Engine's
              persisted, explainable suggestions and any Lifestyle
              Experiments this member has started. Coach-only, read-only. */}
          <RecommendationsPanel
            recommendations={clientRecommendations}
            experiments={clientExperiments}
            events={clientRecommendationEvents}
          />

          {/* Longitudinal Intelligence (Prompt 12) — signal-state timeline
              (emerging/established/improving/worsening/stale/conflicting),
              suggested next coaching questions, why the Root Router chose
              its current outcome, and a coach-initiated reassessment
              request. The one new coach panel this prompt adds. */}
          {rootMap && (
            <LongitudinalIntelligencePanel
              clientId={profile.id}
              signals={clientLongitudinalSignals}
              routerOutcome={rootMap.routerOutcome}
              assignableAssessments={assignableAssessments}
            />
          )}

          {/* Coach Workspace (Prompt 13) — the Root Coaching Conversation
              Engine's conversation summary, current priorities, recent
              coaching themes, and suggested discussion topics/questions.
              Coach-only; members never see this panel. */}
          {coachWorkspaceSummary && <CoachWorkspacePanel summary={coachWorkspaceSummary} />}

          {/* MEF Wellness Intelligence Core — the durable "who is this
              member as a coaching subject" model: wellness identity
              observations, the 15-dimension wellness profile, a learned
              coaching style, and leverage-capped prioritization
              (Milestone 9) */}
          {intelligenceCoreSummary && (
            <IntelligenceCorePanel clientId={profile.id} summary={intelligenceCoreSummary} />
          )}

          {/* Coaching Conversation — the MEF Conversation Coach transcript,
              handoff requests, and restrict/reopen control (Milestone 7) */}
          <ConversationPanel
            clientId={profile.id}
            sessions={conversationSessions}
            initialMessages={conversationMessages}
            initialHandoffs={conversationHandoffs}
          />

          {/* AI Body Assessment Framework — guided posture/movement
              assessment history; full capture review, findings,
              confirm/override, and coach review workflow live on their
              own dedicated page (captures/video need more room than a
              dashboard panel). */}
          <BodyAssessmentPanel clientId={profile.id} assessments={bodyAssessments} />

          {/* WBSA — Whole-Body Systems Assessment, the first real content
              on the Unified Adaptive Assessment Runtime. Same "counts and
              flags only in the list, full detail on its own page" split as
              Body Assessment above. */}
          <WbsaPanel clientId={profile.id} sessions={wbsaSessions} />

          {/* Core Values Snapshot — free-tier Experience 1, also on the
              Unified Adaptive Assessment Runtime. Same summary-list +
              full-detail-on-its-own-page split as WBSA above. */}
          <CoreValuesSnapshotPanel clientId={profile.id} sessions={cvsSessions} />

          {/* Life Signal Check — free-tier Experience 2, also on the
              Unified Adaptive Assessment Runtime. Same summary-list +
              full-detail-on-its-own-page split as Core Values Snapshot above. */}
          <LifeSignalCheckPanel clientId={profile.id} sessions={lscSessions} />

          {/* Readiness Pulse — free-tier Experience 3, the final
              conversation of the free arc, also on the Unified Adaptive
              Assessment Runtime. Same summary-list + full-detail-on-its-
              own-page split as Core Values Snapshot/Life Signal Check
              above. */}
          <ReadinessPulsePanel clientId={profile.id} sessions={rplSessions} />

          {/* Personal Reset Plan — the first monthly-member experience,
              read-only here (no coach editing in this build): current
              plan, the snapshot inputs that built it, adherence from the
              daily log, and version history. */}
          <PersonalResetPlanPanel view={resetPlanView} />

          {/* Movement Profile — permanent movement record + Pending Coach
              Review worklist (Member Exercise Experience & Movement
              Profile milestone) */}
          <MovementProfilePanel
            clientId={profile.id}
            profile={movementProfile}
            reviewItems={movementProfileReviewItems}
          />

          {/* Coach Program Builder — assigned workout programs summary,
              links through to the full assignment list and the Program
              Library (Coach Program Builder milestone) */}
          <ClientProgramsSummaryCard clientId={profile.id} summaries={programAssignmentSummaries} />

          {/* Coach assignment minimum interface — Assessment Registry framework */}
          <AssessmentAssignmentPanel
            clientId={profile.id}
            assignableAssessments={assignableAssessments}
            assignmentsByDefinitionId={assessmentDisplayNameById}
            initialAssignments={assessmentAssignments}
          />

          {/* Member Narrative — structured, evolving understanding (Milestone 2) */}
          <NarrativePanel clientId={profile.id} items={narrativeItems} />

          {/* Daily Coaching Feed — preview and replace (Milestone 3) */}
          <FeedPanel history={feedHistory} contentLibrary={contentLibrary} />

          {/* Habit completion — today's active habits */}
          <section className={`${CARD} p-6`}>
            <div className="flex items-center gap-2 text-[#854D0E]">
              <ListChecks className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">
                Habit Completion Today
              </p>
            </div>
            {habits.length > 0 ? (
              <ul className="mt-3 divide-y divide-[#1B3A2D]/5">
                {habits.map((habit) => {
                  const completed = habitLogs[habit.id] === true;
                  return (
                    <li
                      key={habit.id}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <span className="font-medium text-[#1B3A2D]">{habit.title}</span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          completed
                            ? `${STATUS_STYLES.good.bg} ${STATUS_STYLES.good.text}`
                            : `${STATUS_STYLES['no-data'].bg} ${STATUS_STYLES['no-data'].text}`
                        }`}
                      >
                        {completed ? 'Completed' : 'Not yet'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[#6B7A72]">No active habits assigned.</p>
            )}
          </section>

          {/* Baseline Assessment — the client's original onboarding
              submission, permanently preserved. Same data/formatting the
              client sees on their own Baseline Assessment page. */}
          <section>
            <div className="mb-3 flex items-center gap-2 text-[#854D0E]">
              <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Baseline Assessment</p>
            </div>
            {baseline ? (
              <BaselineAssessmentView
                baseline={baseline}
                description={`${firstName}'s Baseline Assessment reflects what they shared when they first joined, a starting point for measuring progress over time.`}
              />
            ) : (
              <div className={`${CARD} p-6`}>
                <p className="text-sm text-[#6B7A72]">
                  {firstName} hasn&apos;t completed their onboarding assessment yet.
                </p>
              </div>
            )}
          </section>

          {/* Baseline vs. latest reassessment, progress summary, and the
              full assessment history — same computation and formatting
              the member sees on their own Progress & Reassessments page. */}
          {baseline && (
            <section>
              <div className="mb-3 flex items-center gap-2 text-[#854D0E]">
                <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">
                  Progress & Reassessments
                </p>
              </div>
              <div className="space-y-5">
                <AssessmentComparisonView
                  metrics={progressComparison.metrics}
                  summary={progressComparison.summary}
                  hasLatest={progressComparison.latest !== null}
                  canTakeAssessment={false}
                />
                <AssessmentHistoryList
                  history={assessmentHistory}
                  baselineHref={`/coach/clients/${profile.id}/assessments/${baseline.submissionId}`}
                  reassessmentHref={(submissionId) =>
                    `/coach/clients/${profile.id}/assessments/${submissionId}`
                  }
                />
              </div>
            </section>
          )}

          {/* Check-in history / wellness history */}
          <section className={`${CARD} p-6`}>
            <div className="flex items-center gap-2 text-[#854D0E]">
              <History className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Check-in History</p>
            </div>
            {summary.checkins.length > 0 ? (
              <ul className="mt-3 divide-y divide-[#1B3A2D]/5">
                {summary.checkins.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="font-medium text-[#1B3A2D]">{formatDate(c.local_date)}</span>
                    <span className="text-[#6B7A72]">
                      Mood {c.mood_level ?? '-'} · Energy {c.energy_level ?? '-'} · Sleep{' '}
                      {c.sleep_duration ?? '-'} · Stress {c.stress_level ?? '-'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[#6B7A72]">No check-ins recorded yet.</p>
            )}
          </section>

          {/* Coach Notes — private, never visible to members */}
          <CoachNotesPanel clientId={profile.id} initialNotes={notes} coachName={coachName} />
        </div>
      </main>

    </div>
  );
}
