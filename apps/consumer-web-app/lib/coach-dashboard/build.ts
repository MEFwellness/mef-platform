/**
 * The coach's member view — the one builder.
 *
 * The audit assessed the old client detail page against six questions and
 * found four of them missing or buried twenty panels down an eight-hundred
 * line page: what is improving, what needs attention, how reliable each
 * finding is, what she is working on, what may be getting in the way, and
 * what to ask next.
 *
 * This answers all six, in that order, from the layers that already exist.
 * It computes no verdicts of its own. Every finding, every tier and every
 * domain name comes from `getMemberInterpretation`'s coach-side twin, the
 * priority comes from the Priority Card engine, the friction answer comes
 * from her own ledger row in her own words, and "what her app contains"
 * comes from the Visibility Layer. That is what makes the coach's screen
 * and the member's screen incapable of disagreeing.
 *
 * Best effort throughout, the same posture both layers already take: a
 * failed read leaves a section empty and says so, rather than throwing a
 * render a coach is waiting on.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PriorityRule } from '../priority/types';
import { ALERT_TIER_LABEL, alertTier, sortByTier } from '../intelligence-engine/alertTiers';
import { listCoachingThreads } from '../coaching-direction/data';
import { FRICTION_OPTION_LABEL, isFrictionReason } from '../coaching-direction/friction';
import { buildMemberInterpretation } from '../member-interpretation/service';
import { tierLabel, tierMeaning } from '../member-interpretation/tiers';
import { TIER_ORDER, type CanonicalFinding, type EvidenceTier } from '../member-interpretation/types';
import { displayName } from '../naming/displayNames';
import { getDailyPriority } from '../priority/data';
import { buildMemberVisibility } from '../visibility/service';
import type {
  AskNextItem,
  CoachDashboard,
  DashboardAlert,
  DashboardFinding,
  FrictionAnswer,
  InTheWayItem,
  ReliabilityGroup,
  WorkingOn,
} from './types';

/**
 * Which rule chose today's priority, said plainly.
 *
 * A coach asking "why is she being shown this" deserves a sentence, not
 * `implicated_driver`. Exhaustive by type, so a new rung on the ladder is a
 * compile error here rather than a raw enum on a screen.
 */
const PRIORITY_RULE_LABEL: Record<PriorityRule, string> = {
  safety: 'A safety concern is open, so everything else is suspended',
  re_entry: 'She is coming back after a gap',
  reset_plan_commitment: 'It is what she committed to in her Reset Plan',
  implicated_driver: 'A driver her own data implicates',
  qualified_pattern: 'A pattern with enough behind it to act on',
  incomplete_action: 'Something she started and did not finish',
  behavioral_friction: 'Something she keeps getting stuck on',
  todays_focus: "Today's coaching focus",
  movement_session: 'A movement session is ready for her',
  daily_reset: 'Her Daily Reset',
  gentle_focus: 'Nothing specific came up, so this is the gentle fallback',
};

function priorityRuleLabel(rule: string): string {
  return PRIORITY_RULE_LABEL[rule as PriorityRule] ?? 'The coaching engine chose it';
}

/** One canonical finding, flattened for the coach's screen. */
function toDashboardFinding(finding: CanonicalFinding): DashboardFinding {
  return {
    sourceKey: finding.sourceKey,
    label: finding.label,
    statement: finding.statement,
    tier: finding.tier,
    tierLabel: finding.tierLabel,
    domainLabel: finding.primaryDomainLabel,
    coachOnly: !finding.memberVisible,
  };
}

/**
 * The shape both an unsaved draft and a persisted alert row satisfy.
 *
 * Deliberately structural rather than either concrete type: the coach page
 * reads persisted rows (snake_case columns), the engine produces drafts
 * (camelCase fields), and this screen genuinely does not care which it is
 * handed. Anything narrower would force one of the two callers to invent a
 * conversion that means nothing.
 */
export type CoachAlertInput = {
  alertType: string;
  alertKey: string;
  title: string;
  reason: string;
};

function toDashboardAlert(draft: CoachAlertInput): DashboardAlert {
  const tier = alertTier(draft.alertType);
  return {
    alertKey: draft.alertKey,
    tier,
    tierLabel: ALERT_TIER_LABEL[tier],
    kindLabel: displayName('coach_alert_type', draft.alertType, { fallback: 'Something to look at' }),
    title: draft.title,
    reason: draft.reason,
  };
}

/**
 * The friction question's answer, read straight from her own ledger row.
 *
 * `friction_note` is the one field on this whole screen that is HER WORDS
 * rather than the app's, and it is passed through untouched. Truncating it,
 * summarising it, or running it through any interpretation would defeat the
 * only reason the question was worth asking.
 */
