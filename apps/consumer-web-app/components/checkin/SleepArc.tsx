'use client';

/**
 * "Your night," built as ONE object rather than four separate questions
 * (task's explicit instruction) — a circular sleep dial she drags to
 * set bedtime and wake time (duration shown in the centre, and derived
 * into the existing `sleep_duration` bucket field so nothing downstream
 * breaks — see deriveDurationBucket), a static dusk/night/dawn sky
 * behind the dial so dragging the handles through different times of
 * night visibly passes through different sky color, night wake-ups as
 * notches tapped directly onto the arc instead of a separate row of
 * numbers, and sleep quality (still its own explicit tap, since it's a
 * protected core question — see FiveMoonsScale above this component)
 * coloring the arc's own stroke: dim/muted for a low rating, clear and
 * luminous for a high one.
 *
 * Sleep dial readability fix: a 24-hour dial reads to most people as a
 * 12-hour clock face, so 6 AM at the "3 o'clock" position is genuinely
 * ambiguous by sight — three changes address this without touching what
 * the arc actually writes: (1) tapping the printed "Bedtime"/"Wake"
 * label opens the phone's native time picker (a real <input type="time">,
 * linked via a <label>, not a custom modal) as an unambiguous alternate
 * entry method — dragging still works; (2) the dial is labeled at its
 * four quarters (12 AM/6 AM/12 PM/6 PM) with minor hourly ticks between,
 * and the printed time now tracks the drag live via local preview state
 * rather than only updating on release; (3) both handles pre-fill from
 * her recent check-ins' typical bedtime/wake (sleepHistory.ts) when
 * there's no answer yet today — a real, evidence-based "glance and
 * confirm" starting point, distinct from the plain default shown when
 * there's no history at all (see DEFAULT_BEDTIME_MINUTES below, which
 * intentionally never gets written as an answer on its own).
 *
 * 2026-07-27 fixes (three, none touching what the arc writes):
 * (a) investigated a reported "Bedtime 8:35 AM, Wake 12:45 AM, 16h 10m
 *     asleep" screenshot for a handle-mapping bug. Traced the geometry by
 *     hand: pointOnCircle/minutesForPoint are exact inverses of each
 *     other, the dark handle is always bedtime, onDragMove never swaps
 *     handle identity, and durationMinutes wraps forward exactly as
 *     formatDuration displays. No mapping bug found -- the printed
 *     numbers are exactly what durationMinutes(515, 45) produces (515
 *     minutes = 8:35, 45 minutes = 0:45, forward wrap gives 970 = 16h10m),
 *     a real, physically-possible output of two handles genuinely
 *     dragged into that relationship, not a computation error. (b) below
 *     is the actual remedy for that case, not a math fix.
 * (b) a quiet, non-blocking sanity note appears under the dial when the
 *     resulting window is implausible (over ~14h or under ~2h) rather
 *     than silently recording an obvious mis-drag. isImplausibleSleepWindow
 *     is exported standalone for testing.
 * (c) the quarter labels ("12 AM"/"6 AM"/"12 PM"/"6 PM") were clipped on
 *     all four sides -- the ring's own radius (92) plus the label offset
 *     (+27) put label text at radius 119 inside a 240-unit viewBox whose
 *     half-width is 120, under 1px of margin for actual glyphs. The ring
 *     is resized smaller (75) and every offset derived from it, so label
 *     text now sits at radius 95 -- a real 25px margin at every width.
 */

