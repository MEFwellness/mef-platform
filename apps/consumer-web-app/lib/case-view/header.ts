/**
 * Case View — the case header (requirement 1). Pure, no I/O. Reuses
 * lib/welcome/goals.ts's existing WELCOME_GOALS labels verbatim rather
 * than inventing new copy — the only place this ever deviates from that
 * existing language is when she typed her own free text, which is quoted
 * exactly, never rewritten or normalized.
 */

import { SOMETHING_ELSE_KEY, WELCOME_GOALS } from '../welcome/goals';
import type { MemberGoalSelection } from '../member-goals/data';
import type { CaseHeader } from './types';

function labelForGoalKey(goalKey: string): string | null {
  return WELCOME_GOALS.find((g) => g.key === goalKey)?.label ?? null;
}

/**
 * Builds the header from the member's latest goal selection. Precedence:
 * 1. A primary goal is set and it's 'something_else' with free text ->
 *    quote her exact wording.
 * 2. A primary goal is set and it maps to a known label -> use that
 *    label verbatim (already-established product language, not new copy).
 * 3. No primary goal, but exactly one goal was ever selected -> use that
 *    one (same auto-promotion rule the welcome flow itself already
 *    applies when only one goal is picked).
 * 4. No goal selection exists at all -> a neutral, honest placeholder —
 *    never a fabricated goal.
 */
export function buildCaseHeader(selection: MemberGoalSelection | null): CaseHeader {
  if (!selection) {
    return { title: 'What you’re working on', isVerbatimQuote: false, primaryGoalKey: null, allGoalKeys: [] };
  }

  const effectiveGoalKey = selection.primaryGoal ?? (selection.goals.length === 1 ? selection.goals[0]! : null);

  if (effectiveGoalKey === SOMETHING_ELSE_KEY && selection.goalsOther) {
    return {
      title: selection.goalsOther,
      isVerbatimQuote: true,
      primaryGoalKey: effectiveGoalKey,
      allGoalKeys: selection.goals,
    };
  }

  const label = effectiveGoalKey ? labelForGoalKey(effectiveGoalKey) : null;
  if (label) {
    return { title: label, isVerbatimQuote: false, primaryGoalKey: effectiveGoalKey, allGoalKeys: selection.goals };
  }

  return {
    title: 'What you’re working on',
    isVerbatimQuote: false,
    primaryGoalKey: effectiveGoalKey,
    allGoalKeys: selection.goals,
  };
}
