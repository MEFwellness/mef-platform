/**
 * Wires the LLM provider (or the deterministic fallback, when unconfigured
 * or on any call failure) to a single-turn reply for the Lead Capture
 * Agent — the route handler never talks to the provider or fallback
 * copy directly, so every call site (follow-up turns, the two-part
 * insight) shares one place that decides "real model vs. fallback."
 */

import { getLeadCaptureProvider } from './provider';
import {
  LEAD_AGENT_SYSTEM_PROMPT,
  buildFollowUpUserPrompt,
  buildInsightPart1UserPrompt,
  buildInsightPart2UserPrompt,
} from './prompt';
import {
  buildFallbackFollowUp,
  buildFallbackInsightPart1,
  buildFallbackInsightPart2,
} from './fallback';
import type { LeadConversationStage, LeadTopic, LeadMessage, LeadPatternName } from '@mef/shared-types-contracts';

export async function generateFollowUpReply(
  stage: Exclude<LeadConversationStage, 'opening' | 'insight_capture' | 'routed'>,
  topic: LeadTopic,
  history: LeadMessage[]
): Promise<string> {
  const provider = getLeadCaptureProvider();
  if (!provider) return buildFallbackFollowUp(stage, topic);

  try {
    const result = await provider.generateCompletion({
      templateKey: `lead_capture_${stage}`,
      systemPrompt: LEAD_AGENT_SYSTEM_PROMPT,
      userPrompt: buildFollowUpUserPrompt(stage, topic, history),
      maxOutputTokens: 150,
    });
    return result.content || buildFallbackFollowUp(stage, topic);
  } catch (err) {
    console.error('lead-capture: LLM follow-up call failed, using fallback', err);
    return buildFallbackFollowUp(stage, topic);
  }
}

/** PART ONE of the insight — names the pattern, opens the loop, asks for name + email. */
export async function generateInsightPart1Reply(
  topic: LeadTopic,
  patternName: LeadPatternName,
  history: LeadMessage[]
): Promise<string> {
  const provider = getLeadCaptureProvider();
  if (!provider) return buildFallbackInsightPart1(patternName);

  try {
    const result = await provider.generateCompletion({
      templateKey: 'lead_capture_insight_part1',
      systemPrompt: LEAD_AGENT_SYSTEM_PROMPT,
      userPrompt: buildInsightPart1UserPrompt(topic, patternName, history),
      maxOutputTokens: 220,
    });
    return result.content || buildFallbackInsightPart1(patternName);
  } catch (err) {
    console.error('lead-capture: LLM insight part-1 call failed, using fallback', err);
    return buildFallbackInsightPart1(patternName);
  }
}

/** PART TWO — the payoff, generated without a link/CTA; the caller appends the deterministic routing message. */
export async function generateInsightPart2Reply(
  topic: LeadTopic,
  patternName: LeadPatternName,
  history: LeadMessage[]
): Promise<string> {
  const provider = getLeadCaptureProvider();
  if (!provider) return buildFallbackInsightPart2(patternName);

  try {
    const result = await provider.generateCompletion({
      templateKey: 'lead_capture_insight_part2',
      systemPrompt: LEAD_AGENT_SYSTEM_PROMPT,
      userPrompt: buildInsightPart2UserPrompt(topic, patternName, history),
      maxOutputTokens: 180,
    });
    return result.content || buildFallbackInsightPart2(patternName);
  } catch (err) {
    console.error('lead-capture: LLM insight part-2 call failed, using fallback', err);
    return buildFallbackInsightPart2(patternName);
  }
}