import { useCallback, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import {
  MINUTES_PER_DAY,
  deriveDurationBucket,
  durationMinutes,
  formatMinutesForDisplay,
  formatMinutesToTimeValue,
  isImplausibleSleepWindow,
  parseTimeToMinutes,
  type SleepDurationBucket,
} from '@/lib/daily-checkin-adaptive/sleepMath';

export type { SleepDurationBucket };
export { deriveDurationBucket };

const SIZE = 240;
const CENTER = SIZE / 2;
/**
 * 2026-07-27 label-clipping fix: was 92, which put the quarter-label
 * text (drawn at RADIUS + 27) at radius 119 inside this 240-unit
 * viewBox -- whose half-width is only 120, leaving under 1px of margin
 * for actual glyphs. 75 puts that same label text at radius 95, a real
 * 25px margin to the edge at every supported screen width.
 */
const RADIUS = 70;
/**
 * How far outside the ring the four quarter labels sit.
 *
 * 2026-08-19 overlap fix: this used to be +20, which put label text at
 * radius 95 while a handle rides the ring at radius 75 with its own
 * radius of 13, reaching out to 88. Seven pixels of clearance is none at
 * all once a handle sits a few degrees off a quarter, and the default
 * wake time of 6:30 AM does exactly that: the gold wake handle landed on
 * top of the "6 AM" label and swallowed the 6. Photographed on the
 * check-in sleep screen before the fix.
 *
 * At radius 70 + 30 the label text sits at 100 in a 240-unit viewBox, so
 * a handle reaches 83 and the widest label ("12 AM") still keeps a real
 * margin to the edge on all four sides.
 */
const QUARTER_LABEL_OFFSET = 30;
const SNAP_MINUTES = 5;
/** Outside this range, the resulting sleep window is almost certainly a mis-drag rather than a real answer (task 3b) -- not enforced, just flagged with a quiet inline note. */
const PLAUSIBLE_MIN_MINUTES = 2 * 60;
const PLAUSIBLE_MAX_MINUTES = 14 * 60;
/** How many candidate wake-up notch positions are offered along the sleep window — enough granularity to feel real without becoming fiddly to tap. */
const NOTCH_COUNT = 6;
const MAX_NIGHT_WAKINGS = 5;

function angleForMinutes(minutes: number): number {
  return (minutes / MINUTES_PER_DAY) * 360;
}

function pointOnCircle(angleDegrees: number, radius: number): { x: number; y: number } {
  const angleRad = ((angleDegrees - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(angleRad), y: CENTER + radius * Math.sin(angleRad) };
}

function minutesForPoint(x: number, y: number): number {
  const dx = x - CENTER;
  const dy = y - CENTER;
  let angleDegrees = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  if (angleDegrees < 0) angleDegrees += 360;
  const rawMinutes = (angleDegrees / 360) * MINUTES_PER_DAY;
  return Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
}

/** The dial's four labeled quarters — 12 AM at top, 6 AM at right, 12 PM at bottom, 6 PM at left, matching angleForMinutes' own clockwise-from-midnight orientation exactly (so the labels are never at odds with where a given time actually renders). */
const QUARTER_LABELS = [
  { angle: 0, label: '12 AM' },
  { angle: 90, label: '6 AM' },
  { angle: 180, label: '12 PM' },
  { angle: 270, label: '6 PM' },
] as const;

/** Minor hourly ticks between the four labeled quarters — every hour except the four already carrying a label. */
const MINOR_TICK_ANGLES = Array.from({ length: 24 }, (_, hour) => hour * 15).filter((angle) => angle % 90 !== 0);

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

const DEFAULT_BEDTIME_MINUTES = 22 * 60 + 30;
const DEFAULT_WAKE_MINUTES = 6 * 60 + 30;

/**
 * Static 24-hour sky, dusk -> night -> dawn -> day -> dusk, laid out as
 * a conic gradient matching the dial's own clockwise-from-midnight
 * orientation. Dragging a handle through evening/night/early-morning
 * visibly passes through this backdrop rather than the sky itself
 * animating — the same effect, simpler and steadier to render.
 */
const SKY_GRADIENT =
  'conic-gradient(from 0deg, #0F1F18 0%, #14251D 18%, #F0DDB0 27%, #FAF6EC 40%, #FAF6EC 60%, #D98A52 72%, #B85C3E 80%, #241A16 90%, #0F1F18 100%)';

type Handle = 'bedtime' | 'wake';

export function SleepArc({
  bedtime,
  wakeTime,
  nightWakingCount,
  sleepQuality,
  notchesEnabled,
  onTimesChange,
  onNightWakingChange,
}: {
  bedtime: string;
  wakeTime: string;
  nightWakingCount: number | null;
  /** 1-5, or null before she's answered — dims/mutes the arc's own stroke until a real quality value exists. */
  sleepQuality: number | null;
  /** False on days the adaptive picker didn't select night_waking_count into today's plan — the notches simply don't render rather than asking a question that isn't part of today's rotation. */
  notchesEnabled: boolean;
  onTimesChange: (bedtime: string, wakeTime: string, durationBucket: SleepDurationBucket) => void;
  onNightWakingChange: (count: number) => void;
}) {
  const committedBedtimeMinutes = parseTimeToMinutes(bedtime) ?? DEFAULT_BEDTIME_MINUTES;
  const committedWakeMinutes = parseTimeToMinutes(wakeTime) ?? DEFAULT_WAKE_MINUTES;
  const hasValues = bedtime !== '' && wakeTime !== '';

  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<Handle | null>(null);
  // Sleep dial readability fix: the printed time and the arc itself now
  // track the pointer via this local preview rather than waiting on the
  // parent's own (potentially heavier) re-render round-trip through
  // onTimesChange — "make the printed time update live while a handle is
  // being dragged, not only on release."
  const [dragPreview, setDragPreview] = useState<{ handle: Handle; minutes: number } | null>(null);

  const bedtimeMinutes = dragPreview?.handle === 'bedtime' ? dragPreview.minutes : committedBedtimeMinutes;
  const wakeMinutes = dragPreview?.handle === 'wake' ? dragPreview.minutes : committedWakeMinutes;

  const updateFromPointer = useCallback(
    (handle: Handle, clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * SIZE;
      const y = ((clientY - rect.top) / rect.height) * SIZE;
      const minutes = minutesForPoint(x, y);
      setDragPreview({ handle, minutes });
      const nextBedtime = handle === 'bedtime' ? minutes : committedBedtimeMinutes;
      const nextWake = handle === 'wake' ? minutes : committedWakeMinutes;
      onTimesChange(
        formatMinutesToTimeValue(nextBedtime),
        formatMinutesToTimeValue(nextWake),
        deriveDurationBucket(durationMinutes(nextBedtime, nextWake))
      );
    },
    [committedBedtimeMinutes, committedWakeMinutes, onTimesChange]
  );

  function startDrag(handle: Handle, event: ReactPointerEvent<SVGCircleElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(handle);
    triggerHaptic();
    updateFromPointer(handle, event.clientX, event.clientY);
  }

  function onDragMove(handle: Handle, event: ReactPointerEvent<SVGCircleElement>) {
    if (dragging !== handle) return;
    updateFromPointer(handle, event.clientX, event.clientY);
  }

  function endDrag(event: ReactPointerEvent<SVGCircleElement>) {
    if (dragging) triggerHaptic();
    setDragging(null);
    setDragPreview(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function onKeyDown(handle: Handle, event: React.KeyboardEvent<SVGCircleElement>) {
    const step = event.shiftKey ? 30 : 5;
    let delta = 0;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = step;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = -step;
    else return;
    event.preventDefault();
    const current = handle === 'bedtime' ? committedBedtimeMinutes : committedWakeMinutes;
    const next = current + delta;
    const nextBedtime = handle === 'bedtime' ? next : committedBedtimeMinutes;
    const nextWake = handle === 'wake' ? next : committedWakeMinutes;
    onTimesChange(
      formatMinutesToTimeValue(nextBedtime),
      formatMinutesToTimeValue(nextWake),
      deriveDurationBucket(durationMinutes(nextBedtime, nextWake))
    );
  }

  /** The tap-to-open native time picker (task 3a) — a real <input type="time">, linked via <label>, so tapping the printed "Bedtime"/"Wake" text opens the phone's own picker with zero ambiguity. Writes through the exact same onTimesChange contract dragging uses, so both entry methods land on the same bedtime/wake-time fields and the same derived duration bucket. */
  function applyDirectTime(handle: Handle, hhmm: string) {
    const minutes = parseTimeToMinutes(hhmm);
    if (minutes === null) return;
    const nextBedtime = handle === 'bedtime' ? minutes : committedBedtimeMinutes;
    const nextWake = handle === 'wake' ? minutes : committedWakeMinutes;
    triggerHaptic();
    onTimesChange(
      formatMinutesToTimeValue(nextBedtime),
      formatMinutesToTimeValue(nextWake),
      deriveDurationBucket(durationMinutes(nextBedtime, nextWake))
    );
  }

  const bedtimeInputId = useId();
  const wakeInputId = useId();

  const bedtimeAngle = angleForMinutes(bedtimeMinutes);
  const wakeAngle = angleForMinutes(wakeMinutes);
  const bedtimePoint = pointOnCircle(bedtimeAngle, RADIUS);
  const wakePoint = pointOnCircle(wakeAngle, RADIUS);
  const sweepMinutes = durationMinutes(bedtimeMinutes, wakeMinutes);
  const largeArcFlag = sweepMinutes / MINUTES_PER_DAY > 0.5 ? 1 : 0;

  // Sleep quality colors the arc: dim/desaturated at low ratings, a
  // brighter, slightly glowing stroke at high ones. Neutral (mid-gray)
  // until she's actually answered, so the arc doesn't imply a rating
  // she hasn't given yet.
  const qualityT = sleepQuality !== null ? (sleepQuality - 1) / 4 : 0.5;
  const arcOpacity = 0.55 + qualityT * 0.45;
  const arcGlow = sleepQuality !== null && sleepQuality >= 4 ? 'drop-shadow(0 0 6px rgba(196,160,80,0.55))' : 'none';

  const notches = Array.from({ length: NOTCH_COUNT }, (_, i) => {
    const t = (i + 1) / (NOTCH_COUNT + 1);
    const minutesAlong = bedtimeMinutes + sweepMinutes * t;
    return pointOnCircle(angleForMinutes(minutesAlong), RADIUS);
  });

  return (
    <div>
      <span className="text-[13px] leading-relaxed text-[#6B7A72]">
        Drag to set your bedtime and wake time, or tap either time below to enter it directly.
        {notchesEnabled ? ' Tap the notches for any wake-ups.' : ''}
      </span>
      <div className="mt-3 flex flex-col items-center">
        <div className="relative h-60 w-60 max-w-full">
          <div
            className="absolute inset-0 rounded-full"
            aria-hidden="true"
            style={{ background: SKY_GRADIENT, opacity: 0.16 }}
          />
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="absolute inset-0 h-full w-full touch-none select-none"
            role="group"
            aria-label="Drag to set your bedtime and wake time"
          >
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="#1B3A2D" strokeOpacity={0.08} strokeWidth={14} />
          {hasValues && (
            <path
              d={`M ${bedtimePoint.x} ${bedtimePoint.y} A ${RADIUS} ${RADIUS} 0 ${largeArcFlag} 1 ${wakePoint.x} ${wakePoint.y}`}
              fill="none"
              stroke="#1B3A2D"
              strokeWidth={14}
              strokeLinecap="round"
              opacity={arcOpacity}
              style={{ filter: arcGlow, transition: 'opacity 0.3s ease-out' }}
            />
          )}

          {/* Sleep dial readability fix (task 3b): labeled quarters — 12 AM
              at top, 6 AM at right, 12 PM at bottom, 6 PM at left — so the
              dial reads as the 24-hour clock it actually is instead of
              being misread as a 12-hour one. */}
          {QUARTER_LABELS.map(({ angle, label }) => {
            const outer = pointOnCircle(angle, RADIUS + QUARTER_LABEL_OFFSET - 8);
            const inner = pointOnCircle(angle, RADIUS + QUARTER_LABEL_OFFSET - 13);
            const textPoint = pointOnCircle(angle, RADIUS + QUARTER_LABEL_OFFSET);
            return (
              <g key={angle}>
                <line
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke="#1B3A2D"
                  strokeOpacity={0.3}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <text
                  x={textPoint.x}
                  y={textPoint.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-[#1B3A2D] text-[9px] font-semibold uppercase tracking-wide"
                  opacity={0.55}
                >
                  {label}
                </text>
              </g>
            );
          })}
          {MINOR_TICK_ANGLES.map((tickAngle) => {
            const outer = pointOnCircle(tickAngle, RADIUS + 9);
            const inner = pointOnCircle(tickAngle, RADIUS + 6);
            return (
              <line
                key={tickAngle}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="#1B3A2D"
                strokeOpacity={0.15}
                strokeWidth={1}
                strokeLinecap="round"
              />
            );
          })}

          {hasValues &&
            notchesEnabled &&
            notches.map((point, index) => {
              const filled = nightWakingCount !== null && index < nightWakingCount;
              return (
                <circle
                  key={index}
                  cx={point.x}
                  cy={point.y}
                  r={filled ? 6 : 4.5}
                  fill={filled ? '#C4A050' : '#FFFFFF'}
                  stroke="#1B3A2D"
                  strokeOpacity={0.35}
                  strokeWidth={1.5}
                  className="cursor-pointer transition-all duration-150 ease-out"
                  role="button"
                  tabIndex={0}
                  aria-label={`${index + 1} wake-up${index === 0 ? '' : 's'}`}
                  aria-pressed={filled}
                  onClick={() => {
                    triggerHaptic();
                    // Tapping a filled notch that's the current top count clears back to the one before it (correcting a mis-tap); tapping any notch otherwise sets the count up to that position.
                    const nextCount = nightWakingCount === index + 1 ? index : index + 1;
                    onNightWakingChange(Math.min(nextCount, MAX_NIGHT_WAKINGS));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      triggerHaptic();
                      const nextCount = nightWakingCount === index + 1 ? index : index + 1;
                      onNightWakingChange(Math.min(nextCount, MAX_NIGHT_WAKINGS));
                    }
                  }}
                />
              );
            })}

          <circle
            cx={bedtimePoint.x}
            cy={bedtimePoint.y}
            r={13}
            fill="#1B3A2D"
            stroke="#F5F0E4"
            strokeWidth={3}
            tabIndex={0}
            role="slider"
            aria-label="Bedtime"
            aria-valuetext={formatMinutesForDisplay(bedtimeMinutes)}
            className="cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => startDrag('bedtime', e)}
            onPointerMove={(e) => onDragMove('bedtime', e)}
            onPointerUp={endDrag}
            onKeyDown={(e) => onKeyDown('bedtime', e)}
          />
          <circle
            cx={wakePoint.x}
            cy={wakePoint.y}
            r={13}
            fill="#C4A050"
            stroke="#F5F0E4"
            strokeWidth={3}
            tabIndex={0}
            role="slider"
            aria-label="Wake time"
            aria-valuetext={formatMinutesForDisplay(wakeMinutes)}
            className="cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => startDrag('wake', e)}
            onPointerMove={(e) => onDragMove('wake', e)}
            onPointerUp={endDrag}
            onKeyDown={(e) => onKeyDown('wake', e)}
          />

          <text
            x={CENTER}
            y={CENTER - 6}
            textAnchor="middle"
            className="fill-[#1B3A2D] text-[22px] font-semibold"
            style={{ fontFamily: 'var(--font-cormorant-garamond)' }}
          >
            {hasValues ? formatDuration(sweepMinutes) : 'Drag to set'}
          </text>
          <text x={CENTER} y={CENTER + 16} textAnchor="middle" className="fill-[#6B7A72] text-[10px]">
            asleep
          </text>
          </svg>
        </div>

        <div className="mt-2 flex w-full max-w-xs items-center justify-between text-[12px] font-medium">
          {/*
           * Sleep dial readability fix (task 3a): tapping either label
           * opens the phone's own native time picker — a real
           * <input type="time">, linked via <label htmlFor>, so the tap
           * target is the entire visible pill and the browser handles
           * opening the picker itself (no custom modal to build or
           * maintain). Dragging the arc keeps working exactly as before;
           * this is an added entry method, writing through the same
           * onTimesChange contract, never a second bedtime/wake field.
           */}
          <label
            htmlFor={bedtimeInputId}
            className="mef-press flex cursor-pointer items-center gap-1.5 rounded-full px-1 py-0.5 text-[#1B3A2D]"
          >
            <span className="h-2 w-2 rounded-full bg-[#1B3A2D]" aria-hidden="true" />
            Bedtime {formatMinutesForDisplay(bedtimeMinutes)}
            <input
              id={bedtimeInputId}
              type="time"
              className="sr-only"
              value={formatMinutesToTimeValue(committedBedtimeMinutes)}
              onChange={(event) => event.target.value && applyDirectTime('bedtime', event.target.value)}
              aria-label="Set bedtime with your device's time picker"
            />
          </label>
          <label
            htmlFor={wakeInputId}
            className="mef-press flex cursor-pointer items-center gap-1.5 rounded-full px-1 py-0.5 text-[#1B3A2D]"
          >
            <span className="h-2 w-2 rounded-full bg-[#C4A050]" aria-hidden="true" />
            Wake {formatMinutesForDisplay(wakeMinutes)}
            <input
              id={wakeInputId}
              type="time"
              className="sr-only"
              value={formatMinutesToTimeValue(committedWakeMinutes)}
              onChange={(event) => event.target.value && applyDirectTime('wake', event.target.value)}
              aria-label="Set wake time with your device's time picker"
            />
          </label>
        </div>

        {/*
         * Sleep dial sanity guard (task 3b): never blocks -- "some people
         * genuinely sleep oddly" -- just a quiet inline note when the
         * resulting window is implausible, so an obvious mis-drag doesn't
         * silently enter the data unchallenged.
         */}
        {hasValues && isImplausibleSleepWindow(sweepMinutes, PLAUSIBLE_MIN_MINUTES, PLAUSIBLE_MAX_MINUTES) && (
          <p role="note" className="mt-2 max-w-xs text-center text-[12px] leading-relaxed text-[#7C5443]">
            That&apos;s a {formatDuration(sweepMinutes)} window between bedtime and wake, worth a quick check that
            the handles are set the way you meant?
          </p>
        )}
      </div>
    </div>
  );
}
