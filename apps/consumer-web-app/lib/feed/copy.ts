/**
 * Templated personalization — never freeform generation. Every sentence
 * here is built from a fixed template plus real values (a metric label, a
 * narrative summary already written in the "Good" register by
 * lib/narrative/generator.ts). This is what keeps "Why You're Seeing
 * This" honest and non-invasive instead of an LLM improvising a reason.
 */

import type { FourDoctorsCategory, MefContentItem } from '@mef/shared-types-contracts';
import { WELLNESS_METRIC_LABEL, type WellnessMetricKey } from '../wellness/wellness-index';
import type { TimeContext } from './timeContext';

export type SelectionReason =
  | { kind: 'coach_assigned' }
  | { kind: 'narrative_match'; narrativeSummary: string }
  | { kind: 'priority_metric'; metric: WellnessMetricKey }
  | { kind: 'goal_rotation' };

/** Plain-language phrasing of the Four Doctors categories for member-facing copy — the internal `doctor_*` category is real, classification data (unlike the fabricated "Four Doctors %" once removed from the dashboard, see app/dashboard/page.tsx), so it's fine to reflect it; it just reads better in a coaching sentence as "movement" than as internal category jargon "Doctor Movement". */
export const FOUR_DOCTORS_PLAIN_LABEL: Record<FourDoctorsCategory, string> = {
  doctor_diet: 'nutrition',
  doctor_quiet: 'rest and recovery',
  doctor_movement: 'movement',
  doctor_happiness: 'mood and connection',
};

export function buildFocusText(item: MefContentItem, reason: SelectionReason): string {
  if (reason.kind === 'priority_metric') {
    const label = WELLNESS_METRIC_LABEL[reason.metric];
    return `${label} is today's focus. It's shown up in your recent check-ins, so let's give it a little extra attention — small, consistent wins here matter far more than trying to do everything at once.`;
  }
  if (reason.kind === 'coach_assigned') {
    return `Your coach hand-picked today's lesson for you: ${item.title}.`;
  }
  const plain = FOUR_DOCTORS_PLAIN_LABEL[item.four_doctors_category] ?? 'your wellness';
  return `Today's focus is on ${plain}: ${item.title}. One small, consistent step here is worth more than trying to do everything at once.`;
}

export function buildWhyText(reason: SelectionReason): string {
  switch (reason.kind) {
    case 'coach_assigned':
      return 'Your coach selected this for you directly.';
    case 'narrative_match':
      return reason.narrativeSummary;
    case 'priority_metric':
      return `We selected today's lesson because ${WELLNESS_METRIC_LABEL[reason.metric].toLowerCase()} has become an area worth extra attention in your recent check-ins.`;
    case 'goal_rotation':
      return "Today's lesson brings something a little different into your coaching experience — variety helps keep things fresh.";
  }
}

export function selectionReasonsToJson(reason: SelectionReason): Record<string, unknown> {
  return { ...reason };
}

/** Reads a persisted `selection_reasons` JSON value back into a typed SelectionReason — defensively, since the column is stored as loose JSON. Falls back to 'goal_rotation' (the most neutral, least-specific reason) if the shape is ever unexpected rather than throwing, matching the "never let presentation code break the page" discipline used elsewhere (e.g. lib/narrative/service.ts's try/catch). */
export function parseSelectionReason(json: Record<string, unknown>): SelectionReason {
  const kind = json.kind;
  if (kind === 'coach_assigned') return { kind: 'coach_assigned' };
  if (kind === 'narrative_match' && typeof json.narrativeSummary === 'string') {
    return { kind: 'narrative_match', narrativeSummary: json.narrativeSummary };
  }
  if (kind === 'priority_metric' && typeof json.metric === 'string') {
    return { kind: 'priority_metric', metric: json.metric as WellnessMetricKey };
  }
  return { kind: 'goal_rotation' };
}

/** The reason-based observation sentence — used whenever there's no stronger, more specific continuity fact (a real weekly pattern, a saved-item callback, a narrative reference) to lead with instead. */
function reasonObservation(reason: SelectionReason): string {
  switch (reason.kind) {
    case 'priority_metric':
      return `I noticed ${WELLNESS_METRIC_LABEL[reason.metric].toLowerCase()} could use a little extra attention lately, based on your recent check-ins.`;
    case 'narrative_match':
      return "I've been following your recent progress, and today felt like the right moment to build on it.";
    case 'coach_assigned':
      return "I picked today's lesson for you myself.";
    case 'goal_rotation':
      return 'I wanted to bring something a little different into your coaching today.';
  }
}

/**
 * The Coach's Note — the emotional centerpiece at the top of the Daily
 * Coaching Experience. Templated personalization, same discipline as
 * buildFocusText/buildWhyText above: every sentence is built from a fixed
 * template plus real values. Never a second copy of focus_text/why_text —
 * this is a warmer, complementary lead-in, not a restatement.
 *
 * `continuitySentence` (see lib/feed/continuity.ts's buildContinuitySentence)
 * and `streakMessage` (lib/feed/streakIntelligence.ts's buildStreakMessage)
 * are the coaching-memory layer's real, derived facts — when present they
 * take priority over the generic per-reason observation, which is exactly
 * what turns "Today's lesson focuses on movement" into "You've been
 * improving your consistency over the past week. Today we'll continue
 * building that momentum" whenever there's real history to say that from.
 */
export function buildCoachNote(input: {
  firstName: string;
  timeContext: TimeContext;
  reason: SelectionReason;
  streakMessage: string | null;
  continuitySentence: string | null;
  category: FourDoctorsCategory;
}): string {
  const greeting = `${input.timeContext.greetingWord}, ${input.firstName}. ${input.timeContext.weekPhase.tone}`;
  const observation = input.continuitySentence ?? reasonObservation(input.reason);
  const streakLine = input.streakMessage ? ` ${input.streakMessage}` : '';
  const segue = ` Let's place a little extra attention on ${FOUR_DOCTORS_PLAIN_LABEL[input.category]} today. Don't worry about doing everything perfectly — one small action keeps your momentum moving forward.`;

  return `${greeting} ${observation}${streakLine}${segue}`;
}

const BONUS_CHALLENGE: Record<FourDoctorsCategory, string> = {
  doctor_movement:
    'Try doing it outside, even for a minute — fresh air tends to make movement feel easier.',
  doctor_diet:
    'Notice how your body feels about 30 minutes afterward — no need to change anything, just notice.',
  doctor_quiet: 'Try it without your phone nearby — see if that changes how it feels.',
  doctor_happiness:
    'Share how it goes with someone you trust — saying it out loud tends to make it stick.',
};

/** An optional, generic, category-templated add-on — never member-specific data, so it's honest to show for every lesson regardless of what we know about this particular member. */
export function buildBonusChallenge(category: FourDoctorsCategory): string {
  return BONUS_CHALLENGE[category];
}
