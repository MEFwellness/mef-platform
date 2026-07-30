/**
 * Assigns one of a small, fixed set of observational (never diagnostic)
 * pattern labels to a lead, from plain rules over their own follow-up
 * answers — never left to the LLM, same "deterministic scaffolding, LLM
 * only writes the sentence" discipline as flow.ts. The label is stored on
 * lead_conversations.pattern_name / captured_leads.pattern_name (migration
 * 123) and is what the two-part insight (prompt.ts / fallback.ts) names
 * out loud. Full definitions + assignment rules are documented in
 * docs/LEAD_AGENT_VOICE.md — keep both in sync if either changes.
 */

import type { LeadPatternName, LeadTopic } from '@mef/shared-types-contracts';

export const PATTERN_LABELS: Record<LeadPatternName, string> = {
  recovery_deficit: 'a recovery deficit',
  compensation_pattern: 'a compensation pattern',
  overload_pattern: 'an overload pattern',
  fuel_timing_pattern: 'a fuel timing pattern',
  depletion_pattern: 'a depletion pattern',
  wind_down_deficit: 'a wind-down deficit',
  rhythm_disruption: 'a rhythm disruption',
  stress_loading_pattern: 'a stress-loading pattern',
};

const ALL_OVER_PATTERN = /all over|everywhere|all day|all of it|everything|every part/i;
const NOTHING_TRIED_PATTERN = /nothing|haven'?t tried|not really|no\b|not yet/i;
const AFTERNOON_PATTERN = /afternoon|midday|lunch/i;
const ALL_DAY_ENERGY_PATTERN = /all day|constant|never really/i;
const FALLING_ASLEEP_PATTERN = /falling asleep|fall asleep|drift off|can'?t (fall|get to) sleep/i;

/**
 * `whereOrWhenAnswer` is the lead's reply to follow_up_1 (where it shows up
 * / when it hits), `triedAnswer` is their reply to follow_up_3 (what
 * they've tried). Both are free text — a tapped quick-reply button's own
 * label (e.g. "All Over", "Nothing Yet") matches these patterns directly,
 * and a typed answer is matched the same way, so buttons and typing are
 * assigned identically.
 */
export function determinePatternName(
  topic: LeadTopic,
  whereOrWhenAnswer: string,
  triedAnswer: string
): LeadPatternName {
  const where = whereOrWhenAnswer.toLowerCase();
  const tried = triedAnswer.toLowerCase();
  const isAllOver = ALL_OVER_PATTERN.test(where);
  const triedNothing = NOTHING_TRIED_PATTERN.test(tried);

  switch (topic) {
    case 'pain':
      if (isAllOver) return 'overload_pattern';
      if (!triedNothing) return 'compensation_pattern';
      return 'recovery_deficit';
    case 'energy':
      if (AFTERNOON_PATTERN.test(where)) return 'fuel_timing_pattern';
      if (ALL_DAY_ENERGY_PATTERN.test(where)) return 'depletion_pattern';
      return 'recovery_deficit';
    case 'sleep':
      if (FALLING_ASLEEP_PATTERN.test(where)) return 'wind_down_deficit';
      return 'rhythm_disruption';
    case 'stress':
      if (isAllOver) return 'overload_pattern';
      return 'stress_loading_pattern';
    case 'general':
    default:
      return 'overload_pattern';
  }
}
