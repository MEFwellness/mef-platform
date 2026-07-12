/**
 * Database access for the AI infrastructure — reading agent/rule config
 * and persisting what agents produce. Mirrors the pattern the rest of
 * this app already uses (lib/onboarding/baseline.ts etc.): pure functions
 * taking a SupabaseClient, no role decisions of their own — RLS
 * (supabase/migrations/…_ai_infrastructure.sql) decides who's allowed to
 * read or write what.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentKey, AiAgentRecord, AiRule } from '@mef/shared-types-contracts';
import type { InsightDraft, RecommendationDraft, ActionDraft } from './agents/types';

// ---- Config reads, lightly cached in-process -------------------------
//
// Agent/rule rows change rarely (an admin toggling one is a deliberate,
// infrequent action), so a short in-process TTL cache avoids hitting the
// database on every single event dispatch. This cache is per-process —
// a multi-instance deployment won't share it, and an admin toggle can
// take up to CACHE_TTL_MS to take effect everywhere. Acceptable for this
// foundation; a real invalidation strategy (or moving to a shared cache)
// is a later concern once there's an admin surface actually toggling
// these at runtime.

const CACHE_TTL_MS = 60_000;

let agentsCache: { agents: AiAgentRecord[]; expiresAt: number } | null = null;
let rulesCache: { rules: AiRule[]; expiresAt: number } | null = null;

export async function getEnabledAgents(supabase: SupabaseClient): Promise<AiAgentRecord[]> {
  const now = Date.now();
  if (agentsCache && agentsCache.expiresAt > now) return agentsCache.agents;

  const { data, error } = await supabase.from('ai_agents').select('*').eq('enabled', true);
  if (error) {
    console.error('getEnabledAgents failed', error);
    return [];
  }

  const agents = (data ?? []) as AiAgentRecord[];
  agentsCache = { agents, expiresAt: now + CACHE_TTL_MS };
  return agents;
}

export async function getActiveRules(supabase: SupabaseClient): Promise<AiRule[]> {
  const now = Date.now();
  if (rulesCache && rulesCache.expiresAt > now) return rulesCache.rules;

  const { data, error } = await supabase
    .from('ai_rules')
    .select('*')
    .eq('enabled', true)
    .order('priority', { ascending: true });
  if (error) {
    console.error('getActiveRules failed', error);
    return [];
  }

  const rules = (data ?? []) as AiRule[];
  rulesCache = { rules, expiresAt: now + CACHE_TTL_MS };
  return rules;
}

/** Test-only escape hatch — production code never needs to invalidate mid-process. */
export function clearAiConfigCacheForTests(): void {
  agentsCache = null;
  rulesCache = null;
}

// ---- Writes ------------------------------------------------------------

export async function insertInsight(
  supabase: SupabaseClient,
  memberId: string,
  agentKey: AgentKey,
  sourceEventId: string | null,
  draft: InsightDraft
): Promise<string | null> {
  const { data, error } = await supabase
    .from('ai_insights')
    .insert({
      agent_key: agentKey,
      member_id: memberId,
      source_event_id: sourceEventId,
      source_rule_key: draft.sourceRuleKey ?? null,
      insight_type: draft.insightType,
      title: draft.title,
      description: draft.description,
      supporting_data: draft.supportingData,
      confidence: draft.confidence,
    })
    .select('id')
    .single();

  if (error) {
    console.error('insertInsight failed', error);
    return null;
  }
  return data.id as string;
}

export async function insertRecommendation(
  supabase: SupabaseClient,
  memberId: string,
  agentKey: AgentKey,
  sourceInsightId: string | null,
  draft: RecommendationDraft
): Promise<string | null> {
  const { data, error } = await supabase
    .from('ai_recommendations')
    .insert({
      agent_key: agentKey,
      member_id: memberId,
      source_insight_id: sourceInsightId,
      recommendation_type: draft.recommendationType,
      title: draft.title,
      description: draft.description,
      supporting_data: draft.supportingData,
      confidence: draft.confidence,
      priority: draft.priority ?? 'medium',
    })
    .select('id')
    .single();

  if (error) {
    console.error('insertRecommendation failed', error);
    return null;
  }
  return data.id as string;
}

export async function insertAction(
  supabase: SupabaseClient,
  memberId: string,
  agentKey: AgentKey,
  sourceRecommendationId: string | null,
  draft: ActionDraft
): Promise<string | null> {
  const { data, error } = await supabase
    .from('ai_actions')
    .insert({
      agent_key: agentKey,
      member_id: memberId,
      source_recommendation_id: sourceRecommendationId,
      action_type: draft.actionType,
      reason: draft.reason,
      supporting_data: draft.supportingData,
      confidence: draft.confidence,
      requires_coach_approval: draft.requiresCoachApproval,
    })
    .select('id')
    .single();

  if (error) {
    console.error('insertAction failed', error);
    return null;
  }
  return data.id as string;
}

export async function insertLog(
  supabase: SupabaseClient,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context: Record<string, unknown> = {},
  options: { agentKey?: AgentKey; memberId?: string; sourceEventId?: string } = {}
): Promise<void> {
  const { error } = await supabase.from('ai_logs').insert({
    level,
    agent_key: options.agentKey ?? null,
    member_id: options.memberId ?? null,
    source_event_id: options.sourceEventId ?? null,
    message,
    context,
  });

  // Logging failures must never throw — that would turn an observability
  // problem into a user-facing one.
  if (error) {
    console.error('insertLog failed', error);
  }
}
