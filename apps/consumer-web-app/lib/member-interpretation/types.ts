/**
 * Member Interpretation Layer — the vocabulary.
 *
 * One canonical set of findings per member. Every surface that used to
 * compute its own verdict from raw data now reads this instead. Raw data
 * flows IN to this layer; verdicts flow OUT of it, and only out of it.
 *
 * The layer is a computed projection, not a new table. The stored facts it
 * reads (registry_entries, daily_checkins_current, coach confirmation)
 * already exist and are already owned by systems that shipped before this.
 * Nothing here invents a finding; it decides what the findings that exist
 * mean, once, in one place.
 */

import type { RegistryEntrySeverity } from '@mef/shared-types-contracts';
import type { CoachingDomain } from '../investigation-engine/domains';

/**
 * The four evidence tiers. There are four, they are ordered, and the order
 * is the whole point: a tier can rise, and the only two things that may
 * raise it are member-provided evidence and a coach saying so.
 *
 *   early_indication      one answer, one assessment result, or a few days
 *   emerging_pattern      the same signal, more than once
 *   supported_by_checkins recurred across enough logged days to rely on
 *   coach_verified        a coach confirmed it
 */
export type EvidenceTier =
  | 'early_indication'
  | 'emerging_pattern'
  | 'supported_by_checkins'
  | 'coach_verified';

export const TIER_ORDER: readonly EvidenceTier[] = [
  'early_indication',
  'emerging_pattern',
  'supported_by_checkins',
  'coach_verified',
] as const;

export function tierRank(tier: EvidenceTier): number {
  return TIER_ORDER.indexOf(tier);
}

/**
 * WHERE a piece of evidence came from. This is the structural half of the
 * "background runs can never raise a tier" rule: the kinds below split
 * cleanly into evidence the member produced, evidence a coach produced,
 * and everything a computation produced on its own, and only the first two
 * are ever counted.
 *
 *   intake_answer          an answer she gave at intake or reassessment
 *   assessment_result      a result from an assessment she completed
 *   checkin_day            one day she logged a check-in touching this
 *   logged_data            something she logged outside a check-in
 *                          (a food entry, a movement session, a device sync)
 *   coach_input            a coach's own note or confirmation
 *   background_computation a correlation run, a nightly score, a cron. Real
 *                          and worth carrying as provenance, and it can
 *                          NEVER move a tier. This is the exact hole the
 *                          old HIGH CONFIDENCE bug came through: the score's
 *                          history term counted how many times the cron had
 *                          run, so after five days every member was maxed.
 */
export type EvidenceKind =
  | 'intake_answer'
  | 'assessment_result'
  | 'checkin_day'
  | 'logged_data'
  | 'coach_input'
  | 'background_computation';

/** The kinds the member herself produced. The only kinds that can raise a tier. */
export const MEMBER_PROVIDED_EVIDENCE_KINDS: ReadonlySet<EvidenceKind> = new Set<EvidenceKind>([
  'intake_answer',
  'assessment_result',
  'checkin_day',
  'logged_data',
]);

/**
 * Kinds that may never raise a tier, named as data rather than as the
 * absence of a name, so a test can assert the list rather than infer it.
 */
export const NON_RAISING_EVIDENCE_KINDS: ReadonlySet<EvidenceKind> = new Set<EvidenceKind>([
  'background_computation',
]);

/** One piece of evidence behind a finding. */
export type EvidenceItem = {
  kind: EvidenceKind;
  /** The underlying record's id, so a coach can always get back to the source. */
  ref: string;
  /** Plain-language description of the source, e.g. "your intake answer about sleep". */
  label: string;
  /** The member's own local date, when the source has one. Null when it genuinely has none. */
  localDate: string | null;
};

/**
 * What the layer concludes about one finding. Deliberately a small closed
 * set, and deliberately without a "steady" or "fine" value: a finding
 * exists because something was found, so "nothing here" is not one of the
 * things a finding can conclude. A domain with no findings says that
 * separately, as a domain state.
 */
export type FindingVerdict =
  | 'needs_attention'
  | 'worth_watching'
  | 'noted'
  | 'improving'
  | 'resolved';

/**
 * ONE canonical finding. One source answer produces exactly one of these,
 * no matter how many domains it is relevant to and no matter how many
 * screens show it.
 *
 * `id` is derived from the source, never from the surface, which is what
 * makes "the hip discomfort slider is one finding" a property of the data
 * rather than a promise made by each screen separately.
 */