async function fetchLatestFriction(
  supabase: SupabaseClient,
  memberId: string,
  threadKey: string | null
): Promise<FrictionAnswer | null> {
  const query = supabase
    .from('member_coaching_decisions')
    .select('thread_key, local_date, friction_reason, friction_note, friction_asked_at, friction_answered_at')
    .eq('member_id', memberId)
    .not('friction_asked_at', 'is', null)
    .order('friction_asked_at', { ascending: false })
    .limit(1);

  const { data, error } = threadKey ? await query.eq('thread_key', threadKey) : await query;

  // Expected before migration 166 exists, and expected for a member who has
  // never been asked. Neither is an error worth surfacing to a coach.
  if (error || !data || data.length === 0) return null;

  const row = data[0] as {
    local_date: string;
    friction_reason: string | null;
    friction_note: string | null;
    friction_answered_at: string | null;
  };

  if (!row.friction_answered_at) {
    return {
      reason: 'something_else',
      reasonLabel: 'She has not answered yet',
      note: null,
      localDate: row.local_date,
      unanswered: true,
    };
  }

  if (!isFrictionReason(row.friction_reason)) return null;

  return {
    reason: row.friction_reason,
    reasonLabel: FRICTION_OPTION_LABEL[row.friction_reason],
    note: row.friction_note,
    localDate: row.local_date,
    unanswered: false,
  };
}

/** Findings grouped by tier, strongest evidence first, empty tiers dropped. */
export function groupByReliability(findings: readonly DashboardFinding[]): ReliabilityGroup[] {
  return [...TIER_ORDER]
    .reverse()
    .map((tier: EvidenceTier) => ({
      tier,
      tierLabel: tierLabel(tier),
      meaning: tierMeaning(tier),
      findings: findings.filter((f) => f.tier === tier),
    }))
    .filter((group) => group.findings.length > 0);
}

/**
 * What to ask next, from real state and only from real state.
 *
 * Four sources, each one a fact that exists or does not: an unresolved
 * friction answer, a finding one confirmation away from coach verified, a
 * stalled priority, and a feature her rules revealed that she has never
 * opened. Nothing here is generated, and when none of the four is true the
 * list is empty, which is the honest answer and is rendered as one.
 */
export function buildAskNext(input: {
  friction: FrictionAnswer | null;
  findings: readonly DashboardFinding[];
  workingOn: WorkingOn | null;
  revealedUntouched: { label: string; revealedAt: string | null }[];
  safetyActive: boolean;
  firstName: string;
}): AskNextItem[] {
  const items: AskNextItem[] = [];

  // Safety comes first and is never a suggestion competing with the others.
  if (input.safetyActive) {
    items.push({
      key: 'open_safety_case',
      question: 'Start with the open safety case before anything else here.',
      because:
        'The safety system has something open for her, so coaching detail is paused on that topic for her too.',
      kind: 'open_safety_case',
    });
  }

  if (input.friction && !input.friction.unanswered) {
    items.push({
      key: 'friction',
      question: input.friction.note
        ? `She said "${input.friction.note}". Ask her what would make that easier.`
        : `She said ${input.friction.reasonLabel.toLowerCase()} got in the way. Ask what a version she could actually do looks like.`,
      because: `She answered the friction question on ${input.friction.localDate} and nothing has been said back to her about it.`,
      kind: 'unresolved_friction',
    });
  }

  // One confirmation away. `supported_by_checkins` is the highest tier the
  // app can reach on its own; the only thing above it is a coach saying so,
  // which is a thing only this coach can do.
  for (const finding of input.findings.filter((f) => f.tier === 'supported_by_checkins')) {
    items.push({
      key: `confirm:${finding.sourceKey}`,
      question: `Confirm with her: "${finding.label}". Does that match how it actually feels?`,
      because:
        'It has enough of her own check-ins behind it to be worth confirming, and your confirmation is the only thing that can raise it further.',
      kind: 'one_confirmation_away',
    });
  }

  if (input.workingOn && input.workingOn.consecutiveIgnored >= 2) {
    items.push({
      key: 'stalled',
      question: `Ask about "${input.workingOn.title}". It has not landed for ${input.workingOn.consecutiveIgnored} days running.`,
      because: `Root has already reworded this ${input.workingOn.approachChanges} time${input.workingOn.approachChanges === 1 ? '' : 's'} and it still is not landing.`,
      kind: 'stalled_priority',
    });
  }

  for (const feature of input.revealedUntouched.slice(0, 3)) {
    items.push({
      key: `untouched:${feature.label}`,
      question: `Ask whether she has noticed ${feature.label}. It is on her app and she has never opened it.`,
      because: 'Her own answers opened it, so something about it should be relevant to her.',
      kind: 'revealed_untouched',
    });
  }

  return items;
}

/**
 * The whole first screen, for one member.
 *
 * `coachAlerts` is passed in rather than fetched here because the client
 * detail page already fetches it for the panels underneath, and fetching
 * the same rows twice on one render is how two sections of one page start
 * disagreeing.
 */
