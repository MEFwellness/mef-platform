/**
 * Adaptive Coaching Direction — reading the signals the engine decides
 * between.
 *
 * Every function here is a READ of a system that already exists. Nothing
 * in this file computes a classification, a correlation, a tier, a
 * friction threshold, or a score. Where a judgement is needed, the system
 * that owns that judgement makes it and this file reads the answer.
 *
 *   safety     lib/safety (migration 28). Two tables, both member-readable
 *              under existing RLS, and the classifier's own
 *              coach_review_required flag is what decides severity.
 *   tier 3     lib/case-view/findings.ts's buildFindings over
 *              member_pattern_states, which already applies the three-tier
 *              language module's own tier rules.
 *   friction   lib/analytics-service/friction.ts's getMemberFrictionSignals,
 *              whose thresholds and evidence-sufficiency grading are its
 *              own and are not restated here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getMemberFrictionSignals } from '../analytics-service/friction';
import type { FrictionSignal } from '../analytics-service/types';
import { getSupabaseEnv } from '../supabase/env';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type {
  BehavioralFrictionInput,
  QualifiedPatternInput,
  SafetyFlagInput,
} from '../priority/types';
import type { FindingView } from '../case-view/types';
import { countRecentSavedPriorities } from './data';

// ---------------------------------------------------------------------
// Rule 1 — an unresolved safety flag from a check-in.
// ---------------------------------------------------------------------

/**
 * WHAT "UNRESOLVED" MEANS, stated once, in the safety system's own terms.
 *
 * A classification is in play when all three are true:
 *   1. it came from a daily check-in (source_feature 'daily_checkin'),
 *   2. the classifier set coach_review_required, which is exactly the set
 *      of categories serious enough to open a Coach Review Queue entry,
 *   3. no acknowledgment for it has been recorded as 'acknowledged'.
 *
 * Every coach_review_required category also sets acknowledgment_required,
 * so an acknowledgment row always exists in 'pending' for these. The state
 * therefore has a real exit that the member herself can take, and cannot
 * get stuck indefinitely on a card she has no way to clear.
 *
 * The engine reads safety_classifications rather than safety_review_queue
 * on purpose, and this is worth recording because it looks like the wrong
 * table at first glance: the review queue is the coach's surface and RLS
 * (migration 28) grants a member no read on it at all. The classification
 * and its acknowledgment are the member-side half of the same event, and
 * they are what a member session can honestly see.
 *
 * NOTHING about the concern is returned. Not the level, not the urgency,
 * not the categories, not her words. Only the row id, so the coach path
 * can point at the real record.
 */
export async function loadUnresolvedSafetyFlag(
  supabase: SupabaseClient,
  memberId: string
): Promise<SafetyFlagInput | null> {
  const { data, error } = await supabase
    .from('safety_classifications')
    .select('id')
    .eq('member_id', memberId)
    .eq('source_feature', 'daily_checkin')
    .eq('coach_review_required', true)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) {
    if (error) console.error('loadUnresolvedSafetyFlag failed', error);
    return null;
  }

  const ids = (data as { id: string }[]).map((row) => row.id);

  const { data: acknowledged, error: ackError } = await supabase
    .from('safety_acknowledgments')
    .select('classification_id')
    .eq('member_id', memberId)
    .eq('status', 'acknowledged')
    .in('classification_id', ids);

  if (ackError) {
    // Fail closed toward showing the safety card. An acknowledgment read
    // that failed is not evidence that she acknowledged anything, and the
    // cost of asking someone to take a gentle day twice is far lower than
    // the cost of missing an unresolved concern.
    console.error('loadUnresolvedSafetyFlag acknowledgment read failed', ackError);
    return { safetyClassificationId: ids[0]! };
  }

  const resolved = new Set(
    ((acknowledged ?? []) as { classification_id: string }[]).map((row) => row.classification_id)
  );

  const unresolved = ids.find((id) => !resolved.has(id));
  return unresolved ? { safetyClassificationId: unresolved } : null;
}

// ---------------------------------------------------------------------
// Rule 4's second half — a tier 3 qualified pattern.
// ---------------------------------------------------------------------

