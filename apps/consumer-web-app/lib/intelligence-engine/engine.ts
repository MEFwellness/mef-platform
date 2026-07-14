/**
 * The MEF Intelligence Engine's orchestrator — the one reusable API every
 * future AI feature should call instead of recreating this logic
 * (Conversation Coach, Coach Dashboard, Daily Coaching, notifications,
 * reports, a future voice coach, a future mobile app). Three entry points:
 *
 *   computeIntelligenceFromProfile()   pure computation over an
 *                                       already-gathered MemberHealthProfile
 *                                       — no I/O at all.
 *
 *   computeMemberIntelligence()        gathers the profile, then
 *                                       computeIntelligenceFromProfile().
 *                                       Read-only overall. Cheap enough to
 *                                       call on every page load or chat
 *                                       turn, same "recomputation is
 *                                       cheap, re-run rather than cached"
 *                                       posture lib/intelligence/service.ts
 *                                       and lib/brain/service.ts already
 *                                       established — this is what the
 *                                       Conversation Coach uses (via
 *                                       getConversationContextIntelligence
 *                                       below), so a member sending a chat
 *                                       message never triggers a
 *                                       coach-alert write as a side effect.
 *
 *   buildMemberIntelligence()          computeMemberIntelligence() PLUS
 *                                       persistence (an append-only
 *                                       intelligence_profile_snapshots row,
 *                                       and upserted
 *                                       intelligence_coach_alerts rows) —
 *                                       used by coach-facing surfaces that
 *                                       explicitly want the durable record
 *                                       and the alert queue kept current
 *                                       (the Coach Dashboard's client
 *                                       view, an explicit "recalculate"
 *                                       action), mirroring exactly how
 *                                       getClientWellnessIntelligence
 *                                       already triggers
 *                                       recalculateWellnessIntelligence on
 *                                       every coach page view.
 *
 * Persistence is best-effort and non-throwing — a recalculation failure
 * must never break the page/action that triggered it, same discipline as
 * lib/narrative/service.ts's updateNarrativeForEvent and
 * lib/intelligence/service.ts's recalculateWellnessIntelligence.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyAllMetricTrends } from '../intelligence/trendEngine';
import {
  strongestAreaInsight,
  mostImprovedAreaInsight,
  longestConsistencyInsight,
  sustainableHabitInsight,
} from '../intelligence/strengthEngine';
import { computePriorityIntelligence } from '../intelligence/priorityIntelligence';
import { WELLNESS_METRIC_AREAS } from '../intelligence/types';
import type { WellnessInsightDraft } from '../intelligence/types';
import type { WellnessArea } from '@mef/shared-types-contracts';
import { areaLabel } from '../intelligence/copy';
import { focusDisplayLabel } from '../brain/copy';
import { gatherMemberHealthProfile } from './profile';
import { buildLongitudinalTrends } from './trends';
import { buildPatternInsights } from './patterns';
import { buildRootCauseHypotheses } from './hypotheses';
import { buildRecommendations } from './recommendations';
import { buildMemberSummary } from './summary';
import { buildCoachAlertDrafts } from './alerts';
import { insertProfileSnapshot, upsertCoachAlert } from './data';
import type { CoachingPriorities, MemberHealthProfile, MemberIntelligenceReport } from './types';

type AttentionLevel = CoachingPriorities['recommendedCoachAttentionLevel'];

const ATTENTION_LEVEL_REASON: Record<AttentionLevel, (area: WellnessArea | null) => string | null> =
  {
    priority: (area) =>
      area
        ? `${areaLabel(area)} is an important-severity concern that warrants direct coach attention.`
        : 'A concern reached important severity and warrants direct coach attention.',
    discuss: (area) =>
      area ? `${areaLabel(area)} is worth raising directly at the next session.` : null,
    monitor: () => 'Nothing urgent — worth keeping an eye on.',
    none: () => null,
  };

function computePriorities(
  trendDrafts: WellnessInsightDraft[],
  strengthDrafts: WellnessInsightDraft[]
): CoachingPriorities {
  const base = computePriorityIntelligence(trendDrafts, strengthDrafts);
  return {
    ...base,
    coachAttentionReason: ATTENTION_LEVEL_REASON[base.recommendedCoachAttentionLevel](
      base.primaryPriority ?? base.secondaryPriority
    ),
  };
}

/** Pure — no I/O. Every field of `profile` is already-fetched real data; nothing here reaches back into the database. */
export function computeIntelligenceFromProfile(
  profile: MemberHealthProfile
): MemberIntelligenceReport {
  const { checkinsOldestFirst, localDate: asOfLocalDate } = profile;

  const trendDrafts = classifyAllMetricTrends(
    checkinsOldestFirst,
    asOfLocalDate,
    WELLNESS_METRIC_AREAS
  );
  const strengthDrafts = [
    strongestAreaInsight(checkinsOldestFirst, asOfLocalDate, WELLNESS_METRIC_AREAS),
    mostImprovedAreaInsight(checkinsOldestFirst, asOfLocalDate, WELLNESS_METRIC_AREAS),
    longestConsistencyInsight(checkinsOldestFirst, asOfLocalDate),
    sustainableHabitInsight(profile.feedHistoryPairs, asOfLocalDate),
  ].filter((d): d is WellnessInsightDraft => d !== null);

  const longitudinalTrends = buildLongitudinalTrends(
    checkinsOldestFirst,
    asOfLocalDate,
    profile.comparison
  );
  const patterns = buildPatternInsights(profile, longitudinalTrends);
  const hypotheses = buildRootCauseHypotheses(profile, longitudinalTrends, patterns);
  const priorities = computePriorities(trendDrafts, strengthDrafts);
  const recommendations = buildRecommendations(
    profile,
    longitudinalTrends,
    patterns,
    hypotheses,
    priorities
  );
  const memberSummary = buildMemberSummary(
    profile,
    longitudinalTrends,
    patterns,
    hypotheses,
    priorities
  );
  const alerts = buildCoachAlertDrafts(profile, longitudinalTrends, patterns);

  return {
    memberId: profile.memberId,
    localDate: asOfLocalDate,
    generatedAt: new Date().toISOString(),
    longitudinalTrends,
    patterns,
    hypotheses,
    priorities,
    recommendations,
    memberSummary,
    alerts,
  };
}

