'use client';

/**
 * Progressive Reveal Engine (Prompt 3) — the generic sequenced-reveal
 * engine behind ConversationFlow.tsx and StepCard.tsx, and usable
 * directly for any Moment screen (§2 classification) that needs Bible
 * §5's pacing template: fade in, headline, pause, body, pause, action.
 *
 * Mount-gated, not just CSS-hidden: a step later in the sequence isn't
 * added to the returned tree at all until its turn arrives — matching
 * Bible §13's Signature Moment template ("mount-gating, not
 * visibility-gating... a typewriter merely hidden by opacity:0 would
 * finish typing invisibly before ever becoming visible").
 *
 * Every reveal is skippable (Prompt 3 requirement 2): a tap anywhere on
 * the sequence completes it instantly and mounts every remaining step at
 * once. Reduced motion (via the app's one canonical hook,
 * lib/motion/useReducedMotion.ts) skips the whole sequence from the very
 * first render — no reveal beats play at all, matching Bible §13's
 * "the entire staged sequence is skipped outright" rule for a genuinely
 * multi-second staged experience.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/motion/useReducedMotion';
import { REVEAL_PAUSE_MS } from '@/lib/reveal/timing';

export type RevealStep = {
  key: string;
  /** `skip` is true once the member has tapped to skip, or reduced motion is on — steps should render their final, unanimated state when true. */
  render: (skip: boolean) => ReactNode;
  /** How long this step holds the screen before the next one is eligible to mount, in ms. Defaults to Bible §5's standard pause beat (300ms). Pass lib/reveal/timing.ts's `readingFloorMs(text)` for a step carrying real prose. */
  holdMs?: number;
};

export function RevealSequence({
  steps,
  className = '',
  style,
  onAllRevealed,
  initialSkip = false,
}: {
  steps: RevealStep[];
  className?: string;
  style?: CSSProperties;
  /** Fires once, the moment every step has mounted — whether that happened via natural pacing or a skip tap. */
  onAllRevealed?: () => void;
  /** Start already fully revealed, no pacing at all — for a caller-owned "already seen this before" state (e.g. a closing screen's own first-time-only gate), distinct from reduced motion. */
  initialSkip?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const [skipped, setSkipped] = useState(false);
  const skip = reducedMotion || skipped || initialSkip;
  const [mountedCount, setMountedCount] = useState(skip ? steps.length : Math.min(1, steps.length));

  useEffect(() => {
    if (skip) {
      setMountedCount(steps.length);
      return undefined;
    }
    if (mountedCount >= steps.length) return undefined;
    const holdMs = steps[mountedCount - 1]?.holdMs ?? REVEAL_PAUSE_MS;
    const timer = setTimeout(() => setMountedCount((count) => Math.min(count + 1, steps.length)), holdMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, mountedCount, steps.length]);

  useEffect(() => {
    if (mountedCount >= steps.length) onAllRevealed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mountedCount, steps.length]);

  function handleSkip() {
    if (skip) return;
    setSkipped(true);
  }

  return (
    <div className={className} style={style} onClick={handleSkip} role="presentation">
      {steps.slice(0, mountedCount).map((step) => (
        <div key={step.key}>{step.render(skip)}</div>
      ))}
    </div>
  );
}

/** A `.mef-fade-in` wrapper that renders its final, unanimated state instantly when `skip` is true — the standard way a RevealStep's `render(skip)` should wrap its own content, so a skip tap or reduced motion never leaves a step stuck mid-fade. */
export function RevealFade({
  skip,
  children,
  className = '',
  style,
}: {
  skip: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  if (skip) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <div className={`mef-fade-in ${className}`} style={style}>
      {children}
    </div>
  );
}
