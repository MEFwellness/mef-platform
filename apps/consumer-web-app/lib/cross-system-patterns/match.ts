/**
 * THE MATCHING ENGINE. Deterministic, pure, and no model anywhere near it.
 *
 * Handed a member's stored signal rows and a list of relationship
 * definitions, it returns which definitions those rows satisfy. Same
 * input, same answer, every time. There is no clock in this file, no
 * query, no randomness and nothing that could call out to a model: a
 * pattern a coach reads is arithmetic over rows she can open, against
 * thresholds she wrote herself.
 *
 * THE THREE OUTCOMES the brief names, and where each one is decided:
 *
 *   SINGLE SIGNAL. The primary input is present and the floor is not met.
 *     `surfaced` is false and every field describing a pattern is null, so
 *     no card is built and no cross-system sentence exists to render. One
 *     answer alone can never produce one, because one row can satisfy at
 *     most one supporting input and the floor is at least one supporting
 *     signal ON TOP of the primary.
 *   EMERGING. Primary present, floor met, and the LOWEST strength level
 *     the coach defined is reached.
 *   STRONGER. Any level above the lowest one she defined is reached.
 *
 * INACTIVE DEFINITIONS ARE NOT READ AT ALL. `matchMemberSignals` filters
 * on the head record's active flag before it looks at a single signal, so
 * a definition she has switched off cannot surface a card, cannot appear
 * in a count and cannot reach the evaluation ledger.
 *
 * ONLY THE CURRENT VALUE OF A SIGNAL COUNTS. The library is append over
 * time, so a standardized signal has a row per capture. The engine reads
 * the LATEST row per signal and side; the older rows are the timeline
 * (./timeline.ts) and never a second vote.
 *
 * IT COUNTS, IT DOES NOT SPEAK. Nothing in this file holds a sentence a
 * coach reads, and that is deliberate rather than incidental: this module
 * is reachable from a MEMBER'S own submit, because ingesting her finished
 * sitting is the first re-evaluation trigger. A match therefore reaches a
 * STRENGTH, 'emerging' or 'stronger', and ./copy.ts turns that into one of
 * the two display lines where the card is built, on the coach's side of
 * the fence. See the header of ./copy.ts.
 *
 * AN EXPLICIT NOUGHT IS NOT A SIGNAL. A stored value of zero is the member
 * saying the thing is not happening ("Never" is nought points on the Body
 * Systems Survey's own scale), and a settled row is written precisely so
 * last month's alarm can close itself out. Counting one as present would
 * surface a pattern out of answers that said no.
 */

import type { SignalRecord } from '@/lib/cross-system-signals/types';
import type {
  RelationshipComponent,
  RelationshipStrengthLevel,
  RelationshipSummary,
  RelationshipVersion,
} from '@/lib/cross-system-relationships/types';
import type { PatternStrength } from './constants';
import type { ContributingSignal, PatternMatch } from './types';

/**
 * The latest row per standardized signal and side.
 *
 * A LEFT HIP AND A RIGHT HIP STAY TWO SIGNALS, the same grouping key the
 * coach's Signals list uses, because they are two things a coach treats
 * separately and a definition may name one of them.
 */
export function currentSignals(records: readonly SignalRecord[]): SignalRecord[] {
  const latest = new Map<string, SignalRecord>();
  for (const record of records) {
    const key = `${record.signalSlug}::${record.side ?? 'none'}`;
    const held = latest.get(key);
    if (!held || newer(record, held)) latest.set(key, record);
  }
  return [...latest.values()];
}

function newer(candidate: SignalRecord, held: SignalRecord): boolean {
  if (candidate.capturedOn !== held.capturedOn) return candidate.capturedOn > held.capturedOn;
  return candidate.capturedAt > held.capturedAt;
}

/**
 * Whether a row says the thing is happening at all.
 *
 * A row with no comparable number is a presence: the source recorded that
 * something was found rather than how much of it there was, and there is
 * nothing to compare it against. A row with a number says the thing at
 * that level, and nought means it was reported as absent.
 */
export function isPresent(record: SignalRecord): boolean {
  if (record.valueNumeric === null) return true;
  return record.valueNumeric > 0;
}

/**
 * Whether one stored row satisfies one input of a definition.
 *
 * EVERY CONDITION THE COACH SET HAS TO HOLD, and a condition she left
 * empty is a condition she did not set. That is what makes one shape cover
 * joint to system, skin to digestion and stress to a physical symptom
 * without a special case anywhere: an input names a vocabulary and a key,
 * and optionally narrows by side, by a particular stored answer, by a
 * floor on the comparable number, or by the exact instrument and question.
 */
export function signalSatisfies(
  record: SignalRecord,
  component: RelationshipComponent
): boolean {
  if (!isPresent(record)) return false;

  switch (component.refKind) {
    case 'signal':
      if (record.signalSlug !== component.refKey) return false;
      break;
    case 'category':
      if (record.categoryKey !== component.refKey) return false;
      break;
    case 'body_area':
      if (record.bodyAreaKey !== component.refKey) return false;
      break;
    default:
      return false;
  }

  // A side on the input means the coach meant that side. A null side, and
  // the 'not_applicable' she taps when the question does not arise, both
  // mean the input does not care which side.
  if (component.side !== null && component.side !== 'not_applicable') {
    if (record.side !== component.side) return false;
  }

  if (component.valueKey !== null && record.valueKey !== component.valueKey) return false;

  if (component.minValueNumeric !== null) {
    if (record.valueNumeric === null) return false;
    if (record.valueNumeric < component.minValueNumeric) return false;
  }

  if (component.sourceKey !== null && record.sourceKey !== component.sourceKey) return false;

  if (
    component.sourceQuestionRef !== null &&
    record.sourceQuestionRef !== component.sourceQuestionRef
  ) {
    return false;
  }

  return true;
}

