/**
 * apps/consumer-web-app/app/dashboard/page.tsx
 *
 * Merge of your current design with Sprint 2's real-data wiring. Colors,
 * typography, spacing, card styling, and the logo are byte-for-byte the
 * same as what you pasted. What actually changed:
 *
 *   - Server Component now (was 'use client') — needed to fetch real data.
 *     Nothing in this file used client-only interactivity before; the only
 *     thing that does (nav active-state) is its own separate client
 *     component, BottomNav, imported in as before.
 *   - Health Score: REMOVED, per your instruction. Its two color helper
 *     functions (getDoctorColor, getHealthScoreTextColor) are gone with it
 *     since nothing else used them.
 *   - Four Doctors: REMOVED. Same reasoning as Health Score — no real data
 *     source computes these percentages. getDoctorTextColor is gone with it.
 *   - Removing both collapses the top grid from 4 items (with Health Score
 *     spanning 2 rows) down to 3 items in the same 3-column grid — this is
 *     the grid simply re-flowing now that one spanning item is gone, not a
 *     layout redesign. Nothing else about the grid changed.
 *   - Water/Sleep/Stress/Pain: now read today's actual daily_checkins row,
 *     with a real empty state when nothing's logged yet.
 *   - The trend chart reads real recent check-ins instead of a hardcoded
 *     array.
 *   - Today's Focus and the CTA now reflect whether you've actually checked
 *     in today, instead of static copy.
 *   - Next Session showed a fabricated "Coach Sarah, Thursday July 16" —
 *     there's no bookings table yet (Calendly integration is a later
 *     sprint), so this now honestly says nothing's scheduled instead of
 *     inventing a session. Flagging this since it wasn't named explicitly
 *     this round, but it's the same fabricated-data problem as the other two.
 *   - Nav is the same BottomNav component from Sprint 2 — identical classes
 *     to what was inline here before, just with real Link navigation and a
 *     real active state instead of a hardcoded `active: true` on Dashboard.
 *   - Fixed the logo's alt text from "THIS IS THE LOGO" to "Rooted Reset" —
 *     screen-reader-only change, zero visual effect, didn't touch anything
 *     else about the logo (size/placement/markup all identical).
 */

import Image from 'next/image';
import {
  Droplet,
  Moon,
  Activity,
  Bone,
  TrendingUp,
  Calendar,
  Smile,
  Utensils,
  Footprints,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTodaysCheckin, getRecentCheckins, resolveLocalDate } from '@/app/actions/checkin';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { AvatarLink } from '@/components/AvatarLink';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { EnergyTrendChart } from '@/components/EnergyTrendChart';
import { calculateWellnessIndex, inputsFromCheckin } from '@/lib/wellness/wellness-index';
import { RootScoreCard } from '@/components/RootScoreCard';
import { getMyRootScore } from '@/app/actions/scoring';
import { buildDashboardEntryContext } from '@/lib/conversation-coach/entryContext';
import { buildTimeContext } from '@/lib/feed/timeContext';
import { getMyWearableConnections } from '@/app/actions/wearables';
import { getMyCoachingDecision } from '@/app/actions/coaching-brain';
import { getMyMorningBrief } from '@/app/actions/coaching-engine';
import { ConnectWearableCard } from '@/components/wearables/ConnectWearableCard';
import { WearableWelcomeModal } from '@/components/wearables/WearableWelcomeModal';
import { WearableStatsRow } from '@/app/today/WearableStatsRow';
import { MorningBriefCard } from '@/components/MorningBriefCard';
import { FirstCheckInWelcome } from '@/components/FirstCheckInWelcome';
import { FirstCheckinTransition } from '@/components/FirstCheckinTransition';
import { ComprehensiveAssessmentCard } from '@/components/ComprehensiveAssessmentCard';
import { MovementAssessmentCard } from '@/components/MovementAssessmentCard';
import { DashboardQuickLinks } from '@/components/DashboardQuickLinks';
import { getMyBaselineAssessment } from '@/app/actions/onboarding';
import { getMyAssessmentsAction } from '@/app/actions/body-assessment';
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
const TRACKER_CARD = `${CARD} flex min-h-[172px] flex-col p-5`;

function stressLabel(level: number | null): string {
  if (level === null) return 'Not logged yet';
  if (level <= 2) return 'Low';
  if (level === 3) return 'Moderate';
  return 'High';
}

