/**
 * Which coaching questions this sitting surfaces, in which order, and how
 * many. COACH ONLY.
 *
 * THE ORDER IS THE DECISION SUPPORT, and it is fixed:
 *
 *   combination triggers first, because a question about two areas moving
 *     together is the one a coach cannot reach from either area alone.
 *   then answer level, because it quotes something she actually said.
 *   then Zone level, because it reads the whole body rather than a section.
 *   then section level, which is the broadest of the four.
 *
 * WITHIN A TIER, STRONGEST FIRST. Strength is the thing the trigger read:
 * a section trigger's own section percentage, an answer trigger's own
 * highest cited answer, a Zone trigger's Zone percentage, and for a
 * combination the MEAN of the sections it named, because a combination is
 * only as interesting as the pair and averaging is the only reading of
 * "strongest" that treats both halves as the reason it fired.
 *
 * NEAR DUPLICATE TOPICS COLLAPSE, and the strongest survivor is the one
 * kept. Two questions filed under Recovery contrast are the same question
 * asked twice from a coach's point of view, and a list of six that spends
 * two of them on one topic is a shorter list than it looks.
 *
 * THE CAP IS A STORED NUMBER, applied last, so collapsing happens before
 * the cut rather than after it.
 *
 * A HIDDEN QUESTION IS STILL SELECTED. Hiding is the coach's own note
 * about one sitting and is applied by the surface that reads these, not
 * here, because a selection that silently reshuffled when a coach hid one
 * card would promote a seventh question he had never been offered.
 */

import { answerSignal } from './scoring';
import type {
  CoachingQuestion,
  ReadingQuestion,
  ScaleOption,
  WbsAnswers,
  WbsResults,
} from './types';

export type SelectedCoachingQuestion = {
  questionKey: string;
  question: string;
  topic: string;
  triggerType: CoachingQuestion['triggerType'];
  /** What the trigger read, so a coach can see why this one is above that one. */
  strength: number;
  /** The plain reason it fired, assembled from stored labels rather than invented prose. */
  because: string;
};

const TIER_ORDER: Record<CoachingQuestion['triggerType'], number> = {
  combination: 0,
  answer: 1,
  zone: 2,
  section: 3,
};

/** Two topics are the same topic when they read the same, ignoring case and edge spaces. */
function topicKey(topic: string): string {
  return topic.trim().toLowerCase();
}

export function selectCoachingQuestions(input: {
  library: readonly CoachingQuestion[];
  questions: readonly ReadingQuestion[];
  scale: readonly ScaleOption[];
  answers: WbsAnswers;
  results: WbsResults;
  /** Display names, so "because" can name a section rather than a key. */
  sectionNames: Record<string, string>;
  zoneNames: Record<string, string>;
  elevatedMinPercent: number;
  strongMinSignal: number;
  maxQuestions: number;
}): SelectedCoachingQuestion[] {
  const percentOf = new Map(
    input.results.sections
      .filter((section) => section.possible > 0)
      .map((section) => [section.sectionKey, section.percent])
  );
  const primaryZone = input.results.zones[0] ?? null;
  const questionByRef = new Map(input.questions.map((q) => [q.questionRef, q]));

  const fired: SelectedCoachingQuestion[] = [];

  for (const entry of input.library.slice().sort((a, b) => a.position - b.position)) {
    const trigger = entry.trigger;

    if (trigger.type === 'section') {
      const percent = percentOf.get(trigger.section);
      const threshold = trigger.minPercent ?? input.elevatedMinPercent;
      if (percent === undefined || percent < threshold) continue;
      fired.push({
        questionKey: entry.questionKey,
        question: entry.question,
        topic: entry.topic,
        triggerType: entry.triggerType,
        strength: percent,
        because: `${input.sectionNames[trigger.section] ?? trigger.section} at ${percent}%`,
      });
      continue;
    }

    if (trigger.type === 'sections_at_or_above') {
      const threshold = trigger.minPercent ?? input.elevatedMinPercent;
      const values: number[] = [];
      let all = true;
      for (const sectionKey of trigger.sections) {
        const percent = percentOf.get(sectionKey);
        if (percent === undefined || percent < threshold) {
          all = false;
          break;
        }
        values.push(percent);
      }
      if (!all) continue;
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      fired.push({
        questionKey: entry.questionKey,
        question: entry.question,
        topic: entry.topic,
        triggerType: entry.triggerType,
        strength: mean,
        because: trigger.sections
          .map((key) => `${input.sectionNames[key] ?? key} at ${percentOf.get(key)}%`)
          .join(', '),
      });
      continue;
    }

    if (trigger.type === 'answer') {
      const threshold = trigger.minSignal ?? input.strongMinSignal;
      let best: { ref: string; signal: number } | null = null;
      for (const ref of trigger.questions) {
        const question = questionByRef.get(ref);
        if (!question) continue;
        const signal = answerSignal(question, input.scale, input.answers);
        if (signal === null || signal < threshold) continue;
        if (!best || signal > best.signal) best = { ref, signal };
      }
      if (!best) continue;
      const question = questionByRef.get(best.ref);
      fired.push({
        questionKey: entry.questionKey,
        question: entry.question,
        topic: entry.topic,
        triggerType: entry.triggerType,
        strength: best.signal,
        because: question
          ? `Answered ${best.signal} of 4 on "${question.prompt}"`
          : `Answered ${best.signal} of 4`,
      });
      continue;
    }

    // primary_zone
    if (!primaryZone || primaryZone.zoneKey !== trigger.zone || primaryZone.percent <= 0) continue;
    fired.push({
      questionKey: entry.questionKey,
      question: entry.question,
      topic: entry.topic,
      triggerType: entry.triggerType,
      strength: primaryZone.percent,
      because: `${input.zoneNames[primaryZone.zoneKey] ?? primaryZone.zoneKey} is the primary Zone at ${primaryZone.percent}%`,
    });
  }

  fired.sort((a, b) => {
    const tier = TIER_ORDER[a.triggerType] - TIER_ORDER[b.triggerType];
    if (tier !== 0) return tier;
    if (b.strength !== a.strength) return b.strength - a.strength;
    return a.questionKey.localeCompare(b.questionKey);
  });

  const seenTopics = new Set<string>();
  const collapsed: SelectedCoachingQuestion[] = [];
  for (const entry of fired) {
    const key = topicKey(entry.topic);
    if (seenTopics.has(key)) continue;
    seenTopics.add(key);
    collapsed.push(entry);
  }

  return collapsed.slice(0, Math.max(0, input.maxQuestions));
}
