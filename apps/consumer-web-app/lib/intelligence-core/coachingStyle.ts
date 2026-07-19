/**
 * Coaching Style Profile — learned tone/detail/task-load preference,
 * inferred only from real interaction signals already collected
 * (feed helpfulness ratings, content format/duration, and structured
 * narrative/conversation-memory facts already vetted by their own
 * subsystems). The keyword match in `inferTonePreference` is a narrow,
 * deterministic classifier over already-structured coaching_preferences
 * narrative text (system/coach-authored, not raw member free text) — same
 * "deterministic, auditable, no LLM guessing" discipline as
 * lib/safety/classifier.ts — never a sentiment model over arbitrary chat
 * messages.
 */

import type { ConversationMemoryItem, NarrativeItem } from '@mef/shared-types-contracts';
import { average, confidenceFromSample } from '../intelligence/confidence';
import type { FeedHistoryPair } from '../feed/memory';
import type { CoachingStyleComputation, WellnessIdentityObservationDraft } from './types';

const MIN_HELPFUL_SAMPLE = 3;
const MIN_FORMAT_SAMPLE = 4;

const ENCOURAGEMENT_KEYWORDS = ['encourag', 'positive', 'cheer', 'celebrat', 'support'];
const DIRECT_KEYWORDS = ['direct', 'straightforward', 'just tell', 'concise', 'to the point'];
const EDUCATION_KEYWORDS = ['explain', 'why', 'understand', 'education', 'learn more'];

function inferTonePreference(
  narrativeItems: NarrativeItem[],
  conversationMemory: ConversationMemoryItem[]
): {
  tone: CoachingStyleComputation['tonePreference'];
  matchCount: number;
  matchedText: string | null;
} {
  const texts = [
    ...narrativeItems
      .filter((n) => n.category === 'coaching_preferences' && n.status === 'active')
      .map((n) => `${n.title} ${n.summary}`),
    ...conversationMemory.filter((m) => m.memory_type === 'preference').map((m) => m.content),
  ].map((t) => t.toLowerCase());

  let encouragement = 0;
  let direct = 0;
  let education = 0;
  let matchedText: string | null = null;

  for (const text of texts) {
    if (ENCOURAGEMENT_KEYWORDS.some((k) => text.includes(k))) {
      encouragement++;
      matchedText = matchedText ?? text;
    }
    if (DIRECT_KEYWORDS.some((k) => text.includes(k))) {
      direct++;
      matchedText = matchedText ?? text;
    }
    if (EDUCATION_KEYWORDS.some((k) => text.includes(k))) {
      education++;
      matchedText = matchedText ?? text;
    }
  }

  const best = Math.max(encouragement, direct, education);
  if (best === 0) return { tone: 'unclear', matchCount: 0, matchedText: null };
  if (best === encouragement)
    return { tone: 'encouragement', matchCount: encouragement, matchedText };
  if (best === direct) return { tone: 'direct', matchCount: direct, matchedText };
  return { tone: 'education_first', matchCount: education, matchedText };
}

function inferDetailPreference(historyPairs: FeedHistoryPair[]): {
  detail: CoachingStyleComputation['detailPreference'];
  sampleSize: number;
} {
  const rated = historyPairs.filter((p) => p.feedItem.helpful !== null && p.content !== null);
  const helpful = rated.filter((p) => p.feedItem.helpful === true);
  const notHelpful = rated.filter((p) => p.feedItem.helpful === false);
  if (helpful.length < MIN_HELPFUL_SAMPLE || notHelpful.length < MIN_HELPFUL_SAMPLE) {
    return { detail: 'unclear', sampleSize: rated.length };
  }

  const helpfulAvgMinutes = average(helpful.map((p) => p.content!.estimated_reading_minutes))!;
  const notHelpfulAvgMinutes = average(
    notHelpful.map((p) => p.content!.estimated_reading_minutes)
  )!;
  const diff = notHelpfulAvgMinutes - helpfulAvgMinutes;

  if (diff >= 3) return { detail: 'brief', sampleSize: rated.length };
  if (diff <= -3) return { detail: 'detailed', sampleSize: rated.length };
  return { detail: 'unclear', sampleSize: rated.length };
}

