/**
 * Single source of truth for every scripted follow-up turn (stages
 * follow_up_1..follow_up_4) — the exact bug this file exists to make
 * structurally impossible: quick-reply buttons and the fallback question
 * text used to live in two entirely separate files
 * (quickReplies.ts's *_BY_TOPIC maps, fallback.ts's FOLLOW_UP_1..4 maps),
 * written independently with no shared source, so they could — and did —
 * drift apart (e.g. Weight's follow_up_1 buttons were written for a
 * "what's changed" question while the actual question asked about
 * "gradual vs sudden," a completely different dimension the buttons never
 * answered).
 *
 * Every entry below pairs one `question` with the exact `buttons` that are
 * direct, natural spoken answers to it, plus `answerHints` — one short
 * keyword/phrase per button, in the same order, that must appear in
 * `question` (asserted by tests/lead-capture-follow-up-coherence.test.ts).
 * That test is the mechanical version of "read the question aloud, then
 * read each button — is it a natural answer?": if a future edit changes a
 * question's wording without updating its buttons/hints to match (or vice
 * versa), the test fails instead of silently shipping a mismatch.
 *
 * fallback.ts's buildFallbackFollowUp reads `.question` from here.
 * quickReplies.ts's getQuickReplies reads `.buttons` from here.
 * prompt.ts's buildFollowUpUserPrompt reads `.buttons` from here too, and
 * hands them to the LLM as the fixed answer set the model's own (more
 * adaptive/personalized) phrasing must stay answerable by — the LLM can
 * still write its own sentence, but it's anchored to the same underlying
 * question this file defines, not free to wander into a different
 * dimension the buttons don't cover.
 */

import type { LeadConversationStage, LeadTopic } from '@mef/shared-types-contracts';

export interface FollowUpScriptEntry {
  question: string;
  buttons: string[];
  answerHints: string[];
}

const DURATION_BUTTONS = ['Weeks', 'Months', 'Years', 'As Long As I Can Remember'];
// A plain "how long" question is open enough that any duration phrase —
// including "As Long As I Can Remember" — is already a natural direct
// answer without needing to be individually spelled out (unlike
// follow_up_1's more specific either/or framings below); the shared hint
// just proves that open "how long" framing genuinely is what's asked.
const DURATION_HINTS = ['how long', 'how long', 'how long', 'how long'];

export const FOLLOW_UP_SCRIPT: Record<
  Extract<LeadConversationStage, 'follow_up_1' | 'follow_up_2' | 'follow_up_3' | 'follow_up_4'>,
  Record<LeadTopic, FollowUpScriptEntry>
