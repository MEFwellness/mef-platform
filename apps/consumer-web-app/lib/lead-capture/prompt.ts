/**
 * System prompt + per-turn instruction builder for the Lead Capture
 * Agent. Deliberately its own file, not shared with
 * lib/conversation-coach/prompt.ts — Root's prompt is written for an
 * existing, signed-in member with real health data in context; this one
 * is written for an anonymous prospect who has shared nothing yet.
 *
 * Voice standard (banned phrases, tone, the two-part-insight structure)
 * is documented in full, with examples, in docs/LEAD_AGENT_VOICE.md — this
 * file's system prompt is the enforced version of that same standard.
 *
 * The LLM is only ever asked to generate the natural-language reply text
 * for one turn at a time — which stage comes next, when to capture an
 * email, which pattern name applies, and where to route the lead are all
 * decided deterministically in flow.ts / pattern.ts, never left to the
 * model. This keeps the parts that must be reliable (capturing a real
 * email, naming the correct pattern, routing correctly, and the exact
 * routing link) untouched by LLM variance, while still letting the
 * model's language feel adaptive and specific to what the prospect
 * actually said.
 */

import type { LeadConversationStage, LeadTopic } from '@mef/shared-types-contracts';
import type { LeadMessage } from '@mef/shared-types-contracts';
import { PATTERN_LABELS } from './pattern';
import type { LeadPatternName } from '@mef/shared-types-contracts';

export const LEAD_AGENT_SYSTEM_PROMPT = `You are a seasoned root-cause wellness practitioner talking with someone who just showed up because something isn't right. Your lens: the body is one connected system, a symptom is a signal rather than the problem itself, and the work is finding the root — not managing the symptom.

Voice rules you must always follow:
- Calm confidence and warmth. No corporate filler, no performance of enthusiasm.
- Never use these phrases or close variants of them: "I understand", "I'm sorry to hear that", "Thanks for sharing", "Great question", "I'd be happy to", "Let's dive in". Never use an exclamation point, anywhere, for any reason.
- Every reply is short — 1-2 sentences for most turns. This is a mobile chat, not an essay.
- A question should carry expertise, not read like a form field. Connect it to what the body might be doing. Example: after someone mentions pain, "Does it ease off during the day, or build as the day goes on?" reads right; "How would you describe the pain?" does not.
- Stay observational, never diagnostic: "that combination usually points to..." or "that often comes down to...", never "you have..." and never a condition or diagnosis name.
- Weave in the idea that the body is one connected system and symptoms are signals naturally, in your own words, when it fits — never as a lecture or a bullet list.
- Never invent a specific fact about the visitor that they haven't told you.
- Never mention that you are an AI, a language model, or a bot.
- Do not repeat a question that has already been asked in this conversation.
- Be inclusive and welcoming of every kind of visitor, regardless of age, ability, or background.
- If the visitor's concern is weight: never prescribe a diet, a calorie target, or an exercise plan, and never mention calories, macros, or a specific number on the scale. Weight is a signal from the same connected system as sleep, stress, and energy — not a personal failing. Shame-free, root-cause framing only.`;

function transcript(messages: LeadMessage[]): string {
  return messages
    .map((message) => `${message.role === 'lead' ? 'Visitor' : 'You'}: ${message.content}`)
    .join('\n');
}

const TOPIC_LABEL: Record<LeadTopic, string> = {
  pain: 'pain',
  energy: 'low energy',
  sleep: 'sleep',
  stress: 'stress',
  weight: 'weight',
  general: 'how they have been feeling',
};

const FOLLOW_UP_FOCUS: Record<
  Extract<LeadConversationStage, 'follow_up_1' | 'follow_up_2' | 'follow_up_3' | 'follow_up_4'>,
  string
> = {
  follow_up_1: 'where it shows up most, or when in the day it hits hardest',
  follow_up_2: 'how long this has been going on',
  follow_up_3: 'what they have already tried, if anything',
  follow_up_4: 'what outcome or goal they actually want out of fixing this',
};

/** Builds the userPrompt for a single follow-up-question turn (stages follow_up_1..follow_up_4). */
export function buildFollowUpUserPrompt(
  stage: Extract<LeadConversationStage, 'follow_up_1' | 'follow_up_2' | 'follow_up_3' | 'follow_up_4'>,
  topic: LeadTopic,
  history: LeadMessage[]
): string {
  return `Conversation so far (the visitor's main concern is ${TOPIC_LABEL[topic]}):\n${transcript(history)}\n\nYour task: ask ONE short question about ${FOLLOW_UP_FOCUS[stage]}. 1-2 sentences, no exclamation points, not diagnostic, not a repeat of a question already asked above.`;
}

/**
 * Builds the userPrompt for PART ONE of the insight — the turn that names
 * the visitor's pattern and combines it with the email ask, but
 * deliberately withholds the full explanation to open a loop. patternName
 * is already decided by pattern.ts before this is ever called.
 */
export function buildInsightPart1UserPrompt(
  topic: LeadTopic,
  patternName: LeadPatternName,
  history: LeadMessage[]
): string {
  const patternLabel = PATTERN_LABELS[patternName];
  return `Conversation so far (the visitor's main concern is ${TOPIC_LABEL[topic]}):\n${transcript(history)}\n\nYour task, in 2-3 short sentences total: (1) connect two specific things the visitor actually told you above, using root-cause logic, and name what you're seeing using this exact phrase somewhere in the sentence: "${patternLabel}" — for example, "that combination usually points to ${patternLabel}". Do NOT explain what drives it or what to do about it yet — deliberately leave that open, e.g. "there's more to it than that." (2) In the same message, naturally offer to send the complete breakdown of their pattern as a short summary, and ask for their first name and best email so you can send it. No exclamation points, never diagnostic.`;
}

/**
 * Builds the userPrompt for PART TWO — the payoff, sent only after email
 * capture (or the retry cap is hit). Deliberately does not mention a link
 * or call to action; the deterministic routing message (fallback.ts's
 * buildRoutingMessage) is appended after this text by the route handler,
 * so the LLM never has to get the URL right.
 */
export function buildInsightPart2UserPrompt(
  topic: LeadTopic,
  patternName: LeadPatternName,
  history: LeadMessage[]
): string {
  const patternLabel = PATTERN_LABELS[patternName];
  return `Conversation so far (the visitor's main concern is ${TOPIC_LABEL[topic]}), where you already told them earlier this looks like ${patternLabel}:\n${transcript(history)}\n\nYour task, in 1-2 short sentences: give the satisfying completion of ${patternLabel} — in plain language, what usually drives it (root-cause / whole-body logic, no jargon) and one concrete first thing that tends to help. Never diagnostic, no exclamation points. Do not include a link, a call to action, or an invitation to book anything — that is handled separately.`;
}
