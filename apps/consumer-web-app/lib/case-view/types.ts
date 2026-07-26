/**
 * Case View — presentation-only types over data the correlation engine,
 * driver-state engine, and goal-selection history already produce. See
 * ./build.ts for the pure assembly functions and ./data.ts for the I/O
 * layer. Nothing here computes a correlation, a trend, or a driver
 * state — it only reads and formats what already exists.
 */

import type { DriverState } from '../driver-library/types';
import type { CorrelationLag } from '../correlation-engine/types';

export type CaseHeader = {
  /** Titles the view. Verbatim, quoted text when isVerbatimQuote is true — never rewritten or normalized. */
  title: string;
  isVerbatimQuote: boolean;
  primaryGoalKey: string | null;
  allGoalKeys: string[];
};

export type DriverCaseView = {
  driverId: string;
  label: string;
  domainLabel: string;
  state: DriverState;
};

/** Grouped exactly per requirement 2 — ruled-out items are never dropped, only grouped. */
export type InvestigationPanelView = {
  beingLookedAt: DriverCaseView[];
  ruledOut: DriverCaseView[];
  likelyInvolved: DriverCaseView[];
  /** Goal-relevant drivers with no candidate pair mapped to any daily-loggable source at all — never labeled "being looked at," since no investigation is actually possible yet. Part of the honest empty-state disclosure (requirement 6). */
  notYetTrackable: DriverCaseView[];
};

export type SeriesPoint = { date: string; value: number };

export type OverlaySeries = {
  outcomeLabel: string;
  driverLabel: string;
  outcomePoints: SeriesPoint[];
  /** Already shifted forward by lagOffsetDays when lag is 'next_day', so plotting both at face value aligns them visually. */
  driverPoints: SeriesPoint[];
  lagOffsetDays: 0 | 1;
  lagNote: string | null;
};

export type FindingView = {
  pairKey: string;
  label: string;
  tier: 1 | 2 | 3;
  tierLabel: string;
  memberSentence: string;
  coachSentence: string;
  direction: 'positive' | 'negative' | null;
  lag: CorrelationLag | null;
  rho: number | null;
  confidence: number;
  observationCount: number;
  spanDays: number | null;
  splitWindowAgreement: boolean;
  computedAt: string;
  /** Only true at tier >= 2 ("repeated signal" or above) — requirement 4. */
  showOverlay: boolean;
  overlay: OverlaySeries | null;
};

export type GoalProgressPoint = { date: string; rating: number };

export type GoalProgressView = {
  points: GoalProgressPoint[];
  /** Whether the case view should show the "how's this going" prompt right now. */
  promptDue: boolean;
  /** Built from her own wording (case header logic), never generic. */
  promptText: string;
};

export type EvidenceProgressRow = {
  pairKey: string;
  label: string;
  observationCount: number;
  spanDays: number;
  neededObservations: number;
  neededSpanDays: number;
};

export type CaseEmptyStateView = {
  checkinCount: number;
  daysSinceFirstCheckin: number | null;
  /** Every goal-relevant pair with zero earned findings yet, and how close it is to clearing the evidence gate — never a fabricated finding, just honest progress. */
  stillGathering: EvidenceProgressRow[];
};

export type CaseView = {
  header: CaseHeader;
  goalProgress: GoalProgressView;
  investigation: InvestigationPanelView;
  /** Only findings that have earned a real tier (never 'insufficient_data') — requirement 3. */
  findings: FindingView[];
  /** Present whenever there are zero earned findings — requirement 6's "most important screen," not a fallback bolted on afterward. */
  emptyState: CaseEmptyStateView | null;
};
