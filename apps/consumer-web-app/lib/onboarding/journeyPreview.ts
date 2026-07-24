import type { OnboardingAnswerInput } from '@mef/shared-types-contracts';
import { CONCERN_PHRASE, findPrimaryConcern } from './guestObservation';

type JourneyGroup = 'body_movement' | 'mind_energy' | 'lifestyle' | 'broad';

const GROUP_BY_CONCERN: Record<string, JourneyGroup> = {
  pain: 'body_movement',
  movement: 'body_movement',
  healthy_aging: 'body_movement',
  stress: 'mind_energy',
  energy: 'mind_energy',
  performance: 'mind_energy',
  sleep: 'mind_energy',
  digestion: 'lifestyle',
  weight: 'lifestyle',
  habits: 'lifestyle',
  general_optimization: 'broad',
  other: 'broad',
};

export interface JourneyChapter {
  title: string;
  body: string;
}

export interface JourneyPreviewContent {
  timeline: JourneyChapter;
  personalized: JourneyChapter;
  checkins: JourneyChapter;
  closing: string;
}

/**
 * One "next chapter" per concern group, each naming a real platform feature
 * (not a made-up one) and explaining why it matters given what the member
 * just shared — the personalization the "premium transition" brief asks
 * for, without a full 12-entry copy matrix per individual concern.
 */
const PERSONALIZED_CHAPTER: Record<JourneyGroup, (focus: string | null) => JourneyChapter> = {
  body_movement: (focus) => ({
    title: 'Movement & Posture Analysis',
    body: focus
      ? `Because you mentioned ${focus}, movement and posture patterns are where we'll look closely first — small mechanical patterns often explain more than they get credit for.`
      : "Movement and posture patterns are where we'll look closely first — small mechanical patterns often explain more than they get credit for.",
  }),
  mind_energy: (focus) => ({
    title: 'Pattern Recognition',
    body: focus
      ? `Because you mentioned ${focus}, we'll start watching how your stress, sleep, and energy move together over time — instead of looking at each one in isolation.`
      : "We'll start watching how your stress, sleep, and energy move together over time — instead of looking at each one in isolation.",
  }),
  lifestyle: (focus) => ({
    title: 'Lifestyle Insights',
    body: focus
      ? `Because you mentioned ${focus}, we'll start connecting what you eat, how you move, and how you feel — the everyday patterns behind it.`
      : "We'll start connecting what you eat, how you move, and how you feel — the everyday patterns behind how you feel.",
  }),
  broad: (focus) => ({
    title: 'Root Score',
    body: focus
      ? `Since you're focused on ${focus}, your Root Score will start pulling every domain — sleep, stress, movement, digestion — into one number you can actually watch move over time.`
      : 'Your Root Score pulls every domain — sleep, stress, movement, digestion — into one number you can actually watch move over time.',
  }),
};

/**
 * Builds the "next chapter" preview shown right after the guest's
 * observation (GuestObservationScreen) and before the account-creation
 * invite — a narrative look at what Rooted Reset becomes from here, tied
 * back to their own primary_concern rather than a generic feature list.
 */
export function buildJourneyPreview(answers: OnboardingAnswerInput[]): JourneyPreviewContent {
  const concern = findPrimaryConcern(answers);
  const group: JourneyGroup = concern ? (GROUP_BY_CONCERN[concern] ?? 'broad') : 'broad';
  const focus = concern ? (CONCERN_PHRASE[concern] ?? null) : null;

  return {
    timeline: {
      title: 'Your Wellness Timeline begins today',
      body: "Today's reflection becomes the very first entry — and what your Root Score starts learning from as you check in over the next few weeks.",
    },
    personalized: PERSONALIZED_CHAPTER[group](focus),
    checkins: {
      title: 'Daily Check-ins',
      body: 'A quick Morning Readiness and Evening Reflection each day is how the picture keeps building — a couple of minutes that turn one assessment into an ongoing conversation.',
    },
    closing:
      'From here, guided reassessments track what actually changes, your coach uses all of it to personalize your plan, and progress tracking brings the whole picture together in one place.',
  };
}
