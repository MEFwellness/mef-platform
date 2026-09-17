/**
 * WHAT A MEMBER READS OF HER OWN HEALTH APPRAISAL, and the whole of it.
 *
 * TWENTY ONE AREAS, A COLOUR EACH, AND A SENTENCE EACH. Loudest first, so
 * the areas worth a conversation are the ones she meets. No total, no
 * percentage, no cutoff, no overall grade and no combined result, because
 * there is no such thing in this instrument and because the numbers behind
 * the colours live in tables with no member policy at all (migration 262).
 *
 * NOTHING HERE CAN READ A NUMBER EVEN IF IT WANTED TO. Her colours arrive
 * through haq_member_section_results(), which returns a section id, a colour
 * and a label and nothing else. This module never names a table that holds a
 * value, and tests/haq-member-safety.test.ts fails if it ever reaches the
 * scoring rules.
 *
 * THE COUNTS ARE NOT IN THE PAYLOAD, ON PURPOSE. "High Attention, 13 areas"
 * is three numbers she must be able to read, and the surest way to prove no
 * HIDDEN number travels with them is for the page's props to carry no number
 * at all. So the view is cards, and the three counts are counted from the
 * cards on the way to the screen (`haqResultCounts`). One source for each
 * number, and a payload that can be asserted empty of them.
 *
 * TREND ONLY WHEN THERE IS SOMETHING TO COMPARE WITH. A first sitting has no
 * chip and no comparison line: a chip against nothing would be an invention.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllRows } from '@/lib/data/pagedSelect';
import { HAQ_RESULT_EXPLANATIONS } from './copy';
import { HAQ_SECTIONS } from './questionBank';
import { readHaqMemberSectionResults } from './memberData';
import { haqRuntimeDefinitionId } from './data';
import type {
  HaqMemberResultLabel,
  HaqMemberSectionResult,
  HaqResultColor,
  HaqSectionId,
  HaqTrend,
} from './types';

/**
 * RED, THEN YELLOW, THEN GREEN. The order the cards stand in, and the order
 * the summary block names the three states.
 */
export const HAQ_RESULT_COLOR_ORDER: readonly HaqResultColor[] = ['red', 'yellow', 'green'];

/**
 * Quietest to loudest. A trend is one step along this list, in one direction
 * or the other, and nothing else.
 */
const HAQ_SEVERITY_ORDER: readonly HaqResultColor[] = ['green', 'yellow', 'red'];

/**
 * How this sitting's colour reads beside the same section's colour last
 * time. Toward Green is Quieter, toward Red is Louder, the same colour is
 * Unchanged.
 *
 * IT IS A COMPARISON OF WHAT SHE REPORTED. Not of her health, and not a
 * recovery or a relapse.
 */
export function haqTrend(previous: HaqResultColor, current: HaqResultColor): HaqTrend {
  const before = HAQ_SEVERITY_ORDER.indexOf(previous);
  const now = HAQ_SEVERITY_ORDER.indexOf(current);
  if (now < before) return 'quieter';
  if (now > before) return 'louder';
  return 'unchanged';
}

/** One section, as her results page shows it. Words only. */
export type HaqResultCard = {
  sectionId: HaqSectionId;
  /** The section's own stored name. Locked content, never reworded for a screen. */
  sectionTitle: string;
  resultColor: HaqResultColor;
  memberResultLabel: HaqMemberResultLabel;
  /** The approved explanation for this colour, and the only one it ever gets. */
  explanation: string;
  /** Null unless she has an earlier finished sitting to compare this one with. */
  trend: HaqTrend | null;
};

/** Everything her results page renders. Deliberately holds no number of any kind. */
export type HaqMemberResults = {
  /** The instant she finished this sitting. Displayed in HER own timezone by the screen. */
  completedAt: string | null;
  cards: HaqResultCard[];
  /** True only when an earlier finished sitting exists, which is the only time a chip or the comparison line appears. */
  hasPrevious: boolean;
};

function sectionTitleOf(sectionId: HaqSectionId): string {
  return HAQ_SECTIONS.find((section) => section.id === sectionId)?.title ?? sectionId;
}

