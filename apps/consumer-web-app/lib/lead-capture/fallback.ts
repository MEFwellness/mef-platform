/**
 * Deterministic templated copy used whenever the LLM provider is
 * unconfigured or a call fails — a prospect must never see a broken
 * widget. Mirrors lib/conversation-coach/fallback.ts's role for Root.
 * Topic-specific but not personalized to the lead's own answers (that
 * personalization only exists on the real LLM path); still observational,
 * non-diagnostic, and on-brand.
 */

import type { LeadConversationStage, LeadTopic, LeadRoutingDestination } from '@mef/shared-types-contracts';
import { getDiscoveryCallUrl, getQuizGuideUrl } from './env';

/** Static — always the same regardless of LLM availability, so the opening turn never needs a provider call at all. */
export const OPENING_MESSAGE = "Hey! What's been bothering you most lately?";
export const QUICK_REPLY_OPTIONS = ['Pain', 'Energy', 'Sleep', 'Stress'] as const;

const FOLLOW_UP_1: Record<LeadTopic, string> = {
  pain: "Got it. Where's the pain, and how long has it been going on?",
  energy: "Thanks for sharing that. When during the day does your energy dip the most, and how long has this been happening?",
  sleep: "Thanks for sharing that. Is it trouble falling asleep, staying asleep, or waking up tired — and how long has that been going on?",
  stress: "Thanks for sharing that. What's been driving the stress most lately, and how long has it been building?",
  general: "Thanks for sharing that. How long has this been going on for you?",
};

const FOLLOW_UP_2: Record<LeadTopic, string> = {
  pain: "Have you tried anything for it so far — stretching, a doctor, rest?",
  energy: "Have you tried anything to turn it around — caffeine, more sleep, supplements?",
  sleep: "Have you tried anything so far — a wind-down routine, cutting screens, melatonin?",
  stress: "Have you tried anything to manage it so far?",
  general: "Have you tried anything to address it so far?",
};

const FOLLOW_UP_3: Record<LeadTopic, string> = {
  pain: "What would it mean for you to have this resolved — what's the goal?",
  energy: "What would having real, steady energy let you do again?",
  sleep: "What would a real night of sleep change for you day to day?",
  stress: "What would feeling less stressed free you up to focus on?",
  general: "What's the outcome you're hoping for?",
};

const INSIGHT_CAPTURE: Record<LeadTopic, string> = {
  pain: "In our experience, pain that lingers like this is often less about the spot that hurts and more about how the body's been compensating around sleep, movement, and stress load — worth looking at together. Want me to send you a short summary of what we covered?",
  energy: "Energy dips like this usually trace back to a mix of sleep quality, nutrition timing, and stress load rather than any one cause — worth looking at together. Want me to send you a short summary of what we covered?",
  sleep: "Sleep trouble like this is often connected to stress, movement, and daily rhythm more than sleep itself — worth looking at together. Want me to send you a short summary of what we covered?",
  stress: "Stress that builds like this is usually tangled up with sleep, movement, and recovery, not just what's on your plate — worth looking at together. Want me to send you a short summary of what we covered?",
  general: "What you're describing usually connects back to a few root-cause fundamentals — sleep, movement, nutrition, and stress — more than any single symptom. Want me to send you a short summary of what we covered?",
};

export function buildFallbackFollowUp(stage: LeadConversationStage, topic: LeadTopic): string {
  if (stage === 'follow_up_1') return FOLLOW_UP_1[topic];
  if (stage === 'follow_up_2') return FOLLOW_UP_2[topic];
  return FOLLOW_UP_3[topic];
}

export function buildFallbackInsightAndCapture(topic: LeadTopic): string {
  return `${INSIGHT_CAPTURE[topic]} What's your first name and best email?`;
}

export const EMAIL_RETRY_MESSAGE =
  "I didn't quite catch a valid email there — mind sending your first name and email again?";

export function buildRoutingMessage(
  firstName: string | null,
  destination: LeadRoutingDestination
): string {
  const greeting = firstName ? `Thanks, ${firstName}!` : 'Thanks!';
  if (destination === 'discovery_call') {
    return `${greeting} Since this sounds like something worth digging into together, here's the link to book your Discovery Assessment: ${getDiscoveryCallUrl()}`;
  }
  return `${greeting} Here's a quick next step to start getting some answers: ${getQuizGuideUrl()}`;
}

export const CLOSING_MESSAGE = "You're all set — reach back out any time!";
