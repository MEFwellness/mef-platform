/**
 * Daily Encouragement — a single, calm, non-personalized line shown near
 * the top of the Daily Coaching Experience (Premium UX refinement
 * milestone, item 6). Deliberately generic and deliberately NOT built from
 * member data: unlike the Coach's Note (lib/feed/copy.ts's buildCoachNote),
 * this is meant to feel like a steady, universal tone-setter, not a claim
 * about this specific member. Rotation is a pure, deterministic function of
 * the calendar date — same line for everyone on a given day, no randomness,
 * no client-side flicker between server and client render.
 */

const ENCOURAGEMENT_LINES = [
  'Progress comes from consistency.',
  'Small actions create lasting change.',
  'Take care of today. Tomorrow will thank you.',
  'One good choice is enough to start with.',
  'Consistency beats perfection.',
  'You show up, one day at a time — that is the whole practice.',
  'Small steps, repeated, become who you are.',
];

function stableIndex(seed: string, poolSize: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % poolSize;
}

/** localDate is a plain YYYY-MM-DD string (see resolveLocalDate), so this needs no timezone handling of its own. */
export function dailyEncouragement(localDate: string): string {
  return ENCOURAGEMENT_LINES[stableIndex(localDate, ENCOURAGEMENT_LINES.length)]!;
}

/** Quiet, no-guilt completion messages (item 9) — never streak language here, since a streak break is exactly the moment this must not feel like shaming. Picked deterministically per feed item so it doesn't change on every re-render/refresh. */
const COMPLETION_LINES = [
  'Great work. Nice job showing up today.',
  'Done. Consistency beats perfection.',
  "Nicely done — that's today taken care of.",
  'Complete. Small actions add up more than they seem to.',
];

export function completionCelebration(feedItemId: string): string {
  return COMPLETION_LINES[stableIndex(feedItemId, COMPLETION_LINES.length)]!;
}
