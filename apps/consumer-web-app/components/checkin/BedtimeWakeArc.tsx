'use client';

/**
 * Bedtime + wake time — "a single circular arc the member drags to set
 * her sleep window, replacing the two empty text inputs entirely. Show
 * the resulting duration in the centre of the arc." Writes the exact
 * same `actual_bedtime`/`actual_wake_time` "HH:MM" strings the two
 * native <input type="time"> fields it replaces already wrote, so
 * nothing downstream (submitDailyCheckin, lib/wellness/*) changes.
 *
 * The dial reads clockwise from midnight at the top (0:00) through noon
 * at the bottom (12:00) back to midnight — a full 24-hour face, since a
 * bedtime/wake window almost always crosses midnight. Dragging either
 * handle snaps to 5-minute increments (fine enough to feel precise,
 * coarse enough to hit reliably with a finger on a ~260px dial).
 */

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { triggerHaptic } from '@/lib/haptics';

const SIZE = 240;
const CENTER = SIZE / 2;
const RADIUS = 96;
const MINUTES_PER_DAY = 24 * 60;
const SNAP_MINUTES = 5;

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

/** Angle (degrees, clockwise from top = 0:00) for a given minutes-of-day value. */
function angleForMinutes(minutes: number): number {
  return (minutes / MINUTES_PER_DAY) * 360;
}

function pointOnCircle(angleDegrees: number, radius: number): { x: number; y: number } {
  const angleRad = ((angleDegrees - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(angleRad), y: CENTER + radius * Math.sin(angleRad) };
}

/** Inverse of angleForMinutes — pointer (x,y) relative to the SVG's own coordinate space -> minutes-of-day, snapped. */
function minutesForPoint(x: number, y: number): number {
  const dx = x - CENTER;
  const dy = y - CENTER;
  let angleDegrees = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  if (angleDegrees < 0) angleDegrees += 360;
  const rawMinutes = (angleDegrees / 360) * MINUTES_PER_DAY;
  return Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
}

/** Sleep duration = wake - bedtime, wrapping forward across midnight (a wake time "before" bedtime on the 24h face means it happened the following morning). */
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

const DEFAULT_BEDTIME_MINUTES = 22 * 60 + 30; // 10:30 PM
const DEFAULT_WAKE_MINUTES = 6 * 60 + 30; // 6:30 AM

type Handle = 'bedtime' | 'wake';

export function BedtimeWakeArc({
  bedtime,
  wakeTime,
  onChange,
}: {
  bedtime: string;
  wakeTime: string;
  onChange: (bedtime: string, wakeTime: string) => void;
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
      if (handle === 'bedtime') {
        onChange(formatMinutesToTimeValue(minutes), wakeTime || formatMinutesToTimeValue(DEFAULT_WAKE_MINUTES));
      } else {
        onChange(bedtime || formatMinutesToTimeValue(DEFAULT_BEDTIME_MINUTES), formatMinutesToTimeValue(minutes));
      }
    },
    [bedtime, wakeTime, onChange]
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
    const next = formatMinutesToTimeValue(current + delta);
    if (handle === 'bedtime') onChange(next, wakeTime || formatMinutesToTimeValue(DEFAULT_WAKE_MINUTES));
    else onChange(bedtime || formatMinutesToTimeValue(DEFAULT_BEDTIME_MINUTES), next);
  }

  const bedtimeAngle = angleForMinutes(bedtimeMinutes);
  const wakeAngle = angleForMinutes(wakeMinutes);
  const bedtimePoint = pointOnCircle(bedtimeAngle, RADIUS);
  const wakePoint = pointOnCircle(wakeAngle, RADIUS);
  const sweepMinutes = durationMinutes(bedtimeMinutes, wakeMinutes);
  const largeArcFlag = sweepMinutes / MINUTES_PER_DAY > 0.5 ? 1 : 0;

  return (
    <div>
      <span className="text-[13px] leading-relaxed text-[#6B7A72]">Bedtime &amp; wake time</span>
      <div className="mt-3 flex flex-col items-center">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-60 w-60 max-w-full touch-none select-none"
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
              opacity={0.85}
            />
          )}

          {/* Quarter-hour tick marks (midnight, 6am, noon, 6pm) for orientation. */}
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

          <text x={CENTER} y={CENTER - 6} textAnchor="middle" className="fill-[#1B3A2D] text-[22px] font-semibold" style={{ fontFamily: 'var(--font-cormorant-garamond)' }}>
            {hasValues ? formatDuration(sweepMinutes) : 'Drag to set'}
          </text>
          <text x={CENTER} y={CENTER + 16} textAnchor="middle" className="fill-[#6B7A72] text-[10px]">
            asleep
          </text>
        </svg>

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
