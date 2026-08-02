/**
 * Personal Reset Plan — the approved action library. Every string below is
 * used VERBATIM from the locked build brief: never rewritten, tightened,
 * or paraphrased. Centralized, typed content data (never scattered through
 * components), keyed by Signal x ActionTier, each with a normal and a
 * difficult-day version. Screen 4 draws the pair for the chosen focus and
 * her readiness pattern from here; the persistent daily card and the
 * closing screen both read the same entries, so the action a member
 * agreed to is always the exact text she saw.
 */

import type { Signal } from '../life-signal-check/constants';
import type { ActionTier } from './constants';

export type ResetPlanAction = { normal: string; difficult: string };

/** Shown above every action wherever an action is displayed. */
export const RESET_PLAN_PHILOSOPHY_LINE =
  "We're looking for something you can return to, even on difficult days.";

export const RESET_PLAN_ACTION_LIBRARY: Record<Signal, Record<ActionTier, ResetPlanAction>> = {
  energy: {
    ready_now: {
      normal: 'Give yourself a 5 minute walk outside within an hour of lunch. Daylight and easy movement, right when energy usually dips.',
      difficult: 'Step to a window or door and take 5 slow breaths looking outside. One minute is plenty.',
    },
    ready_if_small: {
      normal: 'After lunch, give yourself 2 minutes by a window or outside, moving or stretching easily.',
      difficult: 'Stand and take 3 slow breaths before you sit back down.',
    },
    still_deciding: {
      normal: 'See if you can catch the moment your energy dips today. Notice what was happening just before it changed. Then stand and roll your shoulders once.',
      difficult: 'Just catch the dip. Noticing it is enough.',
    },
    not_yet: {
      normal: 'When you find yourself wishing for more energy today, simply notice the moment. Nothing to change.',
      difficult: 'Right now, notice whether you feel drained or steady. That counts.',
    },
  },
  sleep: {
    ready_now: {
      normal: 'Give yourself five quiet minutes before sleep tonight. Dim the room, put your phone aside if it helps, and let your day begin to settle.',
      difficult: 'Once you are in bed, take 1 minute of slow breathing. Longer out than in.',
    },
    ready_if_small: {
      normal: 'Two minutes before you close your eyes tonight, lower the lights and let the day be finished.',
      difficult: 'Set your phone aside and close your eyes. That is the whole action.',
    },
    still_deciding: {
      normal: "Tonight, notice what your last 10 minutes before bed actually look like. Then one slow breath before the light goes out.",
      difficult: "Notice one thing about how tonight's bedtime went. No changes.",
    },
    not_yet: {
      normal: 'Each morning, notice how you slept, in whatever words come. Nothing to fix. Root is just gathering the picture with you.',
      difficult: 'Notice whether you woke up tired or rested. That is enough.',
    },
  },
  tension: {
    ready_now: {
      normal: 'At the end of your workday, take 5 minutes to downshift: slow breathing with a longer exhale, letting your jaw and shoulders soften.',
      difficult: 'Before you walk in the door, pause for 1 minute of slow breaths.',
    },
    ready_if_small: {
      normal: 'At the tensest point of your day, pause for 2 minutes: shoulders down, jaw unclenched, slow breaths.',
      difficult: 'One breath with a long exhale, shoulders down. Anywhere, anytime.',
    },
    still_deciding: {
      normal: 'Once today, notice where tension sits in your body and name the spot. Then soften just that spot for a few seconds.',
      difficult: 'Just name where the tension is. Nothing else.',
    },
    not_yet: {
      normal: 'Once today, notice one moment your body feels tight or braced. Nothing to change.',
      difficult: 'Notice right now: tight or at ease? That counts.',
    },
  },
  digestion: {
    ready_now: {
      normal: 'Choose one meal today to eat without rushing the first five minutes. Notice how your body feels before and after.',
      difficult: 'Three slow breaths before your first bite of any meal.',
    },
    ready_if_small: {
      normal: 'At one meal today, let the first two bites be unhurried. See what you taste when nothing is rushing you.',
      difficult: 'One unrushed first bite. That is the action.',
    },
    still_deciding: {
      normal: 'About an hour after a meal today, check in with your stomach. Notice what it is telling you.',
      difficult: 'Right now, notice how your stomach feels.',
    },
    not_yet: {
      normal: 'When your digestion gets your attention today, simply notice the moment. Nothing to change, no food rules.',
      difficult: 'Notice whether your stomach felt settled or unsettled today. Enough.',
    },
  },
  body: {
    ready_now: {
      normal: 'Spend five minutes moving in a way your body welcomes today. A walk, a stretch, slow circles, or simply breathing. Stay well inside comfort. If anything hurts, make it smaller or skip it.',
      difficult: 'One minute of whatever movement feels welcome, seated or standing. Comfort only.',
    },
    ready_if_small: {
      normal: 'Once today, change positions and give your body 2 minutes of movement it welcomes. Nothing should hurt.',
      difficult: 'One slow stretch that feels good. Done.',
    },
    still_deciding: {
      normal: 'See if you can catch what your body is asking for today, movement, rest, or warmth, and honor it for 30 seconds if it feels right.',
      difficult: 'Just notice what your body is asking for.',
    },
    not_yet: {
      normal: 'When your body speaks up today, comfortable or not, simply notice the moment. Nothing to change.',
      difficult: 'Notice how your body feels right now.',
    },
  },
  mind: {
    ready_now: {
      normal: 'Take five quiet minutes where nothing asks for your attention. Sit, walk slowly, or look out a window and let your thoughts settle.',
      difficult: 'One minute, eyes soft, three slow breaths. Let one thought pass without chasing it.',
    },
    ready_if_small: {
      normal: 'The next time you reach for your phone out of habit, give yourself 2 quiet minutes instead.',
      difficult: 'Three breaths before the next scroll or task.',
    },
    still_deciding: {
      normal: 'When your mind feels loudest today, name what it is chewing on. Then one slow breath.',
      difficult: 'Name what your mind is chewing on. One phrase.',
    },
    not_yet: {
      normal: 'When your mind will not settle today, simply notice the moment. Nothing to change.',
      difficult: 'Right now: loud mind or quiet? Just notice.',
    },
  },
};

export function resetPlanAction(signal: Signal, tier: ActionTier): ResetPlanAction {
  return RESET_PLAN_ACTION_LIBRARY[signal][tier];
}
