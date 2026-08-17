'use client';

/**
 * Today page redesign — the "one list, two zones" structure. Forward zone
 * (open quick actions: check-in / water / movement / habits / unread
 * coach messages) sits above Accomplished zone (Done Today / Cumulative
 * Totals / Earned Capability). This is a client component specifically so
 * that water and movement — the two quick actions that can complete live,
 * in-page, without a navigation — can visibly travel from one zone to the
 * other the moment they're logged (the one sanctioned "item completing"
 * animation). Check-in and habits can only ever complete via a trip to
 * /checkin, so for those the zone membership is simply correct on the
 * next page load — there's no in-page moment to animate, which is honest
 * given how they actually work, not a missing feature.
 *
 * Water/movement's own controls (HydrationTracker, MovementLevelTracker)
 * are unchanged — same tap targets, same behavior — they are only ever
 * relocated between this component's two zones, never rewritten. Moving a
 * zone remounts the control (different parent subtree), so this component
 * — not the control — owns the live total/level so the remount always
 * reinitializes to the current value, never resets to the server's
 * original page-load snapshot.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  Sparkles,
  ListChecks,
  Lock,
  PartyPopper,
} from 'lucide-react';
import type { Habit, Notification } from '@mef/shared-types-contracts';
import { HydrationTracker } from '@/components/checkin/HydrationTracker';
import { MovementLevelTracker, type MovementLevel } from '@/components/checkin/MovementLevelTracker';
import { CoachMessages } from './CoachMessages';
import { capabilityProgress } from '@/lib/today/capability';

// Screen Layout System (Prompt 2): was a hand-rolled duplicate of
// `.mef-card` (app/globals.css) — now the one shared recipe.
const CARD = 'mef-card';
const CAPABILITY_SEEN_KEY = 'mef_today_capability_unlocked_seen';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A minimal FLIP implementation for the one "item travels between zones"
 * animation this page allows. Runs after every render, comparing each
 * tracked key's last-measured position to its current one — since an
 * item's position on screen only actually changes when it moves between
 * the forward and accomplished zones (or the zone above it shrinks/grows),
 * this naturally captures exactly that moment without needing separate
 * "did this item just complete" bookkeeping. Skipped entirely under
 * prefers-reduced-motion — positions are still tracked (so a later
 * animation-eligible change doesn't get a stale reference), the element
 * just jumps straight to its end state.
 */
function useZoneTravelFlip() {
  const rects = useRef<Map<string, DOMRect>>(new Map());
  const nodes = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    const reduceMotion = prefersReducedMotion();
    nodes.current.forEach((el, key) => {
      const prev = rects.current.get(key);
      const next = el.getBoundingClientRect();
      if (prev && !reduceMotion) {
        const deltaX = prev.left - next.left;
        const deltaY = prev.top - next.top;
        if (Math.round(deltaX) !== 0 || Math.round(deltaY) !== 0) {
          el.style.transition = 'none';
          el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
          void el.offsetHeight; // forces a reflow so the transform above applies before the transition below is set, per the standard FLIP technique
          el.style.transition = 'transform 480ms cubic-bezier(0.34, 1.56, 0.64, 1)';
          el.style.transform = '';
        }
      }
      rects.current.set(key, next);
    });
  });

  return (key: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(key, el);
    else nodes.current.delete(key);
  };
}

/** Ticks from its previous value to a new one on change only — never on mount — since a returning member reopening the app shouldn't see every cumulative total count up from zero again. Respects prefers-reduced-motion by jumping straight to the new value. */
function TickingNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const prevValue = useRef(value);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      prevValue.current = value;
      return;
    }
    if (value === prevValue.current) return;
    const from = prevValue.current;
    const to = value;
    prevValue.current = value;

    if (prefersReducedMotion()) {
      setDisplay(to);
      return;
    }

    let raf = 0;
    const durationMs = 700;
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span>{display}</span>;
}