function painLabel(level: number | null): string {
  if (level === null) return 'Not logged yet';
  if (level === 0) return 'None';
  if (level === 1) return 'Mild';
  if (level <= 3) return 'Moderate';
  return 'Severe';
}

function moodLabel(level: number | null): string {
  if (level === null) return 'Not logged yet';
  if (level <= 2) return 'Low';
  if (level === 3) return 'Neutral';
  return 'Good';
}

function digestionLabel(level: number | null): string {
  if (level === null) return 'Not logged yet';
  if (level <= 2) return 'Poor';
  if (level === 3) return 'Fair';
  return 'Good';
}

function movementLabel(level: 'none' | 'light' | 'moderate' | 'full_session' | null): string {
  if (level === null) return 'Not logged yet';
  if (level === 'none') return 'None';
  if (level === 'light') return 'Light';
  if (level === 'moderate') return 'Moderate';
  return 'Full session';
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { firstCheckin?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // All six of these are independent reads (each of the three action
  // calls resolves its own user internally and touches none of the
  // others' data), so batching them removes five serial network round
  // trips that were previously paid one after another before the page
  // could render — the single biggest fixable cause of this page feeling
  // slow to open. Wearable discoverability (Premium Product Pass): a
  // connected wearable replaces the "unlock" pitch with today's real
  // recovery numbers; no connection at all also triggers the one-time
  // welcome modal below.
  const [{ data: profile }, isCoach, wearableConnections, decision, morningBrief, baseline, bodyAssessments] =
    await Promise.all([
      supabase.from('profiles').select('display_name, timezone').eq('id', user.id).single(),
      hasActiveRole(supabase, user.id, 'coach'),
      getMyWearableConnections(),
      getMyCoachingDecision(),
      getMyMorningBrief(),
      getMyBaselineAssessment(),
      getMyAssessmentsAction(),
    ]);
  const movementAnalyzed = bodyAssessments.some((a) => a.completed_at !== null);
  const hasConnectedWearable = wearableConnections.some((c) => c.status === 'connected');

  const timezone = profile?.timezone ?? 'America/New_York';
  const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const localDate = await resolveLocalDate(nowInTz, false);
  const timeContext = buildTimeContext(nowInTz);
  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';

  // recentCheckins doesn't depend on localDate, so it joins the other two
  // (which do) in a single batch instead of three more serial round trips.
  // rootScoreSnapshot reads today's already-calculated snapshot (or
  // calculates it once, the first time it's asked for today) — see
  // lib/scoring/service.ts; it never recalculates on every render.
  const [todaysCheckin, recentCheckins, rootScoreSnapshot] = await Promise.all([
    getTodaysCheckin(localDate),
    getRecentCheckins(12),
    getMyRootScore(localDate, timezone),
  ]);

  const wellnessIndex = calculateWellnessIndex(inputsFromCheckin(todaysCheckin));

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 sm:px-6 md:max-w-5xl md:px-10 md:pb-16 md:pl-28">
        {/* -------------------------------------------------------- */}
        {/* Header                                                   */}
        {/* -------------------------------------------------------- */}
        <header className="flex items-center justify-between pt-8 pb-6">
          <div className="flex items-center gap-3">
            <Image
              src="/images/rooted-reset-logo.png"
              alt="Rooted Reset"
              width={36}
              height={36}
              style={{
                objectFit: 'contain',
                borderRadius: '8px',
                flexShrink: 0,
              }}
            />
            <div className="leading-tight">
              <span className="block font-[family-name:var(--font-cormorant-garamond)] text-lg tracking-wide text-[#1B3A2D]">
                Rooted Reset
              </span>
              <span className="block text-[11px] font-medium uppercase tracking-wider text-[#6B7A72]">
                by MEF Wellness
              </span>
            </div>
          </div>
          <AvatarLink firstName={firstName} />
        </header>

        <div>
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            {timeContext.greetingWord}, {firstName}
          </h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">Here&apos;s where things stand today.</p>
        </div>

        <div className="mt-7 space-y-5">
        {recentCheckins.length === 0 ? (
          /* Premium UX Milestone 2: before a member's first completed
             check-in, Root has nothing real to personalize yet — one
             welcome moment with a single CTA replaces what would
             otherwise be an empty brief, an empty wearable pitch, an
             empty wellness index, seven "Not logged yet" tracker cards,
             and an empty trend chart all stacked on top of each other. */
          <FirstCheckInWelcome firstName={firstName} />
        ) : (
          <>
          {/* ---------------------------------------------------- */}
          {/* Root Score — the platform's central heartbeat.          */}
          {/* Longer-term, cross-domain, deliberately slow-moving      */}
          {/* (lib/scoring/), placed first so "how am I doing          */}
          {/* overall" is answered before anything else. Replaces      */}
          {/* the single-day Daily Wellness Index's spot on this       */}
          {/* dashboard (that component and its calculation still      */}
          {/* power the coach client view unchanged — see               */}
          {/* app/coach/clients/[id]/page.tsx). See                     */}
          {/* components/RootScoreCard.tsx and app/root-score/.         */}
          {/* ---------------------------------------------------- */}
          <RootScoreCard snapshot={rootScoreSnapshot} />

          {/* ---------------------------------------------------- */}
          {/* Movement + Food Lens + Progress quick links — their     */}
          {/* fixed-bottom-nav replacement now that the bar is        */}
          {/* scoped to Home/Check-In/Today only. See                 */}
          {/* components/DashboardQuickLinks.tsx.                      */}
          {/* ---------------------------------------------------- */}
          <DashboardQuickLinks />

          {/* ---------------------------------------------------- */}
          {/* Guided Posture & Movement Assessment — Premium UX       */}
          {/* Milestone 4: the actual next step after a first Daily   */}
          {/* Check-In. Stays prominent here (never buried in         */}
          {/* Profile) until completed, then auto-replaces itself     */}
          {/* with a real, data-backed status. See                    */}
          {/* components/MovementAssessmentCard.tsx.                   */}
          {/* ---------------------------------------------------- */}
          <MovementAssessmentCard assessments={bodyAssessments} />

          {/* ---------------------------------------------------- */}
          {/* Comprehensive Health Assessment — now a secondary       */}
          {/* recommendation surfaced only after the movement          */}
          {/* assessment above is done (or immediately, once a         */}
          {/* baseline already exists). See                            */}
          {/* components/ComprehensiveAssessmentCard.tsx.              */}
          {/* ---------------------------------------------------- */}
          <ComprehensiveAssessmentCard baseline={baseline} movementCompleted={movementAnalyzed} />

          {/* ---------------------------------------------------- */}
          {/* Root's Daily Brief — the Proactive Coaching Engine's    */}
          {/* flagship surface, first thing shown after the greeting. */}
          {/* Dashboard-only now (Milestone 2): it used to also render */}
          {/* on Today, which made the two pages feel duplicated.      */}
          {/* ---------------------------------------------------- */}
          {morningBrief && (
            <MorningBriefCard brief={morningBrief} rootScoreSnapshot={rootScoreSnapshot} />
          )}

          {/* ---------------------------------------------------- */}
          {/* Wearable Status + Recovery — the unlock pitch until a   */}
          {/* device is connected, then today's real recovery         */}
          {/* numbers. Dashboard-only now (Milestone 2): Today used    */}
          {/* to render this same connect pitch and the same stats     */}
          {/* row a second time.                                       */}
          {/* ---------------------------------------------------- */}
          {hasConnectedWearable ? (
            decision?.wearableSnapshot ? (
              <section className={`${CARD} p-6`}>
                <div className="flex items-center gap-2 text-[#6B7A72]">
                  <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-sm font-semibold uppercase tracking-wider">
                    Today&apos;s Recovery
                  </p>
                </div>
                <WearableStatsRow snapshot={decision.wearableSnapshot} />
              </section>
            ) : (
              <section className={`${CARD} p-6`}>
                <div className="flex items-center gap-2 text-[#6B7A72]">
                  <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-sm font-semibold uppercase tracking-wider">
                    Today&apos;s Recovery
                  </p>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
                  Your device is connected — recovery numbers will appear here after your first
                  sync.
                </p>
              </section>
            )
          ) : (
            <ConnectWearableCard variant="dashboard" />
          )}

          {/* ---------------------------------------------------- */}
          {/* Current wellness overview — today's numbers only when   */}
          {/* today's check-in actually exists; otherwise a single     */}
          {/* prompt instead of seven "Not logged yet" cards. (The      */}
          {/* check-in status/CTA itself now lives on Today, which      */}
          {/* answers "what should I do today" instead of "how am I     */}
          {/* doing" — see Today's Check-In Progress section.)          */}
          {/* ---------------------------------------------------- */}
          {todaysCheckin ? (
          <>
          {/* ---------------------------------------------------- */}
          {/* Trackers — real data, indicator color reflects status  */}
          {/* (green = good, gold = needs attention, red = poor,     */}
          {/* gray = no data). Stress/Pain are inverse scales — low   */}
          {/* is good — see lib/wellness/status.ts.                  */}
          {/* ---------------------------------------------------- */}
          <p className="pt-1 text-xs font-semibold uppercase tracking-wider text-[#1B3A2D]/40">
            Today&apos;s Numbers
          </p>
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            <div className={TRACKER_CARD}>
              <div className="flex items-center gap-2 text-[#6B7A72]">
                <Droplet className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Water</p>
              </div>
              {todaysCheckin?.water_cups != null ? (
                <>
                  <p
                    className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[waterStatus(todaysCheckin.water_cups)].text}`}
                  >
                    {todaysCheckin.water_cups}
                    <span className="text-sm font-normal text-[#6B7A72]"> of 8 cups</span>
                  </p>
                  <div className="mt-auto pt-3">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#EFE9DB]">
                      <div
                        className={`h-full rounded-full ${STATUS_STYLES[waterStatus(todaysCheckin.water_cups)].bar}`}
                        style={{ width: `${Math.min(100, (todaysCheckin.water_cups / 8) * 100)}%` }}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-auto text-sm text-[#6B7A72]">Not logged yet</p>
              )}
            </div>

            <div className={TRACKER_CARD}>
              <div className="flex items-center gap-2 text-[#6B7A72]">
                <Moon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Sleep</p>
              </div>
              {todaysCheckin?.sleep_duration ? (
                <>
                  <p
                    className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[sleepDurationStatus(todaysCheckin.sleep_duration)].text}`}
                  >
                    {todaysCheckin.sleep_duration}
                  </p>
                  <div className="mt-auto flex gap-1 pt-3">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div
                        key={n}
                        className={`h-2 flex-1 rounded-full ${
                          todaysCheckin?.sleep_quality && n <= todaysCheckin.sleep_quality
                            ? STATUS_STYLES[sleepQualityStatus(todaysCheckin.sleep_quality)].dot
                            : 'bg-[#EFE9DB]'
                        }`}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-auto text-sm text-[#6B7A72]">Not logged yet</p>
              )}
            </div>

            <div className={TRACKER_CARD}>
              <div className="flex items-center gap-2 text-[#6B7A72]">
                <Activity className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Stress</p>
              </div>
              <p
                className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[stressStatus(todaysCheckin?.stress_level ?? null)].text}`}
              >
                {stressLabel(todaysCheckin?.stress_level ?? null)}
              </p>
              <div className="mt-auto flex gap-1 pt-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    className={`h-2 flex-1 rounded-full ${
                      todaysCheckin?.stress_level && n <= todaysCheckin.stress_level
                        ? STATUS_STYLES[stressStatus(todaysCheckin.stress_level)].dot
                        : 'bg-[#EFE9DB]'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className={TRACKER_CARD}>
              <div className="flex items-center gap-2 text-[#6B7A72]">
                <Bone className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Pain</p>
              </div>
              <p
                className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[painStatus(todaysCheckin?.pain_discomfort_level ?? null)].text}`}
              >
                {painLabel(todaysCheckin?.pain_discomfort_level ?? null)}
              </p>
              <div className="mt-auto flex gap-1 pt-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    className={`h-2 flex-1 rounded-full ${
                      todaysCheckin?.pain_discomfort_level != null &&
                      n <= todaysCheckin.pain_discomfort_level
                        ? STATUS_STYLES[painStatus(todaysCheckin.pain_discomfort_level)].dot
                        : 'bg-[#EFE9DB]'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className={TRACKER_CARD}>
              <div className="flex items-center gap-2 text-[#6B7A72]">
                <Smile className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Mood</p>
              </div>
              <p
                className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[moodStatus(todaysCheckin?.mood_level ?? null)].text}`}
              >
                {moodLabel(todaysCheckin?.mood_level ?? null)}
              </p>
              <div className="mt-auto flex gap-1 pt-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    className={`h-2 flex-1 rounded-full ${
                      todaysCheckin?.mood_level && n <= todaysCheckin.mood_level
                        ? STATUS_STYLES[moodStatus(todaysCheckin.mood_level)].dot
                        : 'bg-[#EFE9DB]'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className={TRACKER_CARD}>
              <div className="flex items-center gap-2 text-[#6B7A72]">
                <Utensils className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Digestion</p>
              </div>
              <p
                className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[digestionStatus(todaysCheckin?.digestion_rating ?? null)].text}`}
              >
                {digestionLabel(todaysCheckin?.digestion_rating ?? null)}
              </p>
              <div className="mt-auto flex gap-1 pt-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    className={`h-2 flex-1 rounded-full ${
                      todaysCheckin?.digestion_rating && n <= todaysCheckin.digestion_rating
                        ? STATUS_STYLES[digestionStatus(todaysCheckin.digestion_rating)].dot
                        : 'bg-[#EFE9DB]'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className={TRACKER_CARD}>
              <div className="flex items-center gap-2 text-[#6B7A72]">
                <Footprints className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Movement</p>
              </div>
              <p
                className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[movementStatus(todaysCheckin?.movement_today ?? null)].text}`}
              >
                {movementLabel(todaysCheckin?.movement_today ?? null)}
              </p>
              <div className="mt-auto pt-3">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[movementStatus(todaysCheckin?.movement_today ?? null)].bg} ${STATUS_STYLES[movementStatus(todaysCheckin?.movement_today ?? null)].text}`}
                >
                  {todaysCheckin?.movement_today
                    ? movementStatus(todaysCheckin.movement_today) === 'good'
                      ? 'On track'
                      : movementStatus(todaysCheckin.movement_today) === 'attention'
                        ? 'Could be more'
                        : 'Sedentary'
                    : 'No data'}
                </span>
              </div>
            </div>
          </div>
          </>
          ) : (
          <section className={`${CARD} p-6 text-center`}>
            <p className="text-sm leading-relaxed text-[#6B7A72]">
              Complete today&apos;s check-in to see today&apos;s numbers here.
            </p>
          </section>
          )}

          {/* ---------------------------------------------------- */}
          {/* Trend chart — real recent check-ins, premium SVG        */}
          {/* chart in EnergyTrendChart.tsx, colored per-point by     */}
          {/* status. viewBox-based so it's always fully visible on   */}
          {/* any screen size, never clipped.                         */}
          {/* ---------------------------------------------------- */}
          <section className={`${CARD} p-6`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#6B7A72]">
                <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Energy Trend</p>
              </div>
              <span className="text-xs text-[#6B7A72]">
                {recentCheckins.length > 0 ? `Last ${recentCheckins.length} check-ins` : ''}
              </span>
            </div>
            <EnergyTrendChart checkins={recentCheckins} />
          </section>

          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#1B3A2D]/8 bg-white/50 px-5 py-3.5">
            <div className="flex items-center gap-2 text-[#6B7A72]">
              <Calendar className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm">
                Next session: <span className="text-[#1B3A2D]/70">nothing scheduled yet</span>
              </p>
            </div>
            <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-[#1B3A2D]/35">
              Coming soon
            </span>
          </div>
          </>
        )}
        </div>
      </main>

      {/* -------------------------------------------------------- */}
      {/* Bottom navigation (mobile) / side rail (md+)               */}
      {/* Same classes as before, now real Link navigation with a    */}
      {/* real active state — see components/BottomNav.tsx.          */}
      {/* -------------------------------------------------------- */}
      <BottomNav isCoach={isCoach} />

      <FloatingCoachLauncher
        entryPoint="dashboard"
        entryContext={buildDashboardEntryContext(wellnessIndex)}
      />

      {/* Suppressed during the pre-first-check-in welcome state, and
          during the first-check-in transition below — a modal competing
          with either of those single-CTA moments would undercut "one
          premium welcome experience." It still shows (once, per its own
          localStorage dismissal) on a later visit. */}
      {!hasConnectedWearable && recentCheckins.length > 0 && searchParams.firstCheckin !== '1' && (
        <WearableWelcomeModal />
      )}

      {/* Premium UX Milestone 4, part 6 — the one-time transition shown
          immediately after a member's first-ever completed check-in. */}
      {searchParams.firstCheckin === '1' && (
        <FirstCheckinTransition
          firstName={firstName}
          hasMovementAssessment={bodyAssessments.length > 0}
        />
      )}
    </div>
  );
}
