/**
 * Shared shapes every agent implementation and the dispatcher agree on.
 * An agent never writes to the database itself — it returns drafts, and
 * the dispatcher (lib/ai/dispatcher.ts) is the single place that persists
 * them, records history, and writes logs. This keeps every agent a pure,
 * easily-testable function of (context) -> drafts.
 *
 * An AgentOutput is a list of items, each an explicitly-linked
 * insight/recommendation/action triple (any of the three may be omitted —
 * not every insight rises to a recommendation, not every recommendation
 * becomes an immediately actionable item). The dispatcher persists each
 * item's insight first, then its recommendation (linked via
 * source_insight_id), then its action (linked via
 * source_recommendation_id) — this is what actually exercises the
 * insight -> recommendation -> action chain the schema models, instead of
 * three parallel, uncorrelated lists.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AgentKey,
  AiActionType,
  AiEvent,
  AiEventType,
  NotificationType,
} from '@mef/shared-types-contracts';
import type { RuleFacts } from '../rules/facts';
import type { RuleMatch } from '../rules/engine';

export type AgentContext = {
  supabase: SupabaseClient;
  memberId: string;
  event: AiEvent;
  facts: RuleFacts;
  /** Only the matches from rules whose agent_key is this agent's own — the dispatcher has already filtered/sorted these. */
  ruleMatches: RuleMatch[];
};

export type InsightDraft = {
  insightType: string;
  title: string;
  description: string;
  supportingData: Record<string, unknown>;
  confidence: number;
  sourceRuleKey?: string;
};

export type RecommendationDraft = {
  recommendationType: string;
  title: string;
  description: string;
  supportingData: Record<string, unknown>;
  confidence: number;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
};

export type ActionDraft = {
  actionType: AiActionType;
  reason: string;
  supportingData: Record<string, unknown>;
  confidence: number;
  requiresCoachApproval: boolean;
};

/**
 * A member-visible in-app notification — the Proactive AI Coach's
 * delivery channel (lib/ai/agents/proactive-coach.ts). Distinct from
 * insight/recommendation/action: those three are coaching-domain records
 * a coach or report can surface later, while a notification is the one
 * thing guaranteed to render somewhere the member will actually see it
 * (the Coach Messages inbox), the same generic `notifications` table
 * migration 39 already added for assessment-report-published.
 */
export type NotificationDraft = {
  notificationType: NotificationType;
  title: string;
  body?: string | null;
};

export type AgentOutputItem = {
  insight?: InsightDraft;
  recommendation?: RecommendationDraft;
  action?: ActionDraft;
  notification?: NotificationDraft;
};

export type AgentOutput = AgentOutputItem[];

export interface AiAgentDefinition {
  key: AgentKey;
  respondsTo: AiEventType[];
  handle(context: AgentContext): Promise<AgentOutput>;
}

function priorityFromConfidence(confidence: number): 'low' | 'medium' | 'high' | 'urgent' {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

/** A rule match becomes one fully-linked insight -> recommendation -> action item, using exactly what the rule's `produces` field says — no agent-specific interpretation needed for this generic path. */
export function ruleMatchToOutputItem(match: RuleMatch): AgentOutputItem {
  const supportingData = { facts: match.facts, ruleKey: match.rule.rule_key };

  return {
    insight: {
      insightType: match.produces.insightType,
      title: match.produces.title,
      description: match.description,
      supportingData,
      confidence: match.produces.confidence,
      sourceRuleKey: match.rule.rule_key,
    },
    recommendation: {
      recommendationType: match.produces.insightType,
      title: match.produces.title,
      description: match.description,
      supportingData,
      confidence: match.produces.confidence,
      priority: priorityFromConfidence(match.produces.confidence),
    },
    action: {
      actionType: match.produces.actionType,
      reason: match.description,
      supportingData,
      confidence: match.produces.confidence,
      requiresCoachApproval: match.produces.requiresCoachApproval,
    },
  };
}

export function ruleMatchesToOutput(ruleMatches: RuleMatch[]): AgentOutput {
  return ruleMatches.map(ruleMatchToOutputItem);
}

export function mergeAgentOutputs(outputs: AgentOutput[]): AgentOutput {
  return outputs.flat();
}
