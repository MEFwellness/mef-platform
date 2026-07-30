/**
 * System prompt + per-turn instruction builder for the Lead Capture
 * Agent. Deliberately its own file, not shared with
 * lib/conversation-coach/prompt.ts — Root's prompt is written for an
 * existing, signed-in member with real health data in context; this one
 * is written for an anonymous prospect who has shared nothing yet.
 *
 * The LLM is only ever asked to generate the natural-language reply text
 * for one turn at a time — which stage comes next, when to capture an
 * email, and where to route the lead are all decided deterministically in
 * flow.ts, never left to the model. This keeps the one part that must be
 * reliable (capturing a real email, routing correctly) untouched by LLM
 * variance, while still letting the model's language feel adaptive and
 * specific to what the prospect actually said.
 */

import type { LeadConversationStage, LeadTopic } from '@mef/shared-types-contracts';
import type { LeadMessage } from '@mef/shared-types-contracts';

export const LEAD_AGENT_SYSTEM_PROMPT = `You are the warm, expert intake coordinator for MEF Wellness, a holistic wellness coaching practice. MEF Wellness works from a root-cause philosophy: the Six Fundamentals (movement, nutrition, sleep, stress, mindset, and environment/relationships) and the Four Doctors (rest, exercise, nutrition, and a positive mind) as the real drivers of how someone feels.

Rules you must always follow:
- Use only observational, non-diagnostic language. Never diagnose a condition, never give medical advice, never claim to know what's medically wrong with someone.
- Be warm, human, and concise — this is a mobile chat bubble, not an essay. Every reply is 1-3 short sentences.
- Be inclusive and welcoming of every kind of client, regardless of age, ability, or background.
- Never invent a specific fact about the prospect that they haven't told you.
- Never mention that you are an AI, a language model, or a bot.
- Do not repeat a question that's already been asked in this conversation.`;

function transcript(messages: LeadMessage[]): string {
  return messages
    .map((message) => `${message.role === 'lead' ? 'Prospect' : 'You'}: ${message.content}`)
    .join('\n');
}

const TOPIC_LABEL: Record<LeadTopic, string> = {
  pain: 'pain',
  energy: 'low energy',
  sleep: 'sleep',
  stress: 'stress',
  general: 'how they have been feeling',
};

/** Builds the userPrompt for a single follow-up-question turn (stages follow_up_1..3). */
export function buildFollowUpUserPrompt(
  stage: Extract<LeadConversationStage, 'follow_up_1' | 'follow_up_2' | 'follow_up_3'>,
  topic: LeadTopic,
  history: LeadMessage[]
): string {
  const focusByStage: Record<typeof stage, string> = {
    follow_up_1: 'where it shows up and how long it has been going on',
    follow_up_2: 'what they have already tried, if anything',
    follow_up_3: 'what outcome or goal they actually want',
  };

  return `Conversation so far (the prospect's main concern is ${TOPIC_LABEL[topic]}):\n${transcript(history)}\n\nYour task: ask ONE short, warm follow-up question about ${focusByStage[stage]}. 1-2 sentences. Do not diagnose. Do not repeat a question already asked above.`;
}

/** Builds the userPrompt for the combined root-cause insight + email-ask turn. */
export function buildInsightAndCaptureUserPrompt(topic: LeadTopic, history: LeadMessage[]): string {
  return `Conversation so far (the prospect's main concern is ${TOPIC_LABEL[topic]}):\n${transcript(history)}\n\nYour task: in 2-3 short sentences, (1) offer one genuinely useful, specific observation connecting what they've actually told you to the Six Fundamentals / root-cause idea (in plain language, no jargon, never diagnosing), then (2) naturally ask if they'd like you to send them a short summary of what you covered, and ask for their first name and best email in the same message.`;
}
