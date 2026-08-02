'use client';

/**
 * Progressive Reveal Engine (Prompt 3) — "conversation flow": content
 * presented as short sequential messages from Root, the way
 * lib/core-values-snapshot/copy.ts's branch copy already reads in prose
 * ("Here's what I noticed... But when I asked... I'm not going to tell
 * you why that is.") rather than one dense paragraph — Bible §6's
 * "Conversational sequence" conversion pattern, now a reusable component
 * instead of a one-off layout each screen re-derives by hand.
 *
 * Built on RevealSequence: each message mounts only once the previous one
 * has held the screen for its own reading-time floor (Bible §5), tap
 * anywhere completes the rest instantly, and reduced motion shows every
 * message at once with no reveal at all.
 */

import { RevealSequence, RevealFade, type RevealStep } from './RevealSequence';
import { readingFloorMs, REVEAL_PAUSE_MS } from '@/lib/reveal/timing';

export function ConversationFlow({
  messages,
  className = '',
  messageClassName = 'text-[15px] leading-relaxed text-[#1B3A2D]',
  gapClassName = 'space-y-3',
  initialSkip = false,
}: {
  messages: string[];
  className?: string;
  messageClassName?: string;
  /** Vertical rhythm between messages — applied to the wrapping container, not each message, so callers can pass their own card's spacing convention. */
  gapClassName?: string;
  /** Start already fully revealed, no pacing — pass a caller-owned "already seen this before" flag (e.g. a closing screen's own first-time-only gate). */
  initialSkip?: boolean;
}) {
  const steps: RevealStep[] = messages.map((message, index) => ({
    key: `${index}-${message.slice(0, 24)}`,
    holdMs: Math.max(readingFloorMs(message), REVEAL_PAUSE_MS),
    render: (skip) => (
      <RevealFade skip={skip} className={messageClassName}>
        <p>{message}</p>
      </RevealFade>
    ),
  }));

  return <RevealSequence steps={steps} className={`${gapClassName} ${className}`} initialSkip={initialSkip} />;
}
