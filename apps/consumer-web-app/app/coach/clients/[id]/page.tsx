import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
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
import { getClientIntelligenceCoreSummary } from '@/app/actions/intelligence-core';
import {
  getClientConversationSessionsAction,
  getClientConversationMessagesAction,
  getSessionHandoffsAction,
} from '@/app/actions/conversation-coach';
import { getClientBodyAssessmentsAction } from '@/app/actions/body-assessment';
import { getClientAssessmentAssignments } from '@/app/actions/assessmentAssignments';
import {
  listAssessmentRegistryEntries,
  listAssignableAssessments,
} from '@/lib/assessment-registry/registry';
import { buildClientSummary } from '../../lib';
import { BottomNav } from '@/components/BottomNav';
import { EnergyTrendChart } from '@/components/EnergyTrendChart';
import { WellnessIndexCard } from '@/app/dashboard/WellnessIndexCard';
import { BaselineAssessmentView } from '@/components/BaselineAssessmentView';
import { AssessmentComparisonView } from '@/components/AssessmentComparisonView';
import { AssessmentHistoryList } from '@/components/AssessmentHistoryList';
import { CoachNotesPanel } from './CoachNotesPanel';
import { NarrativePanel } from './NarrativePanel';
import { FeedPanel } from './FeedPanel';
import { BrainPanel } from './BrainPanel';
import { IntelligencePanel } from './IntelligencePanel';
import { MemberIntelligencePanel } from './MemberIntelligencePanel';
import { IntelligenceCorePanel } from './IntelligenceCorePanel';
import { ConversationPanel } from './ConversationPanel';
import { BodyAssessmentPanel } from './BodyAssessmentPanel';
import { AssessmentAssignmentPanel } from './AssessmentAssignmentPanel';
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

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
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
    assessmentAssignments,
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
    getClientAssessmentAssignments(profile.id),
  ]);

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
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href="/coach"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to clients
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

        <div className="mt-6 space-y-5">
          {/* Daily Wellness Index, Today's Priority, Strongest Area — coach voice */}
          <WellnessIndexCard
            result={summary.wellnessIndex}
            previousScore={summary.previousWellnessIndex?.score ?? null}
            clientFirstName={firstName}
          />

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
            <EnergyTrendChart checkins={chartCheckins} />
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
                No notable patterns yet — insights build as more check-ins come in.
              </p>
            )}
          </section>

          {/* Coaching Brain — the same Daily Decision Object the client's own /today page renders (Milestone 5) */}
          <BrainPanel decision={brainDecision} />

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
                description={`${firstName}'s Baseline Assessment reflects what they shared when they first joined — a starting point for measuring progress over time.`}
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
                      Mood {c.mood_level ?? '—'} · Energy {c.energy_level ?? '—'} · Sleep{' '}
                      {c.sleep_duration ?? '—'} · Stress {c.stress_level ?? '—'}
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

      {/* middleware.ts already redirected anyone without the coach role
          before this page rendered, so isCoach is always true here. */}
      <BottomNav isCoach />
    </div>
  );
}