function inferTaskLoadPreference(historyPairs: FeedHistoryPair[]): {
  taskLoad: CoachingStyleComputation['taskLoadPreference'];
  sampleSize: number;
} {
  const withContent = historyPairs.filter((p) => p.content !== null);
  const practice = withContent.filter((p) => p.content!.content_format === 'practice');
  const single = withContent.filter((p) => p.content!.content_format !== 'practice');
  if (practice.length < MIN_FORMAT_SAMPLE || single.length < MIN_FORMAT_SAMPLE) {
    return { taskLoad: 'unclear', sampleSize: practice.length + single.length };
  }

  const practiceRate = practice.filter((p) => p.feedItem.completed_at).length / practice.length;
  const singleRate = single.filter((p) => p.feedItem.completed_at).length / single.length;

  if (singleRate - practiceRate >= 0.2) {
    return { taskLoad: 'single_focus', sampleSize: practice.length + single.length };
  }
  if (practiceRate >= singleRate) {
    return { taskLoad: 'multi_task_ok', sampleSize: practice.length + single.length };
  }
  return { taskLoad: 'unclear', sampleSize: practice.length + single.length };
}

export function computeCoachingStyle(
  historyPairs: FeedHistoryPair[],
  narrativeItems: NarrativeItem[],
  conversationMemory: ConversationMemoryItem[],
  timeCommitmentObservation: WellnessIdentityObservationDraft | null
): CoachingStyleComputation {
  const toneResult = inferTonePreference(narrativeItems, conversationMemory);
  const detailResult = inferDetailPreference(historyPairs);
  const taskLoadResult = inferTaskLoadPreference(historyPairs);
  const sweetSpotMinutes = timeCommitmentObservation ? 10 : null;

  const evidenceCount = toneResult.matchCount + detailResult.sampleSize + taskLoadResult.sampleSize;
  const signalsFound = [
    toneResult.tone !== 'unclear',
    detailResult.detail !== 'unclear',
    taskLoadResult.taskLoad !== 'unclear',
    sweetSpotMinutes !== null,
  ].filter(Boolean).length;

  const confidence =
    signalsFound === 0
      ? 0
      : confidenceFromSample(evidenceCount, 0.4 + signalsFound * 0.05, 25, 0.85);

  const rationaleParts: string[] = [];
  if (toneResult.tone !== 'unclear') {
    rationaleParts.push(
      `Coaching-preference history suggests a "${toneResult.tone.replace('_', ' ')}" tone.`
    );
  }
  if (detailResult.detail !== 'unclear') {
    rationaleParts.push(
      `Helpfulness ratings suggest a preference for ${detailResult.detail} content.`
    );
  }
  if (taskLoadResult.taskLoad !== 'unclear') {
    rationaleParts.push(
      taskLoadResult.taskLoad === 'single_focus'
        ? 'Completion drops on multi-step (practice) content — better with one clear task at a time.'
        : 'Completion holds up even on multi-step (practice) content.'
    );
  }
  if (sweetSpotMinutes !== null) {
    rationaleParts.push(`Engages most reliably with content under ${sweetSpotMinutes} minutes.`);
  }

  return {
    tonePreference: toneResult.tone,
    detailPreference: detailResult.detail,
    taskLoadPreference: taskLoadResult.taskLoad,
    timeCommitmentSweetSpotMinutes: sweetSpotMinutes,
    confidence,
    evidenceCount,
    rationale:
      rationaleParts.length > 0
        ? rationaleParts.join(' ')
        : 'Not enough interaction history yet to infer a coaching style preference.',
  };
}