/** Fires true exactly once, the first time this member's browser ever sees `unlocked === true` — the "rare, real celebration" the capability card gets, not replayed on every later page load. Falls back to always-on (no celebration, no crash) if localStorage is unavailable. */
function useCapabilityJustUnlocked(unlocked: boolean): boolean {
  const [justUnlocked, setJustUnlocked] = useState(false);

  useEffect(() => {
    if (!unlocked) return;
    try {
      if (!window.localStorage.getItem(CAPABILITY_SEEN_KEY)) {
        window.localStorage.setItem(CAPABILITY_SEEN_KEY, '1');
        setJustUnlocked(true);
      }
    } catch {
      // Storage unavailable (private browsing, etc.) — skip the one-time celebration, still show the unlocked state correctly.
    }
  }, [unlocked]);

  return justUnlocked;
}

function DoneTodayRow({
  flipRef,
  label,
  trailing,
}: {
  flipRef: (el: HTMLElement | null) => void;
  label: string;
  trailing?: ReactNode;
}) {
  return (
    <li ref={flipRef} className="flex items-center gap-2.5 py-2">
      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" strokeWidth={1.75} aria-hidden="true" />
      <span className="flex-1 text-sm text-[#1B3A2D]">{label}</span>
      {trailing}
    </li>
  );
}

