'use client';

/**
 * Permanent app-wide design standard: every intro/welcome screen gets a
 * headline that visibly types itself out, letter by letter, then body
 * copy that flows in one line at a time, then (when this component owns
 * it) a button that arrives last — like Root is speaking to the member in
 * real time, not a wall of text landing all at once. Replaces an earlier
 * version of this component that only ever faded every line in near-
 * simultaneously (a real, reported bug: members could not see it animate
 * at all, only the button "popped in").
 *
 * Reuses the exact typewriter idiom already proven on
 * app/welcome/WelcomeFlow.tsx's Page 2 (Story) — 45ms/character,
 * `.mef-typewriter-caret` for the blinking cursor — rather than inventing
 * a second one. Body lines keep the app's existing `.mef-fade-in` +
 * per-line `animationDelay` staggering idiom.
 *
 * First-time vs. revisit: a member who has already seen this exact screen
 * (tracked in localStorage by `storageKey`, scoped per-device/browser —
 * fine here since replaying a two-second reveal on a new device is a
 * trivial cost) gets the full, final state instantly, no animation, on
 * every later visit. `prefers-reduced-motion: reduce` gets the same
 * instant, fully-visible result regardless of history.
 *
 * A screen reader always gets the complete headline immediately (a
 * visually-hidden duplicate) — the visible, partially-typed text is
 * `aria-hidden`, so revealing it letter by letter is a purely visual
 * effect, never a comprehension delay for assistive tech.
 */

import { useEffect, useState, type ReactNode } from 'react';
import {
  INTRO_REVEAL_LINE_STEP_MS,
  INTRO_REVEAL_MS_PER_CHAR,
  INTRO_REVEAL_TYPEWRITER_SETTLE_MS,
  introRevealTypewriterMs,
} from '@/lib/introRevealTiming';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  return reduced;
}

/**
 * True the moment we know whether this exact screen has been fully shown
 * before — starts `null` (unknown, pre-hydration) so the very first client
 * render never flashes the animated state before flipping to "already
 * seen, skip it" a frame later. The "now seen" write is intentionally
 * *not* immediate — it's scheduled by the caller for once the reveal has
 * actually finished (see `markSeenAfterMs` below) — so that
 * IntroRevealFollowUp.tsx, a sibling Client Component reading this same
 * key on its own first mount to decide whether to instantly show its
 * children or wait, can never read a write this component made a moment
 * earlier during the same first visit.
 */
function useSeenBefore(storageKey: string, markSeenAfterMs: number): boolean | null {
  const [seen, setSeen] = useState<boolean | null>(null);
  const key = `mef-intro-seen:${storageKey}`;

  useEffect(() => {
    let already = false;
    try {
      already = window.localStorage.getItem(key) === '1';
    } catch {
      already = false;
    }
    setSeen(already);
    if (already) return undefined;

    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(key, '1');
      } catch {
        // Private browsing / storage disabled — nothing to persist, next visit just animates again.
      }
    }, markSeenAfterMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, markSeenAfterMs]);

  return seen;
}

type IntroButton = {
  label: ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
};

type IntroRevealProps = {
  eyebrow?: string;
  eyebrowClassName?: string;
  title: string;
  titleClassName?: string;
  /** Defaults to 'h2' (every existing call site already has its own sr-only or visible h1 elsewhere on the page). Pass 'h1' for a screen where this headline IS the page's main heading, so document structure stays correct. */
  titleTag?: 'h1' | 'h2';
  lines: string[];
  lineClassName?: string;
  /** Identifies this exact screen for the "full animation once, then instant" rule — must be stable and unique per screen (e.g. 'lsc-intro', 'cvs-intro'). */
  storageKey: string;
  /** When provided, IntroReveal renders this button itself and times it to arrive only after every line has landed — the "button arrives last" half of the standard. Screens with more elaborate follow-on content (a card, a caption) instead read introRevealFollowUpDelayMs directly; see lib/introRevealTiming.ts. */
  button?: IntroButton;
};

export function IntroReveal({
  eyebrow,
  eyebrowClassName = 'text-xs font-semibold uppercase tracking-wider text-[#6B7A72]',
  title,
  titleClassName = 'text-3xl leading-tight text-[#1B3A2D]',
  titleTag = 'h2',
  lines,
  lineClassName = 'text-[15px] leading-relaxed text-[#1B3A2D]',
  storageKey,
  button,
}: IntroRevealProps) {
  const TitleTag = titleTag;
  const reducedMotion = useReducedMotion();
  const typewriterMs = introRevealTypewriterMs(title);
  const buttonDelayMs = typewriterMs + INTRO_REVEAL_TYPEWRITER_SETTLE_MS + lines.length * INTRO_REVEAL_LINE_STEP_MS;
  const seenBefore = useSeenBefore(storageKey, buttonDelayMs);

  // Skip the animation entirely once we know it's warranted (reduced
  // motion, or a confirmed revisit) — `seenBefore === null` (not yet known,
  // the very first client tick) intentionally also plays it safe by not
  // yet skipping, so there's never a flash of fully-typed text right
  // before the animation would have started.
  const skip = reducedMotion || seenBefore === true;

  const [charCount, setCharCount] = useState(skip ? title.length : 0);
  const [linesStarted, setLinesStarted] = useState(skip);

  useEffect(() => {
    if (skip) {
      setCharCount(title.length);
      setLinesStarted(true);
      return undefined;
    }
    setCharCount(0);
    setLinesStarted(false);
    let count = 0;
    const interval = setInterval(() => {
      count += 1;
      setCharCount(count);
      if (count >= title.length) clearInterval(interval);
    }, INTRO_REVEAL_MS_PER_CHAR);
    const linesTimer = setTimeout(() => setLinesStarted(true), typewriterMs + INTRO_REVEAL_TYPEWRITER_SETTLE_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(linesTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, title]);

  return (
    <>
      {eyebrow && <p className={`mef-fade-in ${eyebrowClassName}`}>{eyebrow}</p>}
      <TitleTag className={titleClassName}>
        <span className="sr-only">{title}</span>
        <span aria-hidden="true">
          {skip ? title : title.slice(0, charCount)}
          {!skip && charCount < title.length && <span className="mef-typewriter-caret" aria-hidden="true" />}
        </span>
      </TitleTag>
      {linesStarted && (
        <div className="mt-4 space-y-3">
          {lines.map((line, i) => (
            <p
              key={i}
              className={skip ? lineClassName : `mef-fade-in ${lineClassName}`}
              style={skip ? undefined : { animationDelay: `${i * INTRO_REVEAL_LINE_STEP_MS}ms` }}
            >
              {line}
            </p>
          ))}
        </div>
      )}
      {button && (
        <button
          type="button"
          onClick={button.onClick}
          disabled={button.disabled}
          className={skip ? button.className : `mef-fade-in ${button.className ?? ''}`}
          style={skip ? undefined : { animationDelay: `${buttonDelayMs}ms` }}
        >
          {button.label}
        </button>
      )}
    </>
  );
}
