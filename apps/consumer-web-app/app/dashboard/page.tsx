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

import Link from 'next/link';
import Image from 'next/image';
import type { Route } from 'next';
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
import { BottomNav } from '@/components/BottomNav';
import { EnergyTrendChart } from './EnergyTrendChart';
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
} from './status';

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

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, timezone')
    .eq('id', user.id)
    .single();

  const timezone = profile?.timezone ?? 'America/New_York';
  const localDate = await resolveLocalDate(
    new Date(
      new Date().toLocaleString('en-US', {
        timeZone: timezone,
      })
    ),
    false
  );
  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';

  const todaysCheckin = await getTodaysCheckin(localDate);
  const recentCheckins = await getRecentCheckins(12);

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
          <Link
            href={'/profile' as Route}
            className="h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-[#F5B700] bg-white"
          >
            <div className="flex h-full w-full items-center justify-center text-sm font-medium text-[#1B3A2D]">
              {firstName.charAt(0).toUpperCase()}
            </div>
          </Link>
        </header>

        <div>
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
            Good Morning, {firstName}
          </h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">Here&apos;s where things stand today.</p>
        </div>

        <div className="mt-7 space-y-5">
          {/* ---------------------------------------------------- */}
          {/* Today's Focus + CTA + Next Session                    */}
          {/* Same 3-column grid as before — just re-flows now that  */}
          {/* Health Score (which spanned 2 rows) is gone.           */}
          {/* ---------------------------------------------------- */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <section className={`${CARD} p-7`}>
              <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
                Today&apos;s Focus
              </p>
              {todaysCheckin ? (
                <>
                  <h2 className="mt-3 text-xl font-semibold leading-snug tracking-tight text-[#1B3A2D]">
                    You&apos;ve checked in today
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
                    Thanks for logging today. Come back tomorrow to keep your trend going.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="mt-3 text-xl font-semibold leading-snug tracking-tight text-[#1B3A2D]">
                    You haven&apos;t checked in yet today
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
                    A quick check-in keeps your coach in the loop and your trends accurate.
                  </p>
                </>
              )}
            </section>

            <Link
              href={'/checkin' as Route}
              className={`${CARD} flex items-center justify-between bg-[#F5B700] p-6 text-left text-[#1B3A2D] transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B3A2D]`}
            >
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[#1B3A2D]/70">
                  Takes about a minute
                </p>
                <p className="mt-1.5 text-lg font-semibold">
                  {todaysCheckin
                    ? 'Update today\u2019s check-in'
                    : 'Complete today\u2019s check-in'}
                </p>
              </div>
            </Link>

            <section className={`${CARD} p-6`}>
              <div className="flex items-center gap-2 text-[#854D0E]">
                <Calendar className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Next Session</p>
              </div>
              <h2 className="mt-2.5 text-lg font-medium text-[#1B3A2D]">Nothing scheduled</h2>
              <p className="text-sm text-[#6B7A72]">Booking isn&apos;t connected yet.</p>
              <button
                type="button"
                disabled
                className="mt-4 flex w-full cursor-not-allowed items-center justify-center rounded-full border border-[#1B3A2D]/10 px-4 py-2.5 text-sm font-medium text-[#1B3A2D]/40"
              >
                Coming soon
              </button>
            </section>
          </div>

          {/* ---------------------------------------------------- */}
          {/* Trackers — real data, indicator color reflects status  */}
          {/* (green = good, gold = needs attention, red = poor,     */}
          {/* gray = no data). Stress/Pain are inverse scales — low   */}
          {/* is good — see app/dashboard/status.ts.                 */}
          {/* ---------------------------------------------------- */}
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            <div className={TRACKER_CARD}>
              <div className="flex items-center gap-2 text-[#854D0E]">
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
              <div className="flex items-center gap-2 text-[#854D0E]">
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
              <div className="flex items-center gap-2 text-[#854D0E]">
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
              <div className="flex items-center gap-2 text-[#854D0E]">
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
              <div className="flex items-center gap-2 text-[#854D0E]">
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
              <div className="flex items-center gap-2 text-[#854D0E]">
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
              <div className="flex items-center gap-2 text-[#854D0E]">
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

          {/* ---------------------------------------------------- */}
          {/* Trend chart — real recent check-ins, premium SVG        */}
          {/* chart in EnergyTrendChart.tsx, colored per-point by     */}
          {/* status. viewBox-based so it's always fully visible on   */}
          {/* any screen size, never clipped.                         */}
          {/* ---------------------------------------------------- */}
          <section className={`${CARD} p-6`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#854D0E]">
                <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Energy Trend</p>
              </div>
              <span className="text-xs text-[#6B7A72]">
                {recentCheckins.length > 0 ? `Last ${recentCheckins.length} check-ins` : ''}
              </span>
            </div>
            <EnergyTrendChart checkins={recentCheckins} />
          </section>
        </div>
      </main>

      {/* -------------------------------------------------------- */}
      {/* Bottom navigation (mobile) / side rail (md+)               */}
      {/* Same classes as before, now real Link navigation with a    */}
      {/* real active state — see components/BottomNav.tsx.          */}
      {/* -------------------------------------------------------- */}
      <BottomNav />
    </div>
  );
}
