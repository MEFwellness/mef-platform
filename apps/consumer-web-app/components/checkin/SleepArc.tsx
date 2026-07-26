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
 */

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { triggerHaptic } from '@/lib/haptics';

const SIZE = 240;
const CENTER = SIZE / 2;
const RADIUS = 92;
const MINUTES_PER_DAY = 24 * 60;
const SNAP_MINUTES = 5;
/** How many candidate wake-up notch positions are offered along the sleep window — enough granularity to feel real without becoming fiddly to tap. */
const NOTCH_COUNT = 6;
const MAX_NIGHT_WAKINGS = 5;

export type SleepDurationBucket = '<5h' | '5-6h' | '6-7h' | '7-8h' | '8h+';

/** Derives the existing sleep_duration bucket field straight from the arc's own bedtime/wake gesture — the separate "About how many hours did you sleep?" question this replaces asked the same thing a second time. */
export function deriveDurationBucket(totalMinutes: number): SleepDurationBucket {
  const hours = totalMinutes / 60;
  if (hours < 5) return '<5h';
  if (hours < 6) return '5-6h';
  if (hours < 7) return '6-7h';
  if (hours < 8) return '7-8h';
  return '8h+';
}

function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function formatMinutesToTimeValue(totalMinutes: number): string {
  const normalized = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatMinutesForDisplay(totalMinutes: number): string {
  const normalized = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const period = hours24 < 12 ? 'AM' : 'PM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

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

function durationMinutes(bedtime: number, wake: number): number {
  const raw = wake - bedtime;
  return raw <= 0 ? raw + MINUTES_PER_DAY : raw;
}

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
  const bedtimeMinutes = parseTimeToMinutes(bedtime) ?? DEFAULT_BEDTIME_MINUTES;
  const wakeMinutes = parseTimeToMinutes(wakeTime) ?? DEFAULT_WAKE_MINUTES;
  const hasValues = bedtime !== '' && wakeTime !== '';

  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<Handle | null>(null);

  const updateFromPointer = useCallback(
    (handle: Handle, clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * SIZE;
      const y = ((clientY - rect.top) / rect.height) * SIZE;
      const minutes = minutesForPoint(x, y);
      const nextBedtime = handle === 'bedtime' ? minutes : bedtimeMinutes;
      const nextWake = handle === 'wake' ? minutes : wakeMinutes;
      onTimesChange(
        formatMinutesToTimeValue(nextBedtime),
        formatMinutesToTimeValue(nextWake),
        deriveDurationBucket(durationMinutes(nextBedtime, nextWake))
      );
    },
    [bedtimeMinutes, wakeMinutes, onTimesChange]
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
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function onKeyDown(handle: Handle, event: React.KeyboardEvent<SVGCircleElement>) {
    const step = event.shiftKey ? 30 : 5;
    let delta = 0;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = step;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = -step;
    else return;
    event.preventDefault();
    const current = handle === 'bedtime' ? bedtimeMinutes : wakeMinutes;
    const next = current + delta;
    const nextBedtime = handle === 'bedtime' ? next : bedtimeMinutes;
    const nextWake = handle === 'wake' ? next : wakeMinutes;
    onTimesChange(
      formatMinutesToTimeValue(nextBedtime),
      formatMinutesToTimeValue(nextWake),
      deriveDurationBucket(durationMinutes(nextBedtime, nextWake))
    );
  }

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
        Drag to set your bedtime and wake time.
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

          {[0, 90, 180, 270].map((tickAngle) => {
            const outer = pointOnCircle(tickAngle, RADIUS + 14);
            const inner = pointOnCircle(tickAngle, RADIUS + 8);
            return (
              <line
                key={tickAngle}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="#1B3A2D"
                strokeOpacity={0.3}
                strokeWidth={2}
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
          <span className="flex items-center gap-1.5 text-[#1B3A2D]">
            <span className="h-2 w-2 rounded-full bg-[#1B3A2D]" aria-hidden="true" />
            Bedtime {formatMinutesForDisplay(bedtimeMinutes)}
          </span>
          <span className="flex items-center gap-1.5 text-[#1B3A2D]">
            <span className="h-2 w-2 rounded-full bg-[#C4A050]" aria-hidden="true" />
            Wake {formatMinutesForDisplay(wakeMinutes)}
          </span>
        </div>
      </div>
    </div>
  );
}