export async function buildCoachDashboard(input: {
  supabase: SupabaseClient;
  memberId: string;
  firstName: string;
  localDate: string;
  coachAlerts: readonly CoachAlertInput[];
}): Promise<CoachDashboard> {
  const { supabase, memberId, firstName, localDate } = input;

  const [interpretation, visibilityResult, priority, threads] = await Promise.all([
    buildMemberInterpretation(supabase, memberId, localDate, { coachView: true }),
    buildMemberVisibility(supabase, memberId, localDate, { coachView: true }),
    getDailyPriority(supabase, memberId, localDate),
    listCoachingThreads(supabase, memberId),
  ]);

  const findings = interpretation.findings.map(toDashboardFinding);

  const improving = interpretation.findings
    .filter((f) => f.verdict === 'improving' || f.verdict === 'resolved')
    .map(toDashboardFinding);

  const needsAttention = interpretation.findings
    .filter((f) => f.verdict === 'needs_attention' || f.verdict === 'worth_watching')
    .map(toDashboardFinding);

  const alerts = sortByTier(input.coachAlerts).map(toDashboardAlert);
  const urgentAlerts = alerts.filter((a) => a.tier === 'urgent_safety');
  const routineAlerts = alerts.filter((a) => a.tier === 'routine_follow_up');

  // The thread behind today's priority, which is where the counters live.
  // A priority with no thread key is one of the fallback rungs and has no
  // history to be stalled about.
  const threadKey = priority?.priorityKey ? `${priority.rule}::${priority.priorityKey}` : null;
  const thread = threadKey ? threads.get(threadKey) : undefined;
  const friction = await fetchLatestFriction(supabase, memberId, threadKey);

  const workingOn: WorkingOn | null = priority
    ? {
        title: priority.title,
        help: priority.help && priority.help.trim().length > 0 ? priority.help : null,
        status: priority.status === 'done' ? 'done' : priority.status === 'saved' ? 'saved' : 'active',
        ruleLabel: priorityRuleLabel(priority.rule),
        consecutiveIgnored: thread?.consecutiveIgnored ?? 0,
        approachChanges: thread?.approachChanges ?? 0,
        friction,
      }
    : null;

  const inTheWay = buildInTheWay({
    friction,
    workingOn,
    escalatedThreads: [...threads.values()].filter((t) => t.coachEscalatedAt !== null).length,
    routineAlerts,
  });

  // Revealed by a rule, never touched. Grandfathered features are excluded
  // by definition: grandfathering means she HAS touched it.
  const revealedUntouched = visibilityResult.visibility.features
    .filter((f) => f.visible && f.source === 'rule' && !f.grandfathered && f.newlyRevealed)
    .map((f) => ({ label: f.label, revealedAt: f.revealedAt }));

  return {
    memberFirstName: firstName,
    localDate,
    safetyActive: visibilityResult.visibility.safetyActive || interpretation.safetyGated,
    improving,
    urgentAlerts,
    routineAlerts,
    needsAttention,
    reliability: groupByReliability(findings),
    workingOn,
    inTheWay,
    askNext: buildAskNext({
      friction,
      findings,
      workingOn,
      revealedUntouched,
      safetyActive: visibilityResult.visibility.safetyActive || interpretation.safetyGated,
      firstName,
    }),
    loggedDays: interpretation.dataFloor.loggedDays,
    loggedDaysWindow: interpretation.dataFloor.windowDays,
    dataFloorStatement: interpretation.dataFloor.met ? null : interpretation.dataFloor.statement,
  };
}

/**
 * What may be getting in the way.
 *
 * Deliberately short and deliberately sourced. Every item names where it
 * came from, because "what is getting in the way" is the section a coach is
 * most likely to repeat back to a member, and repeating back something the
 * app inferred as though she said it is the failure worth avoiding here.
 */
export function buildInTheWay(input: {
  friction: FrictionAnswer | null;
  workingOn: WorkingOn | null;
  escalatedThreads: number;
  routineAlerts: readonly DashboardAlert[];
}): InTheWayItem[] {
  const items: InTheWayItem[] = [];

  if (input.friction && !input.friction.unanswered) {
    items.push({
      key: 'friction_answer',
      statement: input.friction.note
        ? `She said ${input.friction.reasonLabel.toLowerCase()}, and wrote: "${input.friction.note}"`
        : `She said ${input.friction.reasonLabel.toLowerCase()}.`,
      source: 'her own answer',
    });
  }

  if (input.friction?.unanswered) {
    items.push({
      key: 'friction_unanswered',
      statement:
        'Root asked her what got in the way and she has not answered. That is a valid answer and nothing was assumed from it.',
      source: 'her own answer',
    });
  }

  if (input.workingOn && input.workingOn.consecutiveIgnored > 0) {
    const days = input.workingOn.consecutiveIgnored;
    items.push({
      key: 'ignored_days',
      statement: `Today's suggestion has gone unanswered ${days} day${days === 1 ? '' : 's'} running.`,
      source: 'her activity',
    });
  }

  if (input.escalatedThreads > 0) {
    items.push({
      key: 'escalated',
      statement: `${input.escalatedThreads} coaching thread${input.escalatedThreads === 1 ? ' has' : 's have'} been handed to you because Root could not make ${input.escalatedThreads === 1 ? 'it' : 'them'} land.`,
      source: 'the coaching engine',
    });
  }

  for (const alert of input.routineAlerts.filter((a) => a.alertKey === 'recurring_barriers')) {
    items.push({ key: alert.alertKey, statement: alert.reason, source: 'the coaching engine' });
  }

  return items;
}
