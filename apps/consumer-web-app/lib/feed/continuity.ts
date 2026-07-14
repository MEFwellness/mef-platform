/**
 * Coaching Continuity + Coach Insight (Parts 3 and 7) — turns the Member
 * Coaching Memory (lib/feed/memory.ts) and existing wellness/narrative
 * signals into calm, single-sentence coaching copy. Each builder here
 * picks AT MOST ONE real fact, in a fixed priority order — never a dump of
 * everything the system knows (same discipline as
 * lib/narrative/coachingReference.ts's pickCoachingReferenceSentence,
 * which this module reuses directly for the narrative-backed fallback
 * rather than re-deriving a second "what's relevant" heuristic).
 *
 * Nothing here does sentiment analysis or free-text interpretation of a
 * member's reflections — every sentence traces back to a count, a
 * comparison of two real numbers, or an already-recorded narrative/
 * wellness-insight sentence. No LLM, no fabrication.
 */

import type { FourDoctorsCategory, NarrativeItem } from '@mef/shared-types-contracts';
import type { WellnessInsight } from '../wellness/insights';
import { FOUR_DOCTORS_PLAIN_LABEL } from './copy';
import type { FeedMemory } from './memory';
import { pickCoachingReferenceSentence } from '../narrative/coachingReference';

const MIN_WEEK_SAMPLE = 2; // don't call two lessons in a week a "pattern" — matches this codebase's general minimum-sample discipline (see lib/narrative/generator.ts)

/**
 * The Today's Challenge carryover (Part 3's "Yesterday you chose to save
 * this for later" example) — only fires when today's actual selected
 * lesson IS a previously-saved, not-yet-completed item. Real match, never
 * a generic nudge about some other saved item.
 */
export function buildChallengeCarryover(
  memory: FeedMemory,
  todayContentItemId: string
): string | null {
  const match = memory.savedNotCompleted.find((s) => s.contentItemId === todayContentItemId);
  if (!match) return null;
  return "You saved this one for later — let's complete it today.";
}

/**
 * The Coach's Note continuity sentence — a real weekly pattern (a saved
 * item to pick back up, or a category the member has actually been
 * consistent with this week) takes priority over the generic per-reason
 * observation in buildCoachNote.
 */
export function buildContinuitySentence(memory: FeedMemory): string | null {
  if (memory.savedNotCompleted.length > 0) {
    const saved = memory.savedNotCompleted[0]!;
    return `You saved "${saved.title}" for later — let's pick that back up today.`;
  }

  if (memory.mostFrequentCategory) {
    const count = memory.categoryCountsThisWeek[memory.mostFrequentCategory];
    if (count >= MIN_WEEK_SAMPLE) {
      const label = FOUR_DOCTORS_PLAIN_LABEL[memory.mostFrequentCategory];
      return `You've completed ${count} ${label} lesson${count === 1 ? '' : 's'} this week — let's keep building on that.`;
    }
  }

  return null;
}

function categoryConsistencyInsight(memory: FeedMemory): string | null {
  for (const category of Object.keys(memory.categoryCountsThisWeek) as FourDoctorsCategory[]) {
    const thisWeek = memory.categoryCountsThisWeek[category];
    const previousWeek = memory.categoryCountsPreviousWeek[category];
    if (thisWeek >= MIN_WEEK_SAMPLE && thisWeek > previousWeek) {
      const label = FOUR_DOCTORS_PLAIN_LABEL[category];
      return `${label.charAt(0).toUpperCase()}${label.slice(1)} has become noticeably more consistent this week compared to last week.`;
    }
  }
  return null;
}

function categoryComparisonInsight(memory: FeedMemory): string | null {
  const entries = Object.entries(memory.categoryCountsThisWeek) as [FourDoctorsCategory, number][];
  const sorted = entries.slice().sort((a, b) => b[1] - a[1]);
  const [mostCategory, mostCount] = sorted[0]!;
  const [, leastCount] = sorted[sorted.length - 1]!;
  if (mostCount >= MIN_WEEK_SAMPLE && mostCount - leastCount >= 2) {
    const leastConsistent = sorted.filter(([, count]) => count === leastCount);
    if (leastConsistent.length === 1) {
      const [leastCategory] = leastConsistent[0]!;
      return `You've been more consistent with ${FOUR_DOCTORS_PLAIN_LABEL[mostCategory]} than with ${FOUR_DOCTORS_PLAIN_LABEL[leastCategory]} this week.`;
    }
  }
  return null;
}

/**
 * The daily Coach Insight card (Part 7) — one sentence, priority-ordered:
 * a real week-over-week consistency improvement, then a real gap between
 * two categories this week, then an already-validated wellness trend
 * (lib/wellness/insights.ts's detectInsights — the same detector Milestone
 * 2's narrative uses), then a real narrative reference. Returns null
 * (no card shown) rather than ever forcing a weak or generic statement.
 */
export function buildCoachInsight(input: {
  memory: FeedMemory;
  wellnessInsights: WellnessInsight[];
  narrativeItems: NarrativeItem[];
}): string | null {
  return (
    categoryConsistencyInsight(input.memory) ??
    categoryComparisonInsight(input.memory) ??
    input.wellnessInsights[0]?.message ??
    pickCoachingReferenceSentence(input.narrativeItems, null)
  );
}
