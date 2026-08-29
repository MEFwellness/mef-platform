/**
 * The one small thing, built from what SHE said restores her.
 *
 * NOT A TECHNIQUE ROOT PICKED. Every protocol below is one of her own Q9
 * answers turned into five minutes a day. The brief is explicit about this
 * and it is the difference between an experiment she recognises and a
 * generic breathing exercise: a member who said music restores her is
 * offered five minutes of music, not five minutes of box breathing.
 *
 * WHICH ONE. The first thing she picked, in the order she picked it. Q9's
 * hint says so out loud ("The first one you pick is the one Root builds
 * from"), because a rule the member cannot see is a rule that feels
 * arbitrary when the answer surprises her. If the first thing she picked
 * was "Other", her own words are what the protocol is built from, since at
 * that point her own words ARE her top restorative.
 *
 * EVERY ONE HAS A DIFFICULT-DAY VERSION. Not a smaller goal quietly
 * substituted for the real one: a second, explicitly named version for the
 * days when the first one is not going to happen. That is the established
 * pattern for this app's five minute experiments, and it is what stops a
 * missed day reading as a failed week.
 *
 * PURE. No I/O. The caller writes the row through the existing
 * lifestyle_experiments machinery.
 */

import { OTHER_VALUE, type StressLoadAnswers } from './questions';
import { STRESS_LOAD_EXPERIMENT_DURATION_DAYS } from './constants';

export type StressLoadExperimentOffer = {
  /** lifestyle_experiments.title. Short enough to read on a dashboard card. */
  title: string;
  /** The five minutes, said plainly. */
  action: string;
  /** The version for a day when the first one is not going to happen. */
  hardDay: string;
  /** lifestyle_experiments.protocol, which is what the dashboard card and the coach both read. */
  protocol: string;
  durationDays: number;
  /** Which Q9 answer this was built from, for the report and for the tests. */
  sourceValue: string;
};

type Protocol = { title: string; action: string; hardDay: string };

/**
 * One protocol per Q9 option. Each is a real five minutes, described as the
 * thing she named rather than as a wellness intervention.
 */
const PROTOCOL_BY_SOURCE: Record<string, Protocol> = {
  sleep: {
    title: 'Five minutes of wind-down',
    action:
      'For the next 7 days, give yourself five screen free minutes before bed, so your body gets a clear signal the day is actually over.',
    hardDay: 'On a difficult day, lights off two minutes earlier than usual still counts.',
  },
  alone: {
    title: 'Five minutes alone',
    action:
      'For the next 7 days, take five minutes a day with nobody asking you for anything. A closed door, a parked car, anywhere it fits.',
    hardDay: 'On a difficult day, two minutes in the bathroom with the door shut still counts.',
  },
  people: {
    title: 'Five minutes with someone',
    action:
      'For the next 7 days, spend five real minutes with one of the people who restore you. Not logistics, not the schedule, just the person.',
    hardDay: 'On a difficult day, one voice note to them still counts.',
  },
  movement: {
    title: 'Five minutes of moving',
    action:
      'For the next 7 days, move for five minutes because it restores you, not because it is training. Whatever your body actually wants that day.',
    hardDay: 'On a difficult day, walking to the end of the street and back still counts.',
  },
  outside: {
    title: 'Five minutes outside',
    action:
      'For the next 7 days, get outside for five minutes with no task attached. No phone call, no errand, just outside.',
    hardDay: 'On a difficult day, standing at an open door or a window still counts.',
  },
  prayer: {
    title: 'Five quiet minutes',
    action:
      'For the next 7 days, take five minutes of prayer or quiet. Same time each day if you can, so it does not have to be decided.',
    hardDay: 'On a difficult day, one minute before you get out of the car still counts.',
  },
  making: {
    title: 'Five minutes of making something',
    action:
      'For the next 7 days, spend five minutes making or creating something. It does not have to go anywhere or be finished.',
    hardDay: 'On a difficult day, five minutes of thinking about it on paper still counts.',
  },
  music: {
    title: 'Five minutes of music',
    action:
      'For the next 7 days, give five minutes to music with your full attention on it. Not as a background to something else.',
    hardDay: 'On a difficult day, one song on the way somewhere still counts.',
  },
  laughing: {
    title: 'Five minutes of laughing',
    action:
      'For the next 7 days, go and find five minutes of something that actually makes you laugh. You already know what it is.',
    hardDay: 'On a difficult day, one clip you have watched before still counts.',
  },
  nothing: {
    title: 'Five minutes of nothing',
    action:
      'For the next 7 days, do absolutely nothing for five minutes. Not scrolling. Not relaxing productively. Nothing.',
    hardDay: 'On a difficult day, sitting still for two minutes before you stand up again still counts.',
  },
};

/** Her own words, cleaned up enough to sit inside a sentence. */
function ownWords(text: string | null): string {
  const trimmed = (text ?? '').trim().replace(/[.]+$/, '');
  return trimmed;
}

/**
 * The offer, or null when there is nothing to build from.
 *
 * Null is only reachable for an answer set that never passed the
 * sanitizer, since Q9 requires at least one selection and requires words
 * whenever "Other" is ticked. It is returned rather than thrown so a
 * malformed historical row cannot take a page down.
 */
export function buildStressLoadExperiment(
  answers: StressLoadAnswers
): StressLoadExperimentOffer | null {
  const first = answers.recovery_sources.selected[0];
  if (!first) return null;

  if (first === OTHER_VALUE) {
    const words = ownWords(answers.recovery_sources.otherText);
    if (!words) return null;
    const protocol: Protocol = {
      title: 'Five minutes of what you named',
      action: `For the next 7 days, take five minutes a day for ${words}, the thing you said actually restores you.`,
      hardDay: `On a difficult day, two minutes of ${words} still counts.`,
    };
    return toOffer(protocol, first);
  }

  const protocol = PROTOCOL_BY_SOURCE[first];
  if (!protocol) return null;
  return toOffer(protocol, first);
}

function toOffer(protocol: Protocol, sourceValue: string): StressLoadExperimentOffer {
  return {
    title: protocol.title,
    action: protocol.action,
    hardDay: protocol.hardDay,
    // One stored string, holding both versions, because the dashboard card
    // and the coach both read `protocol` and neither should be shown half
    // of an experiment.
    protocol: `${protocol.action} ${protocol.hardDay}`,
    durationDays: STRESS_LOAD_EXPERIMENT_DURATION_DAYS,
    sourceValue,
  };
}
