/**
 * WHAT A MEMBER READS OF HER OWN HEALTH APPRAISAL, and the whole of it.
 *
 * TWENTY ONE AREAS, A COLOUR EACH, AND A SENTENCE EACH, UNDER THE
 * INSTRUMENT'S OWN TEN PARTS. Not loudest first: the summary strip at the
 * top already tells her how many areas stand in each state, and what the map
 * below it is for is showing her WHERE those results fall in the body system
 * structure the questionnaire is built on. Reordering the sections by colour
 * would take that away, so the Parts stand in their own order and the
 * sections stand in theirs. No total, no percentage, no cutoff, no overall
 * grade and no combined result, because there is no such thing in this
 * instrument and because the numbers behind the colours live in tables with
 * no member policy at all (migration 262).
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
 * number, and a payload that can be asserted empty of them. The Part a card
 * belongs to travels as its id and its name, two strings, for the same
 * reason: a `partOrder` would be a number in a payload that is meant to have
 * none, and the order is already carried by the order of the cards.
 *
 * THE SHAPE OF THE SCREEN LIVES IN resultsView.ts. Grouping, counting and
 * the three band widths are pure, and her results map is interactive, so
 * they sit in a module that imports nothing but types and can be shipped to
 * a browser without dragging the Supabase client along. This module is the
 * database half, and re-exports them so callers have one import.
 *
 * TREND ONLY WHEN THERE IS SOMETHING TO COMPARE WITH. A first sitting has no
 * chip and no comparison line: a chip against nothing would be an invention.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllRows } from '@/lib/data/pagedSelect';
import { HAQ_RESULT_EXPLANATIONS } from './copy';
import { HAQ_PARTS, HAQ_SECTIONS } from './questionBank';
import type { HaqResultCard } from './resultsView';
import { readHaqMemberSectionResults } from './memberData';
import { haqRuntimeDefinitionId } from './data';
import type {
  HaqMemberSectionResult,
  HaqPartId,
  HaqResultColor,
  HaqSectionId,
  HaqTrend,
} from './types';

/**
 * The pure half of her results, re-exported so a caller that already has
 * this module does not need a second import to count or group the cards.
 */
export {
  HAQ_BAND_FILL,
  HAQ_RESULT_COLOR_ORDER,
  haqResultCounts,
  haqResultGroups,
} from './resultsView';
export type { HaqResultCard, HaqResultCounts, HaqResultGroup } from './resultsView';

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

/** Everything her results page renders. Deliberately holds no number of any kind. */
export type HaqMemberResults = {
  /** The instant she finished this sitting. Displayed in HER own timezone by the screen. */
  completedAt: string | null;
  cards: HaqResultCard[];
  /** True only when an earlier finished sitting exists, which is the only time a chip or the comparison line appears. */
  hasPrevious: boolean;
};

/**
 * The section's own stored row. A result for a section the instrument does
 * not have is not something the database can produce, but nothing here
 * pretends it read one either: the id stands in for the name and the card
 * sorts last rather than throwing her page away.
 */
function sectionOf(sectionId: HaqSectionId) {
  return HAQ_SECTIONS.find((section) => section.id === sectionId) ?? null;
}

function partNameOf(partId: HaqPartId): string {
  return HAQ_PARTS.find((part) => part.id === partId)?.name ?? partId;
}

/**
 * Her cards, in the instrument's own order: Part I's sections, then Part
 * II's, through to Part X's, exactly as the questionnaire asked them.
 *
 * THE ORDER IS THE BODY SYSTEM STRUCTURE, AND THAT IS THE POINT. An earlier
 * version stood the Red sections first. It answered "how many" twice and
 * "where" not at all, and the summary strip already answers "how many". So
 * the map keeps the Parts, and a colour never moves a section out of the
 * Part it belongs to.
 *
 * Each card carries the Part it sits under, as two strings, so the screen
 * can draw the ten headings without loading the question bank.
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
      const section = sectionOf(row.sectionId);
      return {
        sectionId: row.sectionId,
        sectionTitle: section?.title ?? row.sectionId,
        partId: section?.partId ?? row.sectionId,
        partName: section ? partNameOf(section.partId) : row.sectionId,
        resultColor: row.resultColor,
        memberResultLabel: row.memberResultLabel,
        explanation: HAQ_RESULT_EXPLANATIONS[row.resultColor],
        trend: was ? haqTrend(was, row.resultColor) : null,
      };
    })
    .sort(
      (a, b) =>
        (sectionOf(a.sectionId)?.order ?? Number.MAX_SAFE_INTEGER) -
        (sectionOf(b.sectionId)?.order ?? Number.MAX_SAFE_INTEGER)
    );
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
