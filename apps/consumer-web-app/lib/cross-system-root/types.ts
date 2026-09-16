/**
 * Every shape the complaint-driven lookup works in.
 *
 * NOTHING HERE IS A CONCLUSION, and the field names are the proof. An area
 * carries a vocabulary key, a label the coach wrote, a state, and the
 * exact rows that put it in that state. There is no cause field, no
 * condition field, no confidence, no severity and no score, and there is
 * no combined number anywhere: the counts below are counts of HER ROWS,
 * never added together into an index and never given an adjective.
 *
 * THE FINDING IS THE RECEIPT, NOT THE CLAIM. It names the complaint it came
 * from, the map entry and the exact version of it that was read, the areas
 * that version told Root to look at, and what was in each one. Every
 * sentence a coach then reads about what it may mean is her own stored
 * wording, carried through unchanged from that version.
 */

import type { SignalRecord } from '@/lib/cross-system-signals/types';
import type {
  RelationshipComponent,
  RelationshipHead,
  RelationshipVersion,
} from '@/lib/cross-system-relationships/types';
import type { ComplaintClassificationRecord, ComplaintReportRecord } from '@/lib/cross-system-complaints/types';
import type { EvidenceState } from './evidence';

/** One area the map sent Root to look at, and what was there. */
export type FindingArea = {
  refKind: RelationshipComponent['refKind'];
  refKey: string;
  /** The label as the coach wrote it on the day. */
  refLabel: string;
  role: RelationshipComponent['role'];
  position: number;
  /** The worst-case state across the rows found here, or not_observed. */
  state: EvidenceState;
  /** The rows behind it, each with its own state, so the card can separate current from historical. */
  rows: Array<{ record: SignalRecord; state: EvidenceState }>;
};

/**
 * One complaint, read against one map entry.
 *
 * `surfaced` is the one flag every reader checks. False means no
 * classification of this complaint matched this entry's primary, so the
 * entry has nothing to say about it and NOTHING may be drawn.
 */
export type RootFindingDraft = {
  head: RelationshipHead;
  version: RelationshipVersion;

  surfaced: boolean;

  /** The classified signals of this complaint that matched the entry's primary. */
  triggerRecords: SignalRecord[];

  areas: FindingArea[];

  /** Counts of HER ROWS, never combined and never scored. */
  currentCount: number;
  historicalCount: number;
  notObservedCount: number;

  /** True when the existing red-flag layer fired on a contributing row. */
  safetyWithheld: boolean;
  /** The signals carrying the safety response, named so a coach knows where to look. */
  withheldSignalNames: string[];
};

/** One complaint and every map entry it triggered. */
export type ComplaintLookup = {
  report: ComplaintReportRecord;
  classifications: ComplaintClassificationRecord[];
  findings: RootFindingDraft[];
};

/**
 * SYSTEM CONVERGENCE. One area that several different complaints all
 * pointed at.
 *
 * It is counted rather than concluded from: the line a coach reads says
 * how many of her current findings overlap with this area of the map, and
 * it never says that the overlap proves anything about that area.
 */
export type ConvergentArea = {
  refKind: RelationshipComponent['refKind'];
  refKey: string;
  refLabel: string;
  /** How many separate findings sent Root to this same area. */
  findingCount: number;
  /** How many of her rows sit under it in a live state. */
  liveRowCount: number;
  /** The complaints that led here, by their own reported wording. */
  fromComplaints: string[];
};