export function TodayZones({
  todaysCheckinDone,
  hydrationTracked,
  hydrationInitialTotal,
  movementInitialLevel,
  showMovementTracker,
  showHabits,
  showTotals,
  showCapability,
  habits,
  habitLogs,
  notifications,
  totalCheckins,
  totalMovementDays,
}: {
  todaysCheckinDone: boolean;
  /**
   * Conditional water tracking (migration 163). False removes the water
   * tracker from this screen outright — not disabled, not empty, absent —
   * for a member who told us water is not one of her problems. The movement
   * tracker then owns the full row on its own rather than sitting beside a
   * gap.
   */
  hydrationTracked: boolean;
  hydrationInitialTotal: number;
  movementInitialLevel: MovementLevel | null;
  /**
   * VISIBILITY LAYER (2026-08-17). Water proved the shape; these four are
   * the same shape for the rest of this screen.
   *
   * The audit found the movement tracker rendered every day to a member
   * with zero movement days logged in thirteen, next to a totals panel
   * reading "0 Days movement logged". That is a tracker asking her to fail
   * at something she never said she wanted. It now appears when movement is
   * genuinely a topic for her, and does not exist otherwise.
   */
  showMovementTracker: boolean;
  showHabits: boolean;
  showTotals: boolean;
  showCapability: boolean;
  habits: Habit[];
  habitLogs: Record<string, boolean>;
  notifications: Notification[];
  totalCheckins: number;
  totalMovementDays: number;
}) {
  const [waterTotal, setWaterTotal] = useState(hydrationInitialTotal);
  const [movementLevel, setMovementLevel] = useState<MovementLevel | null>(movementInitialLevel);
  const [cumulativeMovementDays, setCumulativeMovementDays] = useState(totalMovementDays);
  const prevMovementLevel = useRef(movementInitialLevel);
  const flipRef = useZoneTravelFlip();

  useEffect(() => {
    const wasLogged = prevMovementLevel.current !== null;
    const isLogged = movementLevel !== null;
    if (isLogged && !wasLogged) {
      setCumulativeMovementDays((count) => count + 1);
    }
    prevMovementLevel.current = movementLevel;
  }, [movementLevel]);

  const waterLoggedToday = waterTotal > 0;
  /**
   * Conditional water tracking (migration 163). Every water decision below
   * asks these two, never `hydrationTracked` directly, so a member who does
   * not track water is treated as having no water action open (nothing
   * nagging her in the Forward zone) AND nothing water-shaped completed
   * (her "done today" count is not quietly short by one for a thing she was
   * never asked to do).
   */
  const showWaterOpen = hydrationTracked && !waterLoggedToday;
  const showWaterDone = hydrationTracked && waterLoggedToday;
  const movementLoggedToday = movementLevel !== null;
  /**
   * Same two-question discipline the water gate uses, for the same reason:
   * a member who does not track movement has no movement action open
   * (nothing nagging her in the Forward zone) AND nothing movement-shaped
   * completed, so her "done today" count is not quietly short by one for a
   * thing she was never asked to do.
   */
  const showMovementOpen = showMovementTracker && !movementLoggedToday;
  const showMovementDone = showMovementTracker && movementLoggedToday;
  const openHabits = showHabits ? habits.filter((habit) => !(habitLogs[habit.id] ?? false)) : [];
  const doneHabits = showHabits ? habits.filter((habit) => habitLogs[habit.id] ?? false) : [];

  const hasOpenQuickActions =
    !todaysCheckinDone ||
    showWaterOpen ||
    showMovementOpen ||
    openHabits.length > 0 ||
    notifications.length > 0;

  const doneTodayCount =
    (todaysCheckinDone ? 1 : 0) +
    (showWaterDone ? 1 : 0) +
    (showMovementDone ? 1 : 0) +
    doneHabits.length;

  const capability = capabilityProgress(totalCheckins);
  const justUnlocked = useCapabilityJustUnlocked(capability.unlocked);

  const showBothTrackers = showWaterOpen && showMovementOpen;

  return (
    <div className="mt-6 space-y-6">
      {/* FORWARD ZONE — open quick actions only. Shrinks as she completes things; collapses to one small line once nothing is left open, rather than leaving an empty container. */}
      {hasOpenQuickActions ? (
        <div className="space-y-3">
          {!todaysCheckinDone && (
            <div ref={flipRef('checkin')} className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <section className={`${CARD}`}>
                <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                  Check-In Progress
                </p>
                <h2 className="mt-3 text-xl font-semibold leading-snug tracking-tight text-[#1B3A2D]">
                  You haven&apos;t checked in yet today
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
                  A quick check-in shapes today&apos;s coaching and keeps your trends accurate.
                </p>
              </section>
              <Link
                href={'/checkin' as Route}
                className="mef-card-lift flex flex-col justify-between gap-4 rounded-[28px] bg-[#1B3A2D] p-6 text-left text-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
              >
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-white/70">
                    Takes about a minute
                  </p>
                  <p className="mt-1.5 text-lg font-semibold">Complete today&apos;s check-in</p>
                </div>
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#F5F0E4] px-4 py-2 text-sm font-semibold text-[#1B3A2D]">
                  Start check-in
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                </span>
              </Link>
            </div>
          )}

          {notifications.length > 0 && <CoachMessages notifications={notifications} />}

          {(showWaterOpen || showMovementOpen) && (
            <div className={`grid gap-3 sm:gap-5 ${showBothTrackers ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {showWaterOpen && (
                <div ref={flipRef('water')}>
                  <HydrationTracker initialTotal={waterTotal} onTotalChange={setWaterTotal} />
                </div>
              )}
              {showMovementOpen && (
                <div ref={flipRef('movement')}>
                  <MovementLevelTracker initialLevel={movementLevel} onLevelChange={setMovementLevel} />
                </div>
              )}
            </div>
          )}

          {openHabits.length > 0 && (
            <section className={`${CARD}`}>
              <div className="flex items-center gap-2 text-[#6B7A72]">
                <ListChecks className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-sm font-semibold uppercase tracking-wider">Today&apos;s Habits</p>
              </div>
              <ul className="mt-3 divide-y divide-[#1B3A2D]/5">
                {openHabits.map((habit) => (
                  <li key={habit.id} ref={flipRef(`habit-${habit.id}`)} className="flex items-center gap-2.5 py-2">
                    <Circle className="h-5 w-5 shrink-0 text-[#1B3A2D]/20" strokeWidth={1.75} aria-hidden="true" />
                    <span className="text-sm text-[#1B3A2D]">{habit.title}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/checkin"
                className="mt-3 inline-block text-sm font-medium text-[#1B3A2D] underline underline-offset-2"
              >
                Log today&apos;s habits in your check-in
              </Link>
            </section>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-2xl bg-[#1B3A2D]/[0.05] px-5 py-3.5 text-sm font-medium text-[#1B3A2D]">
          <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          You&apos;re all set for today.
        </div>
      )}

      {/* ACCOMPLISHED ZONE — Done Today, then Cumulative Totals, then Earned Capability, in that order. Cumulative Totals and Earned Capability always render once a member has any check-in history at all, so this zone is never a blank container even at 7am before anything today is logged yet. */}
      <div className="space-y-5">
        {doneTodayCount > 0 && (
          <section className={`${CARD}`}>
            <div className="flex items-center gap-2 text-[#6B7A72]">
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Done Today</p>
            </div>
            <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
              {todaysCheckinDone && (
                <DoneTodayRow
                  flipRef={flipRef('checkin')}
                  label="Check-in complete"
                  trailing={
                    <Link
                      href={'/checkin' as Route}
                      className="text-xs font-medium text-[#1B3A2D]/70 underline underline-offset-2"
                    >
                      Update
                    </Link>
                  }
                />
              )}
              {doneHabits.map((habit) => (
                <DoneTodayRow key={habit.id} flipRef={flipRef(`habit-${habit.id}`)} label={habit.title} />
              ))}
            </ul>
            {(showWaterDone || showMovementDone) && (
              <div
                className={`mt-3 grid gap-3 sm:gap-5 ${
                  showWaterDone && showMovementDone ? 'grid-cols-2' : 'grid-cols-1'
                }`}
              >
                {showWaterDone && (
                  <div ref={flipRef('water')}>
                    <HydrationTracker initialTotal={waterTotal} onTotalChange={setWaterTotal} />
                  </div>
                )}
                {showMovementDone && (
                  <div ref={flipRef('movement')}>
                    <MovementLevelTracker initialLevel={movementLevel} onLevelChange={setMovementLevel} />
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* VISIBILITY LAYER: the totals panel only counts what she is
            actually being asked to do. A member who does not track movement
            no longer gets a "0 Days movement logged" column for something
            nobody invited her to, and the remaining figure takes the full
            width rather than sitting beside a gap. */}
        {showTotals && (
          <section className={`${CARD}`}>
            <div className="flex items-center gap-2 text-[#6B7A72]">
              <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Your Totals</p>
            </div>
            <div className={`mt-3 grid gap-4 ${showMovementTracker ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div>
                <p className="font-[family-name:var(--font-cormorant-garamond)] text-3xl text-[#1B3A2D]">
                  <TickingNumber value={totalCheckins} />
                </p>
                <p className="mt-1 text-xs text-[#6B7A72]">
                  {totalCheckins === 1 ? 'Check-in logged' : 'Check-ins logged'}
                </p>
              </div>
              {showMovementTracker && (
                <div>
                  <p className="font-[family-name:var(--font-cormorant-garamond)] text-3xl text-[#1B3A2D]">
                    <TickingNumber value={cumulativeMovementDays} />
                  </p>
                  <p className="mt-1 text-xs text-[#6B7A72]">
                    {cumulativeMovementDays === 1 ? 'Day movement logged' : 'Days movement logged'}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {showCapability && (
        <section className={`${CARD} ${justUnlocked ? 'mef-scale-settle' : ''}`}>
          <div className="flex items-center gap-2 text-[#6B7A72]">
            {capability.unlocked ? (
              <PartyPopper className="h-4 w-4 text-[#854D0E]" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Lock className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            )}
            <p className="text-sm font-semibold uppercase tracking-wider">
              {capability.unlocked ? 'Unlocked' : "What's Next"}
            </p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[#1B3A2D]">
            {capability.unlocked
              ? 'Root now has enough days logged to start testing what you log for real, confirmed patterns, not just showing you the numbers.'
              : `Log ${capability.remaining} more day${capability.remaining === 1 ? '' : 's'} and Root can start testing what you log for real, confirmed patterns, not just showing you the numbers.`}
          </p>
        </section>
        )}
      </div>
    </div>
  );
}
