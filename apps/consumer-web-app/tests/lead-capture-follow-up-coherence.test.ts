/**
 * Mechanical version of "read the question aloud, then read each button —
 * is it a natural spoken answer?" — the exact class of bug reported live
 * on the Weight path (the agent asked a "gradual vs sudden" question while
 * the buttons on screen were topic labels for a completely different
 * question). followUpScript.ts is the single source of truth both
 * fallback.ts's question text and quickReplies.ts's buttons are read from;
 * this file proves that source is internally coherent, and that both
 * downstream consumers actually read from it rather than a stale copy.
 */
import { describe, it, expect } from 'vitest';
import { FOLLOW_UP_SCRIPT } from '../lib/lead-capture/followUpScript';
import { getQuickReplies } from '../lib/lead-capture/quickReplies';
import { buildFallbackFollowUp } from '../lib/lead-capture/fallback';
import type { LeadTopic } from '@mef/shared-types-contracts';

const STAGES = ['follow_up_1', 'follow_up_2', 'follow_up_3', 'follow_up_4'] as const;
const TOPICS: LeadTopic[] = ['pain', 'energy', 'sleep', 'stress', 'weight', 'general'];

describe('lead-capture follow-up script — question/button coherence', () => {
  STAGES.forEach((stage) => {
    TOPICS.forEach((topic) => {
      const entry = FOLLOW_UP_SCRIPT[stage][topic];

      it(`${stage}/${topic}: every button has a matching answerHint`, () => {
        expect(entry.answerHints).toHaveLength(entry.buttons.length);
      });

      it(`${stage}/${topic}: every answerHint actually appears in the question`, () => {
        entry.answerHints.forEach((hint, index) => {
          expect(
            entry.question.toLowerCase(),
            `button "${entry.buttons[index]}"'s hint "${hint}" should appear in the question: "${entry.question}"`
          ).toContain(hint.toLowerCase());
        });
      });

      it(`${stage}/${topic}: has 3-5 buttons, each non-empty`, () => {
        expect(entry.buttons.length).toBeGreaterThanOrEqual(3);
        expect(entry.buttons.length).toBeLessThanOrEqual(5);
        entry.buttons.forEach((button) => expect(button.trim().length).toBeGreaterThan(0));
      });
    });
  });

  it('quickReplies.getQuickReplies reads the exact same buttons as the script (no stale copy)', () => {
    STAGES.forEach((stage) => {
      TOPICS.forEach((topic) => {
        expect(getQuickReplies(stage, topic)).toEqual(FOLLOW_UP_SCRIPT[stage][topic].buttons);
      });
    });
  });

  it('fallback.buildFallbackFollowUp reads the exact same question as the script (no stale copy)', () => {
    STAGES.forEach((stage) => {
      TOPICS.forEach((topic) => {
        expect(buildFallbackFollowUp(stage, topic)).toBe(FOLLOW_UP_SCRIPT[stage][topic].question);
      });
    });
  });
});

describe('lead-capture follow-up script — the reported live bug is fixed', () => {
  it("weight's follow_up_1 buttons all answer the actual question asked, including the life-change option that was missing before", () => {
    const entry = FOLLOW_UP_SCRIPT.follow_up_1.weight;
    expect(entry.buttons).toContain('Since A Big Life Change');
    expect(entry.question.toLowerCase()).toContain('a big life change');
    // The bug's mismatched question ("gradual vs sudden") is a different
    // dimension entirely and must not be what ships.
    expect(entry.question.toLowerCase()).not.toContain('gradual');
    expect(entry.question.toLowerCase()).not.toContain('suddenly');
  });
});
