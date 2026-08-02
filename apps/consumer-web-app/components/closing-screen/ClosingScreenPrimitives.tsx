'use client';

/**
 * Shared building blocks for the "premium payoff" closing screen redesign
 * (2026-08-01), factored out once Core Values Snapshot's own closing
 * screen (CvsCloseScreen.tsx) needed the exact same staged-reveal/
 * celebration/progress-line mechanics Life Signal Check's own
 * (LscCloseScreen.tsx) already had — genuinely identical logic, only the
 * copy and scoring differ, so this is real reuse, not two hand-kept
 * copies drifting apart. Every function here is presentational/timing
 * only; each experience's own close-screen file still owns its own copy
 * functions, narrative-card matching, and scoring types.
 */

import { useEffect, useState, Fragment, type ReactNode } from 'react';
import { CVS_CARD, CVS_CARD_ELEVATED, CVS_FOREST, CVS_GOLD } from '@/components/core-values-snapshot/theme';

/**
 * True only the very first time a given closing screen (identified by
 * `storageKey`, unique per experience+session) is reached — every later
 * visit renders instantly, no staged reveal, no celebration replay.
 * Reduced motion always renders instantly regardless of history. Pure
 * client state (every caller is already inside a Client Component taker),
 * so there is no SSR/hydration concern to guard against here.
 */
export function useCloseScreenReveal(storageKey: string): boolean {
  const [play, setPlay] = useState(false);
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;
    const key = `mef-close-seen:${storageKey}`;
    try {
      const already = window.localStorage.getItem(key) === '1';
      if (!already) {
        window.localStorage.setItem(key, '1');
        setPlay(true);
      }
    } catch {
      setPlay(true);
    }
  }, [storageKey]);
  return play;
}

/** True once `delayMs` has elapsed (or immediately, when `play` is false) — used to gate *mounting* a child that runs its own JS-driven animation (IntroReveal's typewriter), not just hiding it with CSS. Without this, a typewriter mounted immediately but merely opacity-hidden by its parent's own fade-in would finish typing invisibly before the card ever becomes visible. */
export function useDelayedReveal(play: boolean, delayMs: number): boolean {
  const [revealed, setRevealed] = useState(!play);
  useEffect(() => {
    if (!play) return;
    const t = setTimeout(() => setRevealed(true), delayMs);
    return () => clearTimeout(t);
  }, [play, delayMs]);
  return revealed;
}

export function RevealCard({
  play,
  delayMs,
  elevated,
  className = '',
  children,
}: {
  play: boolean;
  delayMs: number;
  elevated?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const base = elevated ? CVS_CARD_ELEVATED : CVS_CARD;
  return (
    <div
      className={`${base} ${play ? 'mef-fade-in' : ''} p-7 ${className}`}
      style={play ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/** `animated` means "start empty and fill in on mount" (the newly-completed segment); a connector that's already settled (either genuinely empty, or a revisit's already-final state) renders directly at its target width, no transition. */
function ProgressConnector({ filled, animated }: { filled: boolean; animated: boolean }) {
  const [width, setWidth] = useState(animated ? '0%' : filled ? '100%' : '0%');
  useEffect(() => {
    if (!animated) return;
    const t = setTimeout(() => setWidth(filled ? '100%' : '0%'), 60);
    return () => clearTimeout(t);
  }, [animated, filled]);
  return (
    <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#1B3A2D]/10">
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
        style={{ width, backgroundColor: CVS_FOREST }}
      />
    </div>
  );
}

function ProgressNode({
  done,
  label = '',
  drawAnimate,
  sweepAnimate,
}: {
  done: boolean;
  label?: string;
  drawAnimate?: boolean;
  sweepAnimate?: boolean;
}) {
  if (!done) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#1B3A2D]/15 text-[11px] font-semibold text-[#1B3A2D]/40">
        {label}
      </div>
    );
  }
  return (
    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ backgroundColor: CVS_FOREST }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        {drawAnimate ? (
          <path d="M3 8.5L6.5 12L13 4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mef-close-check-draw" />
        ) : (
          <path d="M3 8.5L6.5 12L13 4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      {sweepAnimate && (
        <div
          aria-hidden="true"
          className="mef-close-gold-sweep pointer-events-none absolute inset-y-0 left-0 w-full"
          style={{ background: `linear-gradient(100deg, transparent, ${CVS_GOLD}, transparent)` }}
        />
      )}
    </div>
  );
}

export type JourneyItem = { label: string; done: boolean };

/**
 * The filling line between however many conversations a journey has,
 * doubling as the first-completion celebration for whichever node just
 * finished — a checkmark that draws itself, one soft gold sweep on that
 * one node, and the "Conversation N of total" count landing a beat after
 * the line finishes filling. Static (final, fully-settled state, no
 * animation) on a revisit. Works for any journey length/position: the
 * "just completed" node is simply the last one marked `done`, so Core
 * Values Snapshot (1 of 3, no connector to animate yet) and Life Signal
 * Check (2 of 3, the 1-to-2 segment animates in) both fall out of the
 * same logic with no special-casing.
 */
export function JourneyProgressLine({ play, items }: { play: boolean; items: JourneyItem[] }) {
  const totalDone = items.filter((i) => i.done).length;
  const [count, setCount] = useState(play ? Math.max(totalDone - 1, 0) : totalDone);

  useEffect(() => {
    if (!play) return;
    const t = setTimeout(() => setCount(totalDone), 900);
    return () => clearTimeout(t);
  }, [play, totalDone]);

  return (
    <div>
      <div className="flex items-center" aria-hidden="true">
        {items.map((item, i) => {
          const justCompleted = play && i === totalDone - 1;
          return (
            <Fragment key={item.label}>
              {i > 0 && <ProgressConnector filled={i <= totalDone - 1} animated={play && i === totalDone - 1} />}
              <ProgressNode done={item.done} label={item.done ? '' : String(i + 1)} drawAnimate={justCompleted} sweepAnimate={justCompleted} />
            </Fragment>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs font-semibold uppercase tracking-wider text-[#6B7A72]" aria-hidden="true">
        Conversation {count} of {items.length}: complete
      </p>
      {/* The same journey, in words, for assistive tech — the line/dots above are purely decorative. */}
      <ul className="sr-only">
        {items.map((item) => (
          <li key={item.label}>
            {item.done ? 'Done: ' : 'Next: '}
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