function sectionOrderOf(sectionId: HaqSectionId): number {
  const section = HAQ_SECTIONS.find((candidate) => candidate.id === sectionId);
  return section ? section.order : Number.MAX_SAFE_INTEGER;
}

/**
 * Her cards, loudest first, and inside one colour in the instrument's own
 * section order so two visits never reshuffle.
 *
 * `previous` is the same read of her earlier sitting, or null when there
 * isn't one. A section missing from it gets no chip rather than a guessed
 * one.
 */
export function buildHaqResultCards(
  current: readonly HaqMemberSectionResult[],
  previous: readonly HaqMemberSectionResult[] | null
): HaqResultCard[] {
  const before = new Map((previous ?? []).map((row) => [row.sectionId, row.resultColor]));

  return [...current]
    .map((row) => {
      const was = previous ? before.get(row.sectionId) : undefined;
      return {
        sectionId: row.sectionId,
        sectionTitle: sectionTitleOf(row.sectionId),
        resultColor: row.resultColor,
        memberResultLabel: row.memberResultLabel,
        explanation: HAQ_RESULT_EXPLANATIONS[row.resultColor],
        trend: was ? haqTrend(was, row.resultColor) : null,
      };
    })
    .sort((a, b) => {
      const byColor =
        HAQ_RESULT_COLOR_ORDER.indexOf(a.resultColor) - HAQ_RESULT_COLOR_ORDER.indexOf(b.resultColor);
      return byColor !== 0 ? byColor : sectionOrderOf(a.sectionId) - sectionOrderOf(b.sectionId);
    });
}

export type HaqResultCounts = Record<HaqResultColor, number>;

/**
 * How many areas stand in each state. Counted from the cards themselves, so
 * the summary block and the list below it cannot disagree, and so the three
 * always sum to the number of cards.
 */
export function haqResultCounts(cards: readonly HaqResultCard[]): HaqResultCounts {
  const counts: HaqResultCounts = { red: 0, yellow: 0, green: 0 };
  for (const card of cards) counts[card.resultColor] += 1;
  return counts;
}

/** Her finished sittings, newest first. A retake never replaces one, so this list only grows. */
export async function listCompletedHaqInstances(
  supabase: SupabaseClient,
  memberId: string,
  definitionId: string
): Promise<Array<{ id: string; completedAt: string | null }>> {
  const { ok, rows, error } = await selectAllRows<{ id: string; completed_at: string | null }>(() =>
    supabase
      .from('unified_assessment_sessions')
      .select('id, completed_at')
      .eq('member_id', memberId)
      .eq('assessment_definition_id', definitionId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .order('id', { ascending: false })
  );

  if (!ok) {
    console.error('listCompletedHaqInstances failed', error);
    return [];
  }
  return rows.map((row) => ({ id: row.id, completedAt: row.completed_at }));
}

/**
 * Her results page, built for the signed in member herself.
 *
 * Null means there is nothing to show: she has never finished a sitting, or
 * the read did not work, and a results page with no results is a worse
 * answer than being sent back to her questionnaires.
 */
export async function buildHaqMemberResults(
  supabase: SupabaseClient,
  memberId: string
): Promise<HaqMemberResults | null> {
  const definitionId = await haqRuntimeDefinitionId(supabase);
  if (!definitionId) return null;

  const sittings = await listCompletedHaqInstances(supabase, memberId, definitionId);
  const latest = sittings[0];
  if (!latest) return null;

  const current = await readHaqMemberSectionResults(supabase, latest.id);
  if (current.length === 0) return null;

  const earlier = sittings[1];
  const previous = earlier ? await readHaqMemberSectionResults(supabase, earlier.id) : null;

  return {
    completedAt: latest.completedAt,
    cards: buildHaqResultCards(current, previous),
    // An earlier sitting whose results could not be read is not a comparison,
    // so the line and the chips stay away rather than appearing half filled.
    hasPrevious: previous !== null && previous.length > 0,
  };
}
