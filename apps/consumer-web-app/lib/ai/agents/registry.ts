/**
 * Code-level agent registry — which agents exist and which event types
 * each one subscribes to. This is the "new agents can be added without
 * changing the existing system" seam the milestone asks for: adding a
 * future Nutrition/Sleep/Recovery/etc. agent means adding one file under
 * lib/ai/agents/ implementing AiAgentDefinition and one line here; the
 * dispatcher, rules engine, and every existing agent are untouched.
 *
 * Distinct from the ai_agents DB table (supabase/migrations/…_ai_infrastructure.sql):
 * that table holds admin-adjustable metadata (enabled/disabled, tone
 * config) an operator can change without a deploy. This registry holds
 * the actual behavior (respondsTo, handle()), which is code by
 * necessity. The dispatcher consults both — this registry for "can this
 * agent handle this event type at all," the DB row for "is it currently
 * enabled."
 */

import type { AgentKey, AiEventType } from '@mef/shared-types-contracts';
import type { AiAgentDefinition } from './types';
import { memberEngagementAgent } from './member-engagement';
import { wellnessAnalysisAgent } from './wellness-analysis';
import { coachAssistantAgent } from './coach-assistant';
import { educationAgent } from './education';
import { accountabilityAgent } from './accountability';

export const AGENT_DEFINITIONS: readonly AiAgentDefinition[] = [
  memberEngagementAgent,
  wellnessAnalysisAgent,
  coachAssistantAgent,
  educationAgent,
  accountabilityAgent,
];

const AGENTS_BY_KEY: Record<AgentKey, AiAgentDefinition> = Object.fromEntries(
  AGENT_DEFINITIONS.map((agent) => [agent.key, agent])
) as Record<AgentKey, AiAgentDefinition>;

export function getAgentDefinition(key: AgentKey): AiAgentDefinition | undefined {
  return AGENTS_BY_KEY[key];
}

/** Every agent (by definition) that declares it responds to this event type — the dispatcher still checks each one's ai_agents.enabled row before actually invoking it. */
export function agentsRespondingTo(eventType: AiEventType): AiAgentDefinition[] {
  return AGENT_DEFINITIONS.filter((agent) => agent.respondsTo.includes(eventType));
}
