/**
 * Today's Numbers — the read-only tiles from today's check-in.
 *
 * WHERE THIS CAME FROM (Home cleanup pass, 2026-08-14). This grid used to
 * be inline JSX in app/dashboard/page.tsx's "Today" zone. Home keeps the
 * narrative role (Root's voice, the Root Score, the cards, the trends) and
 * Today becomes the data and logging surface, so the grid moved here
 * wholesale. Nothing was redesigned on the way: same tiles, same
 * classification functions (lib/wellness/status.ts), same five-segment
 * bars, same "Not logged yet" wording, same `.mef-card` shell.
 *
 * WHY WATER AND MOVEMENT ARE NOT IN THIS GRID. They were the two tiles on
 * Home that were not read-only, and the Today page ALREADY owns both, live:
 * HydrationTracker and MovementLevelTracker render inside TodayZones (its
 * forward zone until they're logged, its accomplished zone once they are),
 * where they also travel between zones as they complete. Both read exactly
 * the same data this grid would have shown — getTodaysMovementLevel returns
 * today's check-in's own `movement_today`, and the hydration total is the
 * same one the Home tile used — so putting a second copy in this grid would
 * be two controls for one number, each with its own local state, disagreeing
 * with each other the moment either is tapped. The relocation therefore
 * moves the five genuinely read-only tiles, and leaves water and movement
 * as the working controls they already are on this page.
 *
 * Pure presentation. No fetching, no classification of its own, and it is
 * never rendered without a real check-in behind it.
 */

import { Moon, Activity, Bone, Smile, Utensils } from 'lucide-react';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import {
  stressStatus,
  painStatus,
  sleepQualityStatus,
  sleepDurationStatus,
  moodStatus,
  digestionStatus,
  STATUS_STYLES,
} from '@/lib/wellness/status';

// Screen Layout System (Prompt 2): `.mef-card` plus this grid's own
// equal-height layout, exactly as it was on Home.
const TRACKER_CARD = 'mef-card flex min-h-[172px] flex-col';

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

export function TodaysNumbersGrid({ checkin }: { checkin: DailyCheckin }) {
  return (
    <section className="mt-6">
      <p className="pb-1 text-xs font-semibold uppercase tracking-wider text-[#1B3A2D]/40">
        Today&apos;s Numbers
      </p>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        <div className={TRACKER_CARD}>
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <Moon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Sleep</p>
          </div>
          {checkin.sleep_duration ? (
            <>
              <p
                className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[sleepDurationStatus(checkin.sleep_duration)].text}`}
              >
                {checkin.sleep_duration}
              </p>
              <div className="mt-auto flex gap-1 pt-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    className={`h-2 flex-1 rounded-full ${
                      checkin.sleep_quality && n <= checkin.sleep_quality
                        ? STATUS_STYLES[sleepQualityStatus(checkin.sleep_quality)].dot
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
            className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[stressStatus(checkin.stress_level ?? null)].text}`}
          >
            {stressLabel(checkin.stress_level ?? null)}
          </p>
          <div className="mt-auto flex gap-1 pt-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                className={`h-2 flex-1 rounded-full ${
                  checkin.stress_level && n <= checkin.stress_level
                    ? STATUS_STYLES[stressStatus(checkin.stress_level)].dot
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
            className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[painStatus(checkin.pain_discomfort_level ?? null)].text}`}
          >
            {painLabel(checkin.pain_discomfort_level ?? null)}
          </p>
          <div className="mt-auto flex gap-1 pt-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                className={`h-2 flex-1 rounded-full ${
                  checkin.pain_discomfort_level != null && n <= checkin.pain_discomfort_level
                    ? STATUS_STYLES[painStatus(checkin.pain_discomfort_level)].dot
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
            className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[moodStatus(checkin.mood_level ?? null)].text}`}
          >
            {moodLabel(checkin.mood_level ?? null)}
          </p>
          <div className="mt-auto flex gap-1 pt-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                className={`h-2 flex-1 rounded-full ${
                  checkin.mood_level && n <= checkin.mood_level
                    ? STATUS_STYLES[moodStatus(checkin.mood_level)].dot
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
            className={`mt-3 text-2xl font-semibold ${STATUS_STYLES[digestionStatus(checkin.digestion_rating ?? null)].text}`}
          >
            {digestionLabel(checkin.digestion_rating ?? null)}
          </p>
          <div className="mt-auto flex gap-1 pt-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                className={`h-2 flex-1 rounded-full ${
                  checkin.digestion_rating && n <= checkin.digestion_rating
                    ? STATUS_STYLES[digestionStatus(checkin.digestion_rating)].dot
                    : 'bg-[#EFE9DB]'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