export type CanonicalFinding = {
  /** `${registryDomain}::${code}`. Stable across days, surfaces and supersede chains. */
  id: string;
  /**
   * The dedup key: what answer, assessment or logged fact produced this.
   * Two rows with the same sourceKey are the same finding and are merged,
   * never listed twice.
   */
  sourceKey: string;
  /** Plain-language name. Never a raw enum, never an internal feature name. */
  label: string;
  /** The one statement of this finding a member reads. Already tier-appropriate. */
  statement: string;
  tier: EvidenceTier;
  tierLabel: string;
  /** Everything behind it, in the order it was produced. */
  evidence: EvidenceItem[];
  verdict: FindingVerdict;
  severity: RegistryEntrySeverity;
  /**
   * The ONE domain this finding is filed under.
   *
   * Null when no coaching domain honestly covers it. Several registry
   * domains (lab, immune, circulatory, renal, neurological, dermatological)
   * have no coaching domain to belong to, and inventing one so that every
   * finding has a home would put a finding on a Root Map card that has
   * nothing to do with it. A null-domain finding is still a real finding
   * and still appears in the member's own list; it simply appears on no
   * domain card.
   */
  primaryDomain: CoachingDomain | null;
  /** The primary domain's own display label, so a cross-referencing card can name where the finding actually lives. Null when it has no domain. */
  primaryDomainLabel: string | null;
  /** Other domains it is genuinely relevant to. It appears there as a cross-reference, never as a second finding. */
  alsoRelevantDomains: CoachingDomain[];
  /** "Also shown under Movement & Physical Capacity." Null when it belongs to one domain only. */
  crossReferenceNote: string | null;
  /** False for a coach-only finding. Member surfaces filter on this; coach surfaces do not. */
  memberVisible: boolean;
  /** The registry row this was built from, for coach drill-down and for the audit trail. */
  registryEntryId: string;
};

/**
 * What the layer concludes about one domain.
 *
 *   needs_attention      at least one finding asking for attention now
 *   worth_watching       at least one moderate finding
 *   acknowledged         findings exist, none of them urgent. This is the
 *                        floor a domain with any active finding can reach,
 *                        and it is why "Pain & Structural Integrity" can no
 *                        longer read "Looking steady" while listing two
 *                        active discomfort findings.
 *   nothing_flagged_yet  real logged days, nothing found in them
 *   too_early            fewer logged days than the layer will describe
 *   no_data_yet          zero logged days behind this domain
 *   not_covered          no assessment covers this domain at all yet
 *   paused_for_coach     an open safety review suppresses detail here
 */
export type DomainState =
  | 'needs_attention'
  | 'worth_watching'
  | 'acknowledged'
  | 'nothing_flagged_yet'
  | 'too_early'
  | 'no_data_yet'
  | 'not_covered'
  | 'paused_for_coach';

/** The set of domain states that are a reassuring verdict. An active finding may never produce one of these. */
export const QUIET_DOMAIN_STATES: ReadonlySet<DomainState> = new Set<DomainState>([
  'nothing_flagged_yet',
  'no_data_yet',
  'too_early',
]);

export type DomainInterpretation = {
  domain: CoachingDomain;
  label: string;
  state: DomainState;
  /** One plain sentence stating the state. Never "looking steady" over active findings. */
  statement: string;
  /** The highest tier of any finding filed here. Null when there are none. */
  tier: EvidenceTier | null;
  tierLabel: string | null;
  /** Findings whose PRIMARY domain is this one. Rendered in full. */
  findings: CanonicalFinding[];
  /** Findings primarily filed elsewhere that are relevant here. Rendered as one cross-reference line each, never as findings. */
  crossReferenced: CanonicalFinding[];
  /** Real distinct logged days behind this domain, or null when it has no trackable per-day source. */
  loggedDays: number | null;
  windowDays: number;
};

/**
 * The member's one current focus, and the one primary action attached to
 * it. Authored by the Priority Card decision engine (lib/priority/) and
 * nothing else, ever. Every surface that names a focus reads this.
 */
export type MemberFocus = {
  /** The priority's own title, verbatim from the engine. Never re-worded. */
  title: string;
  /** The engine's own reason line, or null when it has no honest one. */
  reason: string | null;
  /** Which rule produced it, for analytics and for the coach view. Never rendered to a member. */
  rule: string;
  /** Whether she has already done it today. */
  status: 'active' | 'done' | 'saved';
  href: string | null;
};

/**
 * Whether the layer has enough member-logged data to name a strength or a
 * problem at all. Below the floor every surface says it is early, in the
 * Case View voice, rather than ranking five thin averages.
 */
export type DataFloor = {
  loggedDays: number;
  requiredDays: number;
  met: boolean;
  /** The honest sentence to show when the floor is not met. */
  statement: string;
};

/** Everything the layer knows about one member, computed once per request. */
export type MemberInterpretation = {
  /** Every canonical finding, deduplicated. One source answer, one entry. */
  findings: CanonicalFinding[];
  /** All twelve coaching domains, each with exactly one state. */
  domains: DomainInterpretation[];
  focus: MemberFocus | null;
  dataFloor: DataFloor;
  /** True when an open safety review suppresses interpretation detail. */
  safetyGated: boolean;
  /** The member's own local date this was computed for. */
  localDate: string;
};
