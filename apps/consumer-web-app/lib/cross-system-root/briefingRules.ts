/**
 * THE COACH BRIEFING'S RULES, IN ONE FILE. Pure: no clock, no query, no
 * sentence, and nothing that could call out to a model.
 *
 * Same idea as lib/cross-system-signals/questionnaireRules.ts, which pins
 * every number the survey rule uses. Every decision the briefing makes
 * about ORDER and CHANGE lives here and nowhere else, so the builder
 * (./briefing.ts), the review store (./briefingData.ts) and the tests can
 * never disagree about what "ranked first" or "changed" means.
 *
 * WHAT THE BRIEFING IS NOT. It is not a second matching engine. Every card
 * is built from the rows the survey rule already judged and the map entries
 * the existing lookup (./lookup.ts) already surfaced. Nothing here decides
 * whether an answer is active, which map entry fires, or what an area
 * holds; it only decides the order a coach reads those answers in, and
 * whether they moved since she last looked.
 *
 * ---------------------------------------------------------------------
 * RANKING, in this order and only this order:
 *
 *   0. SAFETY IS NEVER RANKED. A card with a red flagged row, or one whose
 *      map entry the existing override withheld, leaves the ranked list
 *      entirely and is drawn in its own block above the briefing.
 *   1. MEANINGFUL CHANGE FIRST. A card whose reported answer went UP the
 *      frequency scale since the comparable earlier answer to the same
 *      question (or canonical signal), or newly crossed into active, ranks
 *      above every card that did not. Needs comparable history: on her
 *      first completed survey nothing can be compared, every card is
 *      "First recorded", and this rule falls through to rule 2 for all of
 *      them.
 *   2. FREQUENCY. The loudest reported answer on the card (Almost always
 *      above Often above Sometimes). A report with no frequency word (a
 *      sentence she wrote) ranks as the lowest active frequency, never
 *      louder than an answer that says how often.
 *   3. SUPPORTING EVIDENCE. The count of DISTINCT canonical signals behind
 *      the card, other than the one it is anchored on. The Signal Library
 *      already merges one symptom from several instruments onto one
 *      canonical signal, and this counts signals, never rows, so the same
 *      answer repeated across questionnaires cannot inflate a card.
 *   4. SOURCE COUNT, as a tie breaker only.
 *   5. Then the anchor's name, then the target key, so a tie is always
 *      broken the same way.
 *
 * A pinned card ("Discuss next session") is drawn in its own section,
 * above the priority cards, and never takes one of their slots. The pinned
 * section is ordered by the same rules.
 *
 * ---------------------------------------------------------------------
 * MATERIAL CHANGE, the one definition the review actions use:
 *
 *   a. a frequency shift in either direction on a reported signal;
 *   b. a new supporting canonical signal;
 *   c. a signal crossing the active threshold, either way (a reported
 *      signal going active or inactive, or a supporting signal arriving or
 *      leaving).
 *
 * A retake with the same answers is not a material change, so a card a
 * coach reviewed stays reviewed across it.
 */

import type { SignalRecord } from '@/lib/cross-system-signals/types';
import type { StandardizedSignalName } from '@/lib/cross-system-signals/types';
import { ACTIVE_MIN_POINTS, SUPPORTABLE_MIN_POINTS } from '@/lib/cross-system-signals/questionnaireRules';

/** The most priority cards the briefing shows before "View all findings". A limit, not a target. */
export const BRIEFING_CARD_LIMIT = 3;

/** The most related findings one card lists. */
export const RELATED_FINDINGS_LIMIT = 3;

/** The most "Explore next" questions one card carries. */
export const EXPLORE_NEXT_LIMIT = 2;

/**
 * What a report with no frequency word ranks as: the lowest active
 * frequency on the survey's own scale (Sometimes).
 */
export const UNSCALED_REPORT_RANK_POINTS = SUPPORTABLE_MIN_POINTS;

/**
 * SECTION SCORES ARE NEVER A RELATED FINDING. A related finding is a
 * question level answer or a classified signal; these value kinds are an
 * instrument's rollup of many answers, and may appear inside View evidence
 * as context only.
 */
export const ROLLUP_VALUE_KINDS: ReadonlySet<SignalRecord['valueKind']> = new Set([
  'band',
  'percent',
  'score',
]);

/**
 * WHICH FIRED ENTRIES MAY LEND A RELATED FINDING.
 *
 * An association fires FOR A SYMPTOM when its primary names that canonical
 * signal. The map also carries broad entries keyed on a whole category or
 * body area ("Mood findings, body areas worth reviewing in return"), which
 * fire for every symptom in it; left in, the same broad stress, digestion
 * and sleep findings would repeat on every card. So related findings come
 * from the entries whose primary names one of the card's reported signals,
 * and only a card that reached no such entry falls back to every entry it
 * fired. Every fired entry, broad or specific, stays in View evidence.
 */
