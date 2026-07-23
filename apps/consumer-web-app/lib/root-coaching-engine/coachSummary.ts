/**
 * Coach Summary Generator (Prompt 13) — the Coach Workspace surface members
 * never see. Pure: takes the same ranked CoachingCandidate[] the member's
 * own message is chosen from, plus this member's recent coaching-message
 * history, and shapes them into a conversation summary, current priorities,
 * recent themes, and suggested discussion topics with questions. Invents
 * nothing new — every line traces to a candidate or a real prior message.
 */

import type { CoachingCandidate, CoachingMessageRow, CoachWorkspaceSummary, SuggestedDiscussionTopic } from './types';
import { generateQuestionsForCandidate } from './questions';

const MAX_SUGGESTED_TOPICS = 5;
const MAX_RECENT_THEMES = 5;
const MAX_PRIORITIES = 3;

function humanizeState(sourceState: string): string {
  return sourceState.replaceAll('_', ' ');
}

function firstSentence(text: string): string {
  return text.split(/(?<=[.?!])\s/)[0] ?? text;
}

export function buildCoachWorkspaceSummary(input: {
  candidates: CoachingCandidate[];
  recentMessages: CoachingMessageRow[];
}): CoachWorkspaceSummary {
  const { candidates, recentMessages } = input;

  const top = candidates[0] ?? null;
  const otherCount = Math.max(0, candidates.length - 1);
  const conversationSummary = top
    ? `Today's most relevant thread is ${top.topicLabel} (${humanizeState(top.sourceState)}).${
        otherCount > 0 ? ` ${otherCount} other topic${otherCount === 1 ? '' : 's'} worth keeping in view.` : ''
      }`
    : 'Nothing urgent stands out right now — a quiet, steady stretch.';

  const currentPriorities = candidates
    .slice(0, MAX_PRIORITIES)
    .map((c) => `${c.topicLabel} (${humanizeState(c.sourceState)})`);

  const seenTopicKeys = new Set<string>();
  const recentCoachingThemes: string[] = [];
  for (const message of recentMessages) {
    if (seenTopicKeys.has(message.topicKey)) continue;
    seenTopicKeys.add(message.topicKey);
    recentCoachingThemes.push(`${humanizeState(message.conversationType)}: ${firstSentence(message.messageText)}`);
    if (recentCoachingThemes.length >= MAX_RECENT_THEMES) break;
  }

  const suggestedDiscussionTopics: SuggestedDiscussionTopic[] = candidates
    .slice(0, MAX_SUGGESTED_TOPICS)
    .map(
      (candidate): SuggestedDiscussionTopic => ({
        conversationType: candidate.conversationType,
        topicLabel: candidate.topicLabel,
        sourceState: candidate.sourceState,
        questions: generateQuestionsForCandidate(
          candidate.conversationType,
          candidate.topicLabel,
          `${candidate.topicKey}::${candidate.occurrenceCount}`
        ),
      })
    );

  return { conversationSummary, currentPriorities, recentCoachingThemes, suggestedDiscussionTopics };
}
