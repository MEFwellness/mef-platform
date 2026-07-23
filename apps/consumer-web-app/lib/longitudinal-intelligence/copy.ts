/**
 * Longitudinal Intelligence — three-tier coaching language (Prompt 12,
 * Part 2). Mirrors lib/intelligence/copy.ts's and
 * lib/narrative/generator.ts's own explicit correlation-safe-voice
 * discipline exactly ("tends to appear alongside," never "causes") —
 * reused, not reinvented. Every sentence here is templated, never
 * freeform, and never diagnoses.
 *
 * Tier gating always reads `tier` off an already-classified
 * LongitudinalSignal (signalState.ts) — this file only turns a
 * (state, tier) pair into a member-safe sentence, never re-decides the
 * tier itself.
 */

import type { LongitudinalSignal, SignalState } from './types';

const TIER_1_OPENERS = ['You mentioned this once', 'We noticed this once', 'This may be worth watching'];
const TIER_2_OPENERS = [
  "This has shown up more than once",
  "We're beginning to notice this",
  'There may be a connection worth exploring here',
];
const TIER_3_OPENERS = [
  'A consistent pattern is emerging',
  'This has repeatedly appeared alongside your recent history',
  'Based on your recent history, this looks steady',
];

function pick(options: string[], seedKey: string): string {
  // Deterministic, not random — same signal always reads the same way
  // across a single render, avoiding an inconsistent-feeling UI.
  let hash = 0;
  for (let i = 0; i < seedKey.length; i++) hash = (hash * 31 + seedKey.charCodeAt(i)) >>> 0;
  return options[hash % options.length]!;
}

const FIXED_STATE_PHRASE: Partial<Record<SignalState, string>> = {
  stale: "This hasn't been updated in a while, so we're treating it as older information.",
  conflicting: "What we're seeing here is mixed — different signals point in different directions right now.",
  insufficient_data: "We don't have enough information yet to say much about this.",
  resolved: 'This looks like it has settled down since we first noticed it.',
};

const DIRECTION_PHRASE: Partial<Record<SignalState, string>> = {
  improving: 'and it tends to be trending in a better direction',
  worsening: 'and it tends to be trending in a tougher direction',
  stable: 'and it has tended to stay about the same',
};

/**
 * The one sentence rendered to a member for a given signal — always
 * composed from the fixed tier opener + (optional) direction phrase, never
 * freeform text, and never a causal claim.
 */
export function describeSignalForMember(signal: LongitudinalSignal): string {
  const fixed = FIXED_STATE_PHRASE[signal.state];
  if (fixed) return fixed;

  const opener =
    signal.tier === 3
      ? pick(TIER_3_OPENERS, signal.signalKey)
      : signal.tier === 2
        ? pick(TIER_2_OPENERS, signal.signalKey)
        : pick(TIER_1_OPENERS, signal.signalKey);

  const direction = DIRECTION_PHRASE[signal.state];
  return direction ? `${opener}, ${direction}.` : `${opener}.`;
}

/** Coach-facing — same tier discipline, slightly more direct, still never a diagnosis or a causal claim. */
export function describeSignalForCoach(signal: LongitudinalSignal): string {
  const occurrence = `${signal.occurrenceCount} occurrence${signal.occurrenceCount === 1 ? '' : 's'}`;
  return `${describeSignalForMember(signal)} (${occurrence}, last observed ${signal.lastObservedAt.slice(0, 10)}.)`;
}

export const TIER_LABEL: Record<1 | 2 | 3, string> = {
  1: 'One-time observation',
  2: 'Repeated signal',
  3: 'Qualified pattern',
};