export async function computeMemberIntelligence(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<MemberIntelligenceReport> {
  const profile = await gatherMemberHealthProfile(supabase, memberId, asOfLocalDate);
  return computeIntelligenceFromProfile(profile);
}

export async function buildMemberIntelligence(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<MemberIntelligenceReport> {
  const report = await computeMemberIntelligence(supabase, memberId, asOfLocalDate);

  try {
    await insertProfileSnapshot(supabase, memberId, report);
    for (const draft of report.alerts) {
      await upsertCoachAlert(supabase, memberId, draft);
    }
  } catch (err) {
    console.error(
      'buildMemberIntelligence persistence failed',
      err instanceof Error ? err.message : err
    );
  }

  return report;
}

export type ConversationIntelligenceContext = {
  decision: MemberHealthProfile['brainDecision'];
  focusLabel: string;
  confirmedInsights: string[];
  narrativeHighlights: string[];
  restrictedTopics: string[];
  priorities: CoachingPriorities;
  topHypothesisForMember: string | null;
};

const NARRATIVE_CONTINUITY_CATEGORIES = new Set([
  'barriers_to_adherence',
  'successful_interventions',
  'coaching_preferences',
  'current_goals',
  'recent_wins',
  'recurring_patterns',
]);

/**
 * The single call the Conversation Coach makes for shared intelligence
 * (lib/conversation-coach/context.ts) instead of independently fanning out
 * to the Brain, the Personal Wellness Intelligence Engine, the Narrative,
 * and Safety itself. Read-only — see computeMemberIntelligence()'s own
 * docblock for why this never persists an alert or snapshot on every chat
 * turn. Conversation-specific state (session memory, recent messages,
 * today's selected lesson) stays the Conversation Coach's own concern —
 * those aren't member-wide intelligence, they're this one session's.
 */
export async function getConversationContextIntelligence(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<ConversationIntelligenceContext> {
  const profile = await gatherMemberHealthProfile(supabase, memberId, localDate);
  const report = computeIntelligenceFromProfile(profile);

  const confirmedInsights = profile.wellnessInsights
    .filter((i) => i.member_visible && i.insight_type !== 'priority_summary')
    .slice(0, 3)
    .map((i) => i.member_summary);

  const narrativeHighlights = profile.narrativeItems
    .filter((item) => item.member_visible && NARRATIVE_CONTINUITY_CATEGORIES.has(item.category))
    .slice(0, 5)
    .map((item) => `${item.title}: ${item.summary}`);

  return {
    decision: profile.brainDecision,
    focusLabel: focusDisplayLabel(profile.brainDecision.focus, profile.brainDecision.mode),
    confirmedInsights,
    narrativeHighlights,
    restrictedTopics: profile.restrictedTopics,
    priorities: report.priorities,
    topHypothesisForMember:
      profile.restrictedTopics.length === 0 && report.hypotheses[0]
        ? report.hypotheses[0].statement
        : null,
  };
}