/**
 * The strongest tier 3 finding among her goal-relevant earned findings, or
 * null.
 *
 * Takes the findings the caller already built rather than rebuilding them:
 * lib/priority/service.ts's rule 2 loader already runs buildFindings over
 * the same member_pattern_states rows, and computing them twice in one
 * render would be both slower and a second opportunity to disagree.
 *
 * Tier 3 only. Tier is decided by lib/longitudinal-intelligence/copy.ts's
 * own rules and is never re-derived here; this filter simply declines to
 * make a priority out of anything the language module was not willing to
 * state confidently.
 */
export const QUALIFIED_PATTERN_MIN_TIER = 3;

export function selectQualifiedPattern(
  findings: readonly FindingView[]
): QualifiedPatternInput | null {
  const winner = findings
    .filter((finding) => finding.tier >= QUALIFIED_PATTERN_MIN_TIER)
    .filter((finding) => finding.memberSentence.trim().length > 0)
    .sort((a, b) => b.confidence - a.confidence || b.observationCount - a.observationCount)[0];

  if (!winner) return null;

  return {
    pairKey: winner.pairKey,
    label: winner.label,
    memberSentence: winner.memberSentence,
    confidence: winner.confidence,
    observationCount: winner.observationCount,
  };
}

/**
 * The findings that are GENUINELY TIED with the winner, excluding the
 * winner itself.
 *
 * "Tied" means identical on both of the two keys `selectQualifiedPattern`
 * sorts by: confidence and observation count. Two findings equal on both are
 * indistinguishable to the hierarchy, so which of them rule 3 shows was
 * previously decided by array order and nothing else. That is exactly the
 * "otherwise equal in the hierarchy" case the Weekly Root Review's week
 * focus is allowed to break (lib/weekly-review/focus.ts).
 *
 * A finding that is merely CLOSE is not tied and is not returned. Treating
 * near-equal as equal would let a weekly preference override a real
 * strength difference, which would be the focus changing the hierarchy
 * rather than breaking a tie in it.
 */
export function selectQualifiedPatternTies(
  findings: readonly FindingView[]
): QualifiedPatternInput[] {
  const winner = selectQualifiedPattern(findings);
  if (!winner) return [];

  return findings
    .filter((finding) => finding.tier >= QUALIFIED_PATTERN_MIN_TIER)
    .filter((finding) => finding.memberSentence.trim().length > 0)
    .filter((finding) => finding.pairKey !== winner.pairKey)
    .filter(
      (finding) =>
        finding.confidence === winner.confidence &&
        finding.observationCount === winner.observationCount
    )
    .map((finding) => ({
      pairKey: finding.pairKey,
      label: finding.label,
      memberSentence: finding.memberSentence,
      confidence: finding.confidence,
      observationCount: finding.observationCount,
    }));
}

// ---------------------------------------------------------------------
// Rule 5 — behavioral friction.
// ---------------------------------------------------------------------

/** How far back "she keeps setting the priority aside" looks. */
export const SAVE_FOR_LATER_WINDOW_DAYS = 14;

/** Saved priorities in that window before it is chronic rather than a busy week. */
export const SAVE_FOR_LATER_MINIMUM = 3;

/**
 * The friction signals service runs behind analytics_assert_admin, which a
 * member's own session cannot pass, so this build reads it through a
 * service-role client.
 *
 * That is not a workaround. Migration 149's own authorization comment names
 * this case explicitly: "a service-role connection (the app's own cron
 * routes, and later the Engagement Agent) is already trusted
 * infrastructure". The functions are SECURITY INVOKER, and the client
 * built here is scoped to a single member id passed in by the caller,
 * which the caller only ever obtains from the authenticated session.
 *
 * Returns null when the key is absent (local development, and the test
 * environment) rather than throwing. Rule 5 then simply does not fire and
 * the ladder carries on, which is the correct degradation: a missing
 * analytics credential must never cost a member her card.
 */