export function relatedFindingEntries<T extends { version: { components: ReadonlyArray<{ role: string; refKind: string; refKey: string }> } }>(
  fired: readonly T[],
  reportedSlugs: ReadonlySet<string>
): T[] {
  const specific = fired.filter((entry) =>
    entry.version.components.some(
      (component) =>
        component.role === 'primary' && component.refKind === 'signal' && reportedSlugs.has(component.refKey)
    )
  );
  return specific.length > 0 ? specific : [...fired];
}

/** True for a row that is a rollup of many answers rather than one answer. */
export function isRollupRow(record: Pick<SignalRecord, 'valueKind'>): boolean {
  return ROLLUP_VALUE_KINDS.has(record.valueKind);
}

/**
 * THE WINDOW EACH INSTRUMENT ASKS ABOUT, as the member was told it.
 *
 * The Body Systems Survey asks her to "Answer for the last 3 months"
 * (migration 221, member.intro_line_3 and member.timeframe_reminder), so an
 * answer submitted Sep 16 covers the three months before it. A source with
 * no stated window prints its date alone. Recency tiers inside the engine
 * still key off the submission day; only the words change.
 * tests/root-briefing.test.ts reads migration 221 to hold this to it.
 */
export const REPORTING_WINDOWS: Readonly<Record<string, string>> = {
  body_systems_survey: 'past 3 months',
};

/**
 * WHICH REPORTED SIGNALS ARE ONE COMPLAINT.
 *
 * Two canonical signals with the same body area AND the same symptom type
 * in the Signal Library ("Headaches" and "Headaches when not eaten" are
 * both head, pain) share a primary complaint and are one card. A signal
 * missing either default is its own card. Read from the library's own
 * canonical defaults, never from a row, so a question that files a
 * narrower area cannot split a complaint in two.
 */
export function groupKeyFor(
  slug: string,
  names: ReadonlyMap<string, StandardizedSignalName>
): string {
  const name = names.get(slug);
  if (name?.defaultBodyAreaKey && name.defaultSymptomKey) {
    return `group:${name.defaultBodyAreaKey}:${name.defaultSymptomKey}`;
  }
  return `signal:${slug}`;
}

/** The points a live answer ranks at. */
export function rankPoints(record: Pick<SignalRecord, 'valueKind' | 'valueNumeric'>): number {
  if (record.valueKind === 'scale' && record.valueNumeric !== null) return record.valueNumeric;
  return UNSCALED_REPORT_RANK_POINTS;
}

/** True when a scale answer's points alone make it active. */
export function pointsAlwaysActive(points: number): boolean {
  return points >= ACTIVE_MIN_POINTS;
}

// ---------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------

/** Everything the ranking reads about one card. Numbers and keys only. */
export type RankFacts = {
  targetKey: string;
  anchorName: string;
  /** Rule 1: went up the scale, or newly crossed into active, against comparable history. */
  meaningfulChange: boolean;
  /** Rule 2: the loudest reported answer's rank points. */
  frequencyPoints: number;
  /** Rule 3: distinct canonical signals behind the card, other than its anchor. */
  supportingSignalCount: number;
  /** Rule 4: distinct sources behind the card. Tie breaker only. */
  sourceCount: number;
  /** A coach's own pin. Not a ranking rule: a pinned card is drawn in its own section. */
  pinned: boolean;
};

/** The rules in the order they are applied, named so a note can say which one placed a card. */
export const RANKING_RULES = [
  'meaningful_change',
  'frequency',
  'supporting_signals',
  'source_count',
] as const;

export type RankingRule = (typeof RANKING_RULES)[number];

/** The rule that decided a against b, or null when only the final name tie break did. */
export function decidingRule(a: RankFacts, b: RankFacts): RankingRule | null {
  if (a.meaningfulChange !== b.meaningfulChange) return 'meaningful_change';
  if (a.frequencyPoints !== b.frequencyPoints) return 'frequency';
  if (a.supportingSignalCount !== b.supportingSignalCount) return 'supporting_signals';
  if (a.sourceCount !== b.sourceCount) return 'source_count';
  return null;
}

/** Negative when a ranks above b. Safety cards never reach this function. */
export function compareByRank(a: RankFacts, b: RankFacts): number {
  if (a.meaningfulChange !== b.meaningfulChange) return a.meaningfulChange ? -1 : 1;
  if (a.frequencyPoints !== b.frequencyPoints) return b.frequencyPoints - a.frequencyPoints;
  if (a.supportingSignalCount !== b.supportingSignalCount) {
    return b.supportingSignalCount - a.supportingSignalCount;
  }
  if (a.sourceCount !== b.sourceCount) return b.sourceCount - a.sourceCount;
  const byName = a.anchorName.localeCompare(b.anchorName);
  if (byName !== 0) return byName;
  return a.targetKey.localeCompare(b.targetKey);
}

// ---------------------------------------------------------------------
// Material change
// ---------------------------------------------------------------------

