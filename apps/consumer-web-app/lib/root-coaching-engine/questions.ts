/**
 * Question Generator (Prompt 13) — coach-facing only (Coach Workspace's
 * "Questions worth asking"). Fixed pools per conversation type, filled in
 * with the same already-computed topic label the message composer uses;
 * never freeform/LLM-generated, never a diagnosis framed as a question.
 */

import type { ConversationType } from './types';

function pick2<T>(options: readonly T[], seedKey: string): T[] {
  if (options.length <= 2) return [...options];
  let hash = 0;
  for (let i = 0; i < seedKey.length; i++) hash = (hash * 31 + seedKey.charCodeAt(i)) >>> 0;
  const start = hash % options.length;
  return [options[start]!, options[(start + 1) % options.length]!];
}

const QUESTION_POOL: Record<ConversationType, (topicLabel: string) => string[]> = {
  first_observation: (t) => [`Has ${t} come up before, even in a small way?`, `What was happening around the time ${t} first showed up?`],
  repeated_signal: (t) => [`What tends to happen right before ${t} shows up?`, `Is there a pattern to when ${t} tends to appear?`],
  improving_trend: (t) => [`What do you think contributed to this improvement with ${t}?`, `What's felt easier lately with ${t}?`],
  worsening_trend: (t) => [`What changed recently that might be connected to ${t}?`, `What's felt more challenging lately with ${t}?`],
  conflicting_information: (t) => [`What does ${t} actually feel like day to day?`, `Which recent answer about ${t} feels most accurate right now?`],
  new_assessment_available: (t) => [`What would you most want to understand better about ${t}?`, `What's made this hard to prioritize so far?`],
  reassessment: (t) => [`What's changed since you last looked at ${t}?`, `Compared to earlier, how does ${t} feel now?`],
  experiment_follow_up: (t) => [`How did ${t} feel?`, `What have you noticed since trying ${t}?`],
  experiment_success: (t) => [`What do you think contributed to ${t} working?`, `What would make it easier to keep this going?`],
  experiment_unsuccessful: (t) => [`What got in the way with ${t}?`, `What would you want to try differently next time?`],
};

/** Up to 2 questions, referencing the real topic — never all pools at once, never overwhelming. */
export function generateQuestionsForCandidate(
  conversationType: ConversationType,
  topicLabel: string,
  rotationSeed: string
): string[] {
  return pick2(QUESTION_POOL[conversationType](topicLabel), rotationSeed);
}
