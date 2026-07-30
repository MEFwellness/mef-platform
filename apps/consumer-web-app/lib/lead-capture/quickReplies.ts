/**
 * The 3-5 tappable quick-reply buttons offered alongside each follow-up
 * question — purely presentational data, decided by topic + stage, never
 * by the LLM. The free-text input stays visible and usable regardless of
 * what's returned here (public/lead-widget.js never hides it); a button
 * tap and a typed answer are handled identically by every downstream
 * consumer (flow.ts's classification, pattern.ts's rules), since both are
 * just the plain text of the button's own label.
 *
 * follow_up_2 (how long) is topic-agnostic — duration reads the same
 * regardless of what the concern is — so it has a single shared set rather
 * than one per topic. insight_capture has no buttons: the reply there is a
 * name + email, which isn't a multiple-choice answer.
 */

import type { LeadConversationStage, LeadTopic } from '@mef/shared-types-contracts';

const FOLLOW_UP_1_BY_TOPIC: Record<LeadTopic, string[]> = {
  pain: ['Neck/Shoulders', 'Lower Back', 'Hips/Knees', 'All Over'],
  energy: ['Morning', 'Mid-Afternoon', 'By Evening', 'All Day'],
  sleep: ['Falling Asleep', 'Staying Asleep', 'Waking Up Tired', 'All Of It'],
  stress: ['Mind Racing', 'Body Tension', 'Short Fuse', 'All Of It'],
  weight: ['Cravings/Appetite', 'Slow Despite Effort', 'Since A Big Life Change', 'Energy Crashes'],
  general: ['Physical', 'Mental', 'Sleep', 'Not Sure'],
};

const FOLLOW_UP_2_DURATION = ['Weeks', 'Months', 'Years', 'As Long As I Can Remember'];

const FOLLOW_UP_3_BY_TOPIC: Record<LeadTopic, string[]> = {
  pain: ['Stretching/Foam Rolling', 'Doctor Or PT', 'Rest', 'Nothing Yet'],
  energy: ['More Caffeine', 'More Sleep', 'Supplements', 'Nothing Yet'],
  sleep: ['Wind-Down Routine', 'Cutting Screens', 'Melatonin', 'Nothing Yet'],
  stress: ['Meditation/Breathing', 'Exercise', 'Talking It Out', 'Nothing Yet'],
  weight: ['Cutting Calories', 'More Cardio', 'Tracking Everything', 'Nothing Yet'],
  general: ['A Few Things', 'Saw A Doctor', 'Not Sure', 'Nothing Yet'],
};

const FOLLOW_UP_4_BY_TOPIC: Record<LeadTopic, string[]> = {
  pain: ['Train/Move Freely Again', 'Sleep Through The Night', 'Not Think About It', 'Keep Up With Life'],
  energy: ['Get Through Workdays', 'Show Up For Family', 'Work Out Again', 'Just Feel Like Myself'],
  sleep: ['Sharper Focus', 'Better Mood', 'Energy For Workouts', 'Just Feeling Human Again'],
  stress: ['Better Sleep', 'More Patience', 'More Focus', 'Just Some Breathing Room'],
  weight: ['Feel Comfortable Again', 'More Energy Day To Day', 'Steady Not Yo-Yo', 'Just Some Answers'],
  general: ['Feel Normal Again', 'More Energy', 'Better Sleep', 'Just Some Answers'],
};

/** Returns null when a stage has no buttons at all (opening's four topics are handled by the caller, since there's no incoming topic yet). */
export function getQuickReplies(
  stage: LeadConversationStage,
  topic: LeadTopic
): string[] | null {
  switch (stage) {
    case 'follow_up_1':
      return FOLLOW_UP_1_BY_TOPIC[topic];
    case 'follow_up_2':
      return FOLLOW_UP_2_DURATION;
    case 'follow_up_3':
      return FOLLOW_UP_3_BY_TOPIC[topic];
    case 'follow_up_4':
      return FOLLOW_UP_4_BY_TOPIC[topic];
    default:
      return null;
  }
}
