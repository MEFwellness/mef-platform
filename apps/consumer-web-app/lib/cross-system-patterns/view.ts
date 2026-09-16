/**
 * The pattern card, built from a match. Pure: handed matches, the member's
 * own rows and the set of rows carrying a safety response, it returns a
 * shape. No query, no clock, nothing invented.
 *
 * THE BLOCKS ARE BUILT SEPARATELY AND THEY STAY SEPARATE.
 *
 *   OBSERVED is the member's own reported signals with their own values.
 *     Nothing in it is a coach's wording and nothing in it is an
 *     interpretation: it is what the row says, as the row says it.
 *   RELATED SIGNALS is the definition's own related inputs, each with a
 *     count of the rows sitting under it. A count, not a verdict.
 *   PATTERN STRENGTH is which level of the coach's own ladder the counts
 *     reached, plus one of the two fixed display lines.
 *   POSSIBLE ASSOCIATION is HER WORDING, carried through character for
 *     character from the version this match read, and nothing else is ever
 *     put in this field. If she wrote none, it is null and the card says
 *     so rather than composing one.
 *   COACHING CONSIDERATIONS is her list, in her order, unchanged.
 *
 * Four different kinds of statement, and the reason they are four fields
 * rather than one paragraph is that a paragraph is where a careful "may be
 * relevant" quietly becomes a finding.
 *
 * THERE IS NO COMBINED SCORE ANYWHERE IN THIS FILE. Nothing here reads a
 * questionnaire percentage, a band or a section total, and nothing adds a
 * pattern to one. The Body Systems Survey's own numbers stay exactly where
 * they are, on their own card, untouched.
 *
 * THE SAFETY OVERRIDE HAPPENS FIRST AND IT HAPPENS HERE, in the builder
 * rather than in the component. A suppressed card is built with every
 * pattern field null and every list empty, so there is no possible
 * association and no coaching consideration IN THE PAYLOAD for a screen to
 * draw, not merely none that it chooses to. See the header of ./safety.ts
 * for why the rule is the wide one.
 */

import { sideLabelOf } from '@/lib/cross-system-signals/coachView';
import type { SignalRecord } from '@/lib/cross-system-signals/types';
import { SOURCE_CARD_ANCHORS } from './constants';
import { STRENGTH_DISPLAY_LINE } from './copy';
import { buildMovement } from './timeline';
import type {
  ContributingResponseLine,
  ContributingSignal,
  PatternCard,
  PatternMatch,
  PatternSourceLine,
  RelatedSystemLine,
  WholeBodyPatternsView,
} from './types';

/** Where this row's own sitting is read on this page, or null for a coach entry. */
function anchorFor(record: SignalRecord): string | null {
  if (record.sourceSessionId === null) return null;
  return SOURCE_CARD_ANCHORS[record.sourceKey] ?? null;
}

function sourceLine(contribution: ContributingSignal): PatternSourceLine {
  const { record } = contribution;
  return {
    sourceLabel: record.sourceLabel,
    signalName: record.signalName,
    sideLabel: sideLabelOf(record.side),
    valueLabel: record.valueLabel,
    capturedOn: record.capturedOn,
    anchorId: anchorFor(record),
    sourceSessionId: record.sourceSessionId,
  };
}

function responseLine(contribution: ContributingSignal): ContributingResponseLine {
  const { record } = contribution;
  return {
    signalId: record.id,
    signalName: record.signalName,
    sideLabel: sideLabelOf(record.side),
    valueLabel: record.valueLabel,
    sourceLabel: record.sourceLabel,
    capturedOn: record.capturedOn,
    sourceQuestionPrompt: record.sourceQuestionPrompt,
    note: record.note,
    role: contribution.role,
    componentLabel: contribution.componentLabel,
    anchorId: anchorFor(record),
    sourceSessionId: record.sourceSessionId,
    entryMode: record.entryMode,
  };
}

/**
 * The definition's related inputs, each with what is sitting under it.
 *
 * EVERY RELATED INPUT SHE WROTE IS LISTED, including one nothing matched,
 * which reads as nought. A block that quietly dropped the empty ones would
 * be telling a coach her pattern is made of fewer things than she wrote.
 */
export function relatedSystemLines(match: PatternMatch): RelatedSystemLine[] {
  return [...match.version.components]
    .filter((component) => component.role === 'related')
    .sort((a, b) => a.position - b.position)
    .map((component) => ({
      refKind: component.refKind,
      refKey: component.refKey,
      label: component.refLabel,
      supportingCount: match.supporting.filter(
        (entry) => entry.componentPosition === component.position
      ).length,
    }));
}