/**
 * Which level of the coach's own ladder these counts reach.
 *
 * THE HIGHEST LEVEL WHOSE EVERY THRESHOLD HOLDS, read in her own order. A
 * threshold she left empty is one that level does not use. Null when she
 * has defined no level these counts reach, which surfaces nothing rather
 * than inventing a band she did not write.
 */
export function reachedLevel(
  levels: readonly RelationshipStrengthLevel[],
  counts: { supporting: number; related: number; distinctCategories: number }
): { level: RelationshipStrengthLevel; index: number } | null {
  const ordered = [...levels].sort((a, b) => a.position - b.position);
  let reached: { level: RelationshipStrengthLevel; index: number } | null = null;
  for (const [index, level] of ordered.entries()) {
    if (counts.supporting < level.minSupportingSignals) continue;
    if (
      level.minDistinctCategories !== null &&
      counts.distinctCategories < level.minDistinctCategories
    ) {
      continue;
    }
    if (level.minRelatedSignals !== null && counts.related < level.minRelatedSignals) continue;
    reached = { level, index };
  }
  return reached;
}

/**
 * Emerging or Stronger, from a level's PLACE rather than from its name.
 *
 * Emerging and Stronger are rows a coach may rename, reorder, delete or
 * add to, so the engine never reads a level key to decide what to print.
 * The lowest band she defined is the emerging one; anything she put above
 * it means more than one thing is contributing, which is what the second
 * line says.
 */
export function levelStrength(index: number): PatternStrength {
  return index === 0 ? 'emerging' : 'stronger';
}

/**
 * One definition, evaluated against one member's current signals.
 *
 * The caller has already decided this definition is ACTIVE. This function
 * does the counting and nothing else.
 */
export function matchOne(
  summary: RelationshipSummary,
  current: readonly SignalRecord[]
): PatternMatch {
  const version: RelationshipVersion = summary.current;
  const components = [...version.components].sort((a, b) => a.position - b.position);

  const primary: ContributingSignal[] = [];
  const supporting: ContributingSignal[] = [];
  // A row contributes ONCE. A definition naming both a body area and the
  // category a signal sits in would otherwise count one answer twice and
  // clear a floor of two out of a single response, which is the exact
  // thing the floor exists to prevent.
  const claimed = new Set<string>();
  let relatedCount = 0;

  for (const component of components) {
    if (component.role !== 'primary') continue;
    for (const record of current) {
      if (claimed.has(record.id)) continue;
      if (!signalSatisfies(record, component)) continue;
      claimed.add(record.id);
      primary.push(contribution(record, component));
    }
  }

  // Related before support, so a row that could answer either is counted
  // under the related input rather than the supporting one. That is the
  // stronger statement about the pattern, and it is what the card groups
  // its per system counts by.
  for (const role of ['related', 'support'] as const) {
    for (const component of components) {
      if (component.role !== role) continue;
      for (const record of current) {
        if (claimed.has(record.id)) continue;
        if (!signalSatisfies(record, component)) continue;
        claimed.add(record.id);
        supporting.push(contribution(record, component));
        if (role === 'related') relatedCount += 1;
      }
    }
  }

  const supportingCount = supporting.length;
  const distinctCategoryCount = new Set(supporting.map((entry) => entry.record.categoryKey)).size;
  const sourceCount = new Set(
    [...primary, ...supporting].map((entry) => entry.record.sourceLabel)
  ).size;

  const empty = {
    head: summary.head,
    version,
    surfaced: false,
    levelKey: null,
    levelLabel: null,
    strength: null,
    primary,
    supporting,
    supportingCount,
    relatedCount,
    distinctCategoryCount,
    sourceCount,
    minSupportingSignals: version.minSupportingSignals,
  } satisfies PatternMatch;

  // NO PRIMARY, NO PATTERN. A definition is a statement about something
  // starting somewhere, and a member with none of its primary inputs is
  // not the member it describes.
  if (primary.length === 0) return empty;

  // THE FLOOR IS ABSOLUTE, and it sits under every level. This is the
  // Single Signal case: the primary is there, the support is not, and
  // nothing at all surfaces.
  if (supportingCount < version.minSupportingSignals) return empty;

  const reached = reachedLevel(version.strengthLevels, {
    supporting: supportingCount,
    related: relatedCount,
    distinctCategories: distinctCategoryCount,
  });
  if (!reached) return empty;

  return {
    ...empty,
    surfaced: true,
    levelKey: reached.level.levelKey,
    levelLabel: reached.level.displayLabel,
    strength: levelStrength(reached.index),
  };
}

function contribution(
  record: SignalRecord,
  component: RelationshipComponent
): ContributingSignal {
  return {
    record,
    role: component.role,
    componentPosition: component.position,
    componentLabel: component.refLabel,
  };
}

/**
 * Every ACTIVE definition this member's signals satisfy.
 *
 * The active filter is first, before any signal is read, so an inactive
 * definition costs nothing and can reach nothing. Returned in the
 * library's own order.
 */
export function matchMemberSignals(
  summaries: readonly RelationshipSummary[],
  records: readonly SignalRecord[]
): PatternMatch[] {
  const active = summaries.filter((summary) => summary.head.isActive);
  if (active.length === 0) return [];
  const current = currentSignals(records);
  return active
    .map((summary) => matchOne(summary, current))
    .filter((match) => match.surfaced);
}