/**
 * THE EVIDENCE STATE A REVIEW IS RECORDED AT. Stored whole beside the
 * review, so "has anything material changed since" is a comparison of two
 * of these and never a guess.
 *
 * No date is in it on purpose: a retake that repeats the same answers is
 * the same evidence state.
 */
export type BriefingEvidenceState = {
  version: 1;
  /** Reported canonical signals, by slug: the loudest live answer's points (null with no frequency word), and whether it is active. */
  reported: Record<string, { points: number | null; active: boolean }>;
  /** Supporting canonical signals, by slug, sorted. */
  supporting: string[];
};

export const EMPTY_EVIDENCE_STATE: BriefingEvidenceState = { version: 1, reported: {}, supporting: [] };

/** The one definition of material change. See the header. */
export function isMaterialChange(
  before: BriefingEvidenceState,
  after: BriefingEvidenceState
): boolean {
  const slugs = new Set([...Object.keys(before.reported), ...Object.keys(after.reported)]);
  for (const slug of slugs) {
    const was = before.reported[slug];
    const now = after.reported[slug];
    // (c) crossing the threshold: present on one side and not the other,
    // or present on both with a different verdict.
    if (!was || !now) {
      if ((was?.active ?? false) !== (now?.active ?? false)) return true;
      continue;
    }
    if (was.active !== now.active) return true;
    // (a) a frequency shift, either direction.
    if (was.points !== now.points) return true;
  }
  const beforeSupport = new Set(before.supporting);
  const afterSupport = new Set(after.supporting);
  // (b) a new supporting signal, and (c) one leaving.
  for (const slug of afterSupport) if (!beforeSupport.has(slug)) return true;
  for (const slug of beforeSupport) if (!afterSupport.has(slug)) return true;
  return false;
}

/** A stable string for one evidence state. Equal states give equal strings. */
export function evidenceFingerprint(state: BriefingEvidenceState): string {
  const reported = Object.keys(state.reported)
    .sort()
    .map((slug) => {
      const entry = state.reported[slug]!;
      return `${slug}=${entry.points ?? 'x'}:${entry.active ? 1 : 0}`;
    })
    .join(',');
  return `v${state.version}|r:${reported}|s:${[...state.supporting].sort().join(',')}`;
}

/** Reads a stored state back, refusing anything that is not one. */
export function parseEvidenceState(value: unknown): BriefingEvidenceState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return null;
  if (!raw.reported || typeof raw.reported !== 'object') return null;
  if (!Array.isArray(raw.supporting)) return null;
  const reported: BriefingEvidenceState['reported'] = {};
  for (const [slug, entry] of Object.entries(raw.reported as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') return null;
    const item = entry as Record<string, unknown>;
    const points = item.points;
    if (points !== null && typeof points !== 'number') return null;
    reported[slug] = { points: points as number | null, active: item.active === true };
  }
  return {
    version: 1,
    reported,
    supporting: (raw.supporting as unknown[]).filter((slug): slug is string => typeof slug === 'string'),
  };
}

// ---------------------------------------------------------------------
// Review actions
// ---------------------------------------------------------------------

/** The three things a coach can do with a card. None of them deletes or hides evidence. */
export const BRIEFING_REVIEW_ACTIONS = ['discuss_next_session', 'reviewed', 'not_relevant'] as const;
export type BriefingReviewAction = (typeof BRIEFING_REVIEW_ACTIONS)[number];

export function isBriefingReviewAction(value: unknown): value is BriefingReviewAction {
  return typeof value === 'string' && (BRIEFING_REVIEW_ACTIONS as readonly string[]).includes(value);
}

/** Where one card stands for one coach. */
export type BriefingReviewStatus =
  /** No action, or its evidence changed materially since the last one. */
  | 'open'
  /** "Discuss next session", until she acts on it again. */
  | 'pinned'
  /** "Reviewed" or "Not relevant" at the evidence state it still has. */
  | 'dismissed';

/**
 * The latest action on a card and the evidence it was taken at, against
 * the card's evidence now.
 *
 * DISMISSAL HOLDS AT ONE EVIDENCE STATE ONLY. Reviewing once never hides a
 * later change: a material change returns the card to the briefing, and
 * `changedSinceReview` is what marks it.
 */
export function reviewStatusOf(
  latest: { action: BriefingReviewAction; state: BriefingEvidenceState | null } | null,
  now: BriefingEvidenceState
): { status: BriefingReviewStatus; changedSinceReview: boolean } {
  if (!latest) return { status: 'open', changedSinceReview: false };
  // A stored state that cannot be read is treated as different, which is
  // the direction that shows a card rather than hiding one.
  const changed = latest.state === null ? true : isMaterialChange(latest.state, now);
  if (latest.action === 'discuss_next_session') {
    return { status: 'pinned', changedSinceReview: changed };
  }
  return changed
    ? { status: 'open', changedSinceReview: true }
    : { status: 'dismissed', changedSinceReview: false };
}