> = {
  follow_up_1: {
    pain: {
      question: 'Where does it show up most: neck and shoulders, lower back, hips and knees, or all over?',
      buttons: ['Neck/Shoulders', 'Lower Back', 'Hips/Knees', 'All Over'],
      answerHints: ['neck and shoulders', 'lower back', 'hips and knees', 'all over'],
    },
    energy: {
      question: 'When does it hit hardest: morning, mid-afternoon, by evening, or pretty much all day?',
      buttons: ['Morning', 'Mid-Afternoon', 'By Evening', 'All Day'],
      answerHints: ['morning', 'mid-afternoon', 'by evening', 'all day'],
    },
    sleep: {
      question: "What's the main issue: falling asleep, staying asleep, waking up already tired, or a bit of everything?",
      buttons: ['Falling Asleep', 'Staying Asleep', 'Waking Up Tired', 'All Of It'],
      answerHints: ['falling asleep', 'staying asleep', 'waking up', 'everything'],
    },
    stress: {
      question: 'Where do you feel it most: a racing mind, tension in the body, a shorter fuse than usual, or all of the above?',
      buttons: ['Mind Racing', 'Body Tension', 'Short Fuse', 'All Of It'],
      answerHints: ['racing mind', 'tension in the body', 'shorter fuse', 'all of the above'],
    },
    weight: {
      question:
        "What's changed most: cravings and appetite, feeling stuck despite real effort, a shift after a big life change, or energy crashing hard?",
      buttons: ['Cravings/Appetite', 'Slow Despite Effort', 'Since A Big Life Change', 'Energy Crashes'],
      answerHints: ['cravings and appetite', 'stuck despite real effort', 'a big life change', 'energy crashing'],
    },
    general: {
      question: 'Is this mostly physical, mostly mental, tied to your sleep, or hard to say?',
      buttons: ['Physical', 'Mental', 'Sleep', 'Not Sure'],
      answerHints: ['physical', 'mental', 'sleep', 'hard to say'],
    },
  },
  follow_up_2: {
    pain: { question: 'How long has this been going on?', buttons: DURATION_BUTTONS, answerHints: DURATION_HINTS },
    energy: { question: 'How long has this been going on?', buttons: DURATION_BUTTONS, answerHints: DURATION_HINTS },
    sleep: { question: 'How long has this been going on?', buttons: DURATION_BUTTONS, answerHints: DURATION_HINTS },
    stress: { question: 'How long has this been building?', buttons: DURATION_BUTTONS, answerHints: DURATION_HINTS },
    weight: { question: 'How long has this been the story?', buttons: DURATION_BUTTONS, answerHints: DURATION_HINTS },
    general: { question: 'How long has this been going on?', buttons: DURATION_BUTTONS, answerHints: DURATION_HINTS },
  },
  follow_up_3: {
    pain: {
      question: 'Have you tried anything for it so far: stretching, a doctor, rest?',
      buttons: ['Stretching/Foam Rolling', 'Doctor Or PT', 'Rest', 'Nothing Yet'],
      answerHints: ['stretching', 'a doctor', 'rest', 'tried anything'],
    },
    energy: {
      question: 'Have you tried anything to turn it around: more caffeine, more sleep, supplements?',
      buttons: ['More Caffeine', 'More Sleep', 'Supplements', 'Nothing Yet'],
      answerHints: ['more caffeine', 'more sleep', 'supplements', 'tried anything'],
    },
    sleep: {
      question: 'Have you tried anything so far: a wind-down routine, cutting screens, melatonin?',
      buttons: ['Wind-Down Routine', 'Cutting Screens', 'Melatonin', 'Nothing Yet'],
      answerHints: ['wind-down routine', 'cutting screens', 'melatonin', 'tried anything'],
    },
    stress: {
      question: 'Have you tried anything to manage it: meditation, exercise, talking it out?',
      buttons: ['Meditation/Breathing', 'Exercise', 'Talking It Out', 'Nothing Yet'],
      answerHints: ['meditation', 'exercise', 'talking it out', 'tried anything'],
    },
    weight: {
      question: 'Have you tried anything so far: cutting calories, more cardio, tracking everything?',
      buttons: ['Cutting Calories', 'More Cardio', 'Tracking Everything', 'Nothing Yet'],
      answerHints: ['cutting calories', 'more cardio', 'tracking everything', 'tried anything'],
    },
    // 'general' has no established remedies to name (unlike pain's
    // stretching, sleep's melatonin, etc.) — all 4 buttons are
    // deliberately open/vague gradations of a yes/no/unsure answer, so
    // there's no distinguishing keyword to hint per-button; the shared
    // "tried anything" hint on all 4 still proves the open framing that
    // makes every one of them coherent is actually present in the
    // question.
    general: {
      question: 'Have you tried anything to address it so far?',
      buttons: ['A Few Things', 'Saw A Doctor', 'Not Sure', 'Nothing Yet'],
      answerHints: ['tried anything', 'tried anything', 'tried anything', 'tried anything'],
    },
  },
  follow_up_4: {
    pain: {
      question:
        'What would getting past this let you do again: move freely, sleep through the night, stop thinking about it, or just keep up with life?',
      buttons: ['Train/Move Freely Again', 'Sleep Through The Night', 'Not Think About It', 'Keep Up With Life'],
      answerHints: ['move freely', 'sleep through the night', 'stop thinking about it', 'keep up with life'],
    },
    energy: {
      question:
        'What would steady energy free you up to do: get through workdays, show up for family, work out again, or just feel like yourself?',
      buttons: ['Get Through Workdays', 'Show Up For Family', 'Work Out Again', 'Just Feel Like Myself'],
      answerHints: ['get through workdays', 'show up for family', 'work out again', 'feel like yourself'],
    },
    sleep: {
      question:
        'What would a real night of sleep change for you: sharper focus, a better mood, energy for workouts, or just feeling human again?',
      buttons: ['Sharper Focus', 'Better Mood', 'Energy For Workouts', 'Just Feeling Human Again'],
      answerHints: ['sharper focus', 'better mood', 'energy for workouts', 'feeling human again'],
    },
    stress: {
      question:
        'What would feeling less stressed free up: better sleep, more patience, more focus, or just some breathing room?',
      buttons: ['Better Sleep', 'More Patience', 'More Focus', 'Just Some Breathing Room'],
      answerHints: ['better sleep', 'more patience', 'more focus', 'breathing room'],
    },
    weight: {
      question:
        'What would you actually want out of this: feeling comfortable again, steady energy day to day, an end to the yo-yo, or just some real answers?',
      buttons: ['Feel Comfortable Again', 'More Energy Day To Day', 'Steady Not Yo-Yo', 'Just Some Answers'],
      answerHints: ['comfortable again', 'steady energy day to day', 'end to the yo-yo', 'real answers'],
    },
    general: {
      question: "What's the outcome you're actually after: feeling normal again, more energy, better sleep, or just some answers?",
      buttons: ['Feel Normal Again', 'More Energy', 'Better Sleep', 'Just Some Answers'],
      answerHints: ['normal again', 'more energy', 'better sleep', 'some answers'],
    },
  },
};
