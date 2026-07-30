/**
 * Wires the LLM provider (or the deterministic fallback, when unconfigured
 * or on any call failure) to a single-turn reply for the Lead Capture
 * Agent — the route handler never talks to the provider or fallback
 * copy directly, so both call sites (follow-up turns, the insight+capture
 * turn) share one place that decides "real model vs. fallback."
 */

import { getLeadCaptureProvider } from './provider';
import {
  LEAD_AGENT_SYSTEM_PROMPT,
  buildFollowUpUserPrompt,
  buildInsightAndCaptureUserPrompt,
} from './prompt';
import { buildFallbackFollowUp, buildFallbackInsightAndCapture } from './fallback';
import type { LeadConversationStage, LeadTopic, LeadMessage } from '@mef/shared-types-contracts';

export async function generateFollowUpReply(
  stage: Extract<LeadConversationStage, 'follow_up_1' | 'follow_up_2' | 'follow_up_3'>,
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

export async function generateInsightAndCaptureReply(
  topic: LeadTopic,
  history: LeadMessage[]
): Promise<string> {
  const provider = getLeadCaptureProvider();
  if (!provider) return buildFallbackInsightAndCapture(topic);

  try {
    const result = await provider.generateCompletion({
      templateKey: 'lead_capture_insight_capture',
      systemPrompt: LEAD_AGENT_SYSTEM_PROMPT,
      userPrompt: buildInsightAndCaptureUserPrompt(topic, history),
      maxOutputTokens: 220,
    });
    return result.content || buildFallbackInsightAndCapture(topic);
  } catch (err) {
    console.error('lead-capture: LLM insight call failed, using fallback', err);
    return buildFallbackInsightAndCapture(topic);
  }
}