function frictionClient(): SupabaseClient | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  try {
    const { url } = getSupabaseEnv();
    return createSupabaseClient(url, serviceRoleKey);
  } catch (error) {
    console.error('frictionClient failed to build', error);
    return null;
  }
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * The Daily Reset, started and repeatedly not finished.
 *
 * Reads the friction service's own repeated_incomplete_flow signal and
 * checks only that it is about the daily_reset flow. The thresholds that
 * decided it was a pattern (three starts minimum, under 50 percent
 * completion) are that service's and are not restated here.
 */
function dailyResetFriction(signals: readonly FrictionSignal[]): BehavioralFrictionInput | null {
  const signal = signals.find(
    (candidate) =>
      candidate.type === 'repeated_incomplete_flow' &&
      readString(candidate.evidence.flowKey) === 'daily_reset'
  );
  if (!signal) return null;

  return {
    kind: 'daily_reset_incomplete',
    signalType: signal.type,
    starts: readNumber(signal.evidence.startedEvents),
    completions: readNumber(signal.evidence.completedEvents),
    completionRate: readNumber(signal.evidence.completionRate),
    savedCount: null,
    windowDays: null,
    evidenceSufficiency: signal.evidenceSufficiency,
  };
}

/**
 * Food and protein logging that has gone quiet.
 *
 * Two of the service's signals count, because they are the same behavior
 * observed from two directions: a feature whose use declined against her
 * own baseline, and a feature she opened once and never went back to.
 */
const FOOD_FEATURE_KEYS = new Set(['food_logging', 'food_scan', 'food_lens']);

function foodLoggingFriction(signals: readonly FrictionSignal[]): BehavioralFrictionInput | null {
  const signal = signals.find(
    (candidate) =>
      (candidate.type === 'feature_use_declined' ||
        candidate.type === 'opened_once_not_revisited') &&
      FOOD_FEATURE_KEYS.has(readString(candidate.evidence.featureKey) ?? '')
  );
  if (!signal) return null;

  return {
    kind: 'food_logging_lapsed',
    signalType: signal.type,
    starts: null,
    completions: null,
    completionRate: null,
    savedCount: null,
    windowDays: null,
    evidenceSufficiency: signal.evidenceSufficiency,
  };
}

/**
 * The strongest friction signal in play, or null.
 *
 * The order is the order of what Root can actually do something about.
 * The Daily Reset is the product's core loop and its friction has the
 * smallest possible easier version, so it comes first. Chronic
 * save-for-later comes last because it is the least specific: it says the
 * card is not landing, not which behavior is stuck.
 */
export async function loadBehavioralFriction(
  supabase: SupabaseClient,
  memberId: string,
  todayLocalDate: string
): Promise<BehavioralFrictionInput | null> {
  const savedCount = await countRecentSavedPriorities(
    supabase,
    memberId,
    todayLocalDate,
    SAVE_FOR_LATER_WINDOW_DAYS
  );

  const analytics = frictionClient();
  if (analytics) {
    try {
      // includeTestAccounts is deliberately true. That flag exists so a
      // dashboard's numbers are not polluted by staff accounts; here it
      // would silently switch rule 5 off for exactly the accounts this
      // feature is verified on, and a test member is still a member who
      // deserves the easier version of a thing she is stuck on.
      const report = await getMemberFrictionSignals(analytics, memberId, {
        today: todayLocalDate,
        includeTestAccounts: true,
      });

      const fromService =
        dailyResetFriction(report.signals) ?? foodLoggingFriction(report.signals);
      if (fromService) return fromService;
    } catch (error) {
      // Best effort, exactly like every other input to this hierarchy. A
      // failed analytics read means rule 5 declines, never that the card
      // fails to render.
      console.error('loadBehavioralFriction analytics read failed', error);
    }
  }

  if (savedCount >= SAVE_FOR_LATER_MINIMUM) {
    return {
      kind: 'chronic_save_for_later',
      signalType: null,
      starts: null,
      completions: null,
      completionRate: null,
      savedCount,
      windowDays: SAVE_FOR_LATER_WINDOW_DAYS,
      evidenceSufficiency: null,
    };
  }

  return null;
}