/** "1 thing" / "2 things", so no line ever prints "1 signals". */
function plural(count: number, singular: string, pluralWord?: string): string {
  return `${count} ${count === 1 ? singular : (pluralWord ?? `${singular}s`)}`;
}

/**
 * Why Root noticed this, which is the arithmetic and nothing else.
 *
 * It names the two counts a coach can go and check herself. It does not
 * say what they mean, because what they may mean is the next block and it
 * is in her own words.
 */
export function whyNoticedLine(match: PatternMatch): string {
  return `Root identified ${plural(match.supportingCount, 'supporting signal')} across ${plural(
    match.sourceCount,
    'source'
  )}.`;
}

/**
 * One card, built from one match.
 *
 * `flaggedSignalIds` is the set of stored rows carrying a safety response,
 * decided entirely by the existing red flag layer (./safety.ts). A card
 * touching one of them is not a pattern card at all.
 */
export function buildPatternCard(
  match: PatternMatch,
  records: readonly SignalRecord[],
  flaggedSignalIds: ReadonlySet<string>
): PatternCard {
  const contributions = [...match.primary, ...match.supporting];
  const flagged = contributions.filter((entry) => flaggedSignalIds.has(entry.record.id));

  // THE OVERRIDE, AND IT IS THE FIRST THING. Everything below this branch
  // is unreachable for a card the safety system has claimed, which is why
  // no test has to trust a component to hide a field.
  if (flagged.length > 0) {
    const names: string[] = [];
    for (const entry of flagged) {
      const label = entry.record.signalName;
      if (!names.includes(label)) names.push(label);
    }
    return {
      patternKey: match.head.patternKey,
      relationshipId: match.head.id,
      suppressed: true,
      suppressedSignalNames: names,
      patternName: null,
      versionNumber: null,
      versionId: null,
      strength: null,
      levelLabel: null,
      displayLine: null,
      observed: [],
      relatedSystems: [],
      possibleAssociation: null,
      whyNoticed: null,
      sources: [],
      considerations: [],
      contributingResponses: [],
      movement: null,
    };
  }

  return {
    patternKey: match.head.patternKey,
    relationshipId: match.head.id,
    suppressed: false,
    suppressedSignalNames: [],
    patternName: match.version.patternName,
    versionNumber: match.version.versionNumber,
    versionId: match.version.id,
    strength: match.strength,
    levelLabel: match.levelLabel,
    // THE ONE PLACE A STRENGTH BECOMES A SENTENCE. The matcher reached
    // 'emerging' or 'stronger' by counting; the words belong here, on the
    // coach's side of the fence.
    displayLine: match.strength === null ? null : STRENGTH_DISPLAY_LINE[match.strength],

    // OBSERVED IS THE PRIMARY ROWS, which is what the member reported that
    // this definition starts from. The supporting rows are the next block
    // and the two are never run together.
    observed: match.primary.map(sourceLine),
    relatedSystems: relatedSystemLines(match),

    // HER WORDING, UNCHANGED. Never composed, never defaulted, never
    // prefixed with a sentence of this feature's own.
    possibleAssociation: match.version.possibleAssociationText,

    whyNoticed: whyNoticedLine(match),
    sources: contributions.map(sourceLine),
    considerations: match.version.considerations
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((entry) => entry.body),
    contributingResponses: contributions.map(responseLine),
    movement: buildMovement(contributions, records),
  };
}

/**
 * The whole section, from the matches the engine surfaced.
 *
 * `activeRelationshipCount` is carried so an empty section can say WHY it
 * is empty. "Nothing to review" when a coach has written definitions and
 * this member matches none of them is a different fact from "the library
 * has nothing switched on yet", and a section that said the same thing to
 * both would send her looking in the wrong place.
 */
export function buildWholeBodyPatternsView(input: {
  matches: readonly PatternMatch[];
  records: readonly SignalRecord[];
  flaggedSignalIds: ReadonlySet<string>;
  activeRelationshipCount: number;
}): WholeBodyPatternsView {
  const cards = input.matches.map((match) =>
    buildPatternCard(match, input.records, input.flaggedSignalIds)
  );
  return {
    cards,
    patternCount: cards.filter((card) => !card.suppressed).length,
    suppressedCount: cards.filter((card) => card.suppressed).length,
    activeRelationshipCount: input.activeRelationshipCount,
  };
}
