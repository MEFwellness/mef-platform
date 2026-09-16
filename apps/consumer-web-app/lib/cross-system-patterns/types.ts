/**
 * Every shape the matching engine works in.
 *
 * NOTHING HERE IS A CONCLUSION. Read the field names: counts, row ids,
 * labels a coach wrote, and the day something was captured. There is no
 * cause field, no condition field, no confidence and no score, and there
 * is no place one could be added without a reviewer noticing.
 *
 * THE MATCH IS THE RECEIPT, NOT THE CLAIM. A PatternMatch names the
 * relationship version it read, the exact signal rows that satisfied each
 * of that version's inputs, and the arithmetic that cleared her own
 * thresholds. Every sentence a coach then reads about what it may mean is
 * her own stored wording, carried through unchanged.
 */

import type { SignalRecord } from '@/lib/cross-system-signals/types';
import type {
  RelationshipComponent,
  RelationshipHead,
  RelationshipVersion,
} from '@/lib/cross-system-relationships/types';
import type { PatternStrength } from './constants';

/**
 * One stored signal row that satisfied one input of a definition.
 *
 * It carries the WHOLE record rather than a summary, because the card has
 * to be able to print the exact original response, its source, its date
 * and the exact question the member was answering, and a summary that
 * dropped any of those would be the assertion this feature exists to
 * avoid.
 */
export type ContributingSignal = {
  record: SignalRecord;
  /** Which of the definition's three roles this row answered. */
  role: RelationshipComponent['role'];
  /** The input it satisfied, by its position in that version. */
  componentPosition: number;
  /** That input's label, as the coach wrote it on the day. */
  componentLabel: string;
};

/**
 * One active definition, evaluated against one member's current signals.
 *
 * `level` is null when the floor was cleared but no strength level the
 * coach defined was, which is the direction that surfaces nothing rather
 * than inventing a band she did not write. `surfaced` is the one flag
 * every reader checks: false means this member is at Single Signal or
 * below the floor, and NOTHING about a cross-system pattern may be drawn
 * for her anywhere.
 */
export type PatternMatch = {
  head: RelationshipHead;
  version: RelationshipVersion;

  /** True only when a primary input is present AND the floor is met AND a level was reached. */
  surfaced: boolean;

  /** Which level of the coach's own ladder was reached, or null. */
  levelKey: string | null;
  levelLabel: string | null;
  /**
   * Derived from the level's PLACE in her ladder, never from its name.
   * A strength rather than a sentence, because the matcher is reachable
   * from a member's own submit and holds no coach facing wording at all.
   * ./copy.ts turns this into one of the two display lines.
   */
  strength: PatternStrength | null;

  /** The rows that answered a primary input. */
  primary: ContributingSignal[];
  /** The rows that answered a related or a supporting input, each counted once. */
  supporting: ContributingSignal[];

  /** The arithmetic the thresholds were tested against. */
  supportingCount: number;
  relatedCount: number;
  distinctCategoryCount: number;
  sourceCount: number;

  /** The floor this member had to clear, from the version she was read against. */
  minSupportingSignals: number;
};

/** One dated point on a signal's own trajectory. */
export type TrajectoryPoint = {
  valueLabel: string;
  valueNumeric: number | null;
  capturedOn: string;
};

/** Which way a signal's latest value moved against the one before it. */
export type TrajectoryDirection = 'quieter' | 'louder' | 'steady' | 'unknown';

/** One contributing signal's change over time, as the card prints it. */
export type SignalTrajectory = {
  signalSlug: string;
  signalName: string;
  sideLabel: string | null;
  /** Oldest first, so the line reads "Often to Sometimes to Rarely". */
  points: TrajectoryPoint[];
  /** The latest value against the one before it. 'unknown' when there is nothing to compare. */
  direction: TrajectoryDirection;
  /** The trajectory as one string, or null when this signal has been recorded once. */
  line: string | null;
};

/**
 * What a pattern's dated rows have done, said neutrally.
 *
 * MOVEMENT IS OBSERVATIONAL ONLY. Every sentence this can produce
 * describes what the rows did. None of them says one area's change
 * produced another's, and none of them can: the generator counts
 * directions and picks a sentence, and the sentences are fixed strings in
 * ./timeline.ts with no signal name interpolated into any of them.
 */
export type PatternMovement = {
  trajectories: SignalTrajectory[];
  quieterCount: number;
  louderCount: number;
  /** The neutral pattern level lines, in order. Never more than one. */
  lines: string[];
};

/** One related body system named by the definition, with its supporting count. */
export type RelatedSystemLine = {
  refKind: RelationshipComponent['refKind'];
  refKey: string;
  /** The label as the coach wrote it on the day. */
  label: string;
  /** How many contributing rows sit under this input. */
  supportingCount: number;
};

/** One source, with what it contributed. */
export type PatternSourceLine = {
  sourceLabel: string;
  signalName: string;
  sideLabel: string | null;
  valueLabel: string;
  capturedOn: string;
  /** The card anchor for the sitting this came from, or null for a coach entry. */
  anchorId: string | null;
  sourceSessionId: string | null;
};

/** One exact original response, as "View contributing signals" prints it. */
export type ContributingResponseLine = {
  signalId: string;
  signalName: string;
  sideLabel: string | null;
  valueLabel: string;
  sourceLabel: string;
  capturedOn: string;
  /** Exactly what the member was answering, where the source recorded it. */
  sourceQuestionPrompt: string | null;
  note: string | null;
  role: RelationshipComponent['role'];
  /** The input this row answered, as the coach labelled it. */
  componentLabel: string;
  anchorId: string | null;
  sourceSessionId: string | null;
  entryMode: SignalRecord['entryMode'];
};

/**
 * One card a coach reads, fully built.
 *
 * A CARD IS EITHER A PATTERN OR A SAFETY PROMPT, never both and never a
 * blend. `suppressed` true means the existing red flag system fired on a
 * response behind this entry, and every pattern field below is empty
 * because the builder never filled them, not because the component chose
 * not to draw them. See buildPatternCards in ./view.ts.
 */
export type PatternCard = {
  /** The relationship's stable key, which survives a rename. */
  patternKey: string;
  relationshipId: string;

  /** True when the red flag system withheld this card. */
  suppressed: boolean;
  /** The signals carrying the safety response, named so a coach knows where to look. */
  suppressedSignalNames: string[];

  /** Null on a suppressed card. Her own name for the pattern otherwise. */
  patternName: string | null;
  versionNumber: number | null;
  versionId: string | null;

  strength: PatternStrength | null;
  levelLabel: string | null;
  displayLine: string | null;

  observed: PatternSourceLine[];
  relatedSystems: RelatedSystemLine[];
  possibleAssociation: string | null;
  whyNoticed: string | null;
  sources: PatternSourceLine[];
  considerations: string[];
  contributingResponses: ContributingResponseLine[];
  movement: PatternMovement | null;
};

/** Everything the Whole-Body Patterns section draws, in one read. */
export type WholeBodyPatternsView = {
  cards: PatternCard[];
  /** How many cards are showing a pattern rather than a safety prompt. */
  patternCount: number;
  /** How many were withheld by the red flag system. */
  suppressedCount: number;
  /** How many active definitions were read, so an empty section can say why it is empty. */
  activeRelationshipCount: number;
};
