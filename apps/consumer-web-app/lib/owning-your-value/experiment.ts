/**
 * The one small thing offered at the end of Owning Your Value.
 *
 * FIXED, NOT DERIVED. Unlike the Stress & Load Deep-Dive's experiment,
 * which is built from an option she picked, this one is the same for
 * everybody, because this experience produces no analysis of her answers
 * and building an experiment out of them would be exactly the kind of
 * quiet interpretation the brief rules out. One line a day, in her own
 * words, about something nobody else saw.
 *
 * THE DAILY QUESTION NAMES THE ACTION. The dashboard card asks her the
 * thing the experiment asked her to do, in the same words, so a member on
 * day 4 never has to remember what she signed up for.
 *
 * PURE. No I/O. The caller writes the row through the existing
 * lifestyle_experiments machinery, which is what applies the two active
 * experiment cap and the read-time expiry after seven days.
 */

import { OYV_EXPERIMENT_DURATION_DAYS } from './constants';

export type OyvExperimentOffer = {
  /** lifestyle_experiments.title. Short enough to read on a dashboard card. */
  title: string;
  /** The action, said plainly. This is the approved sentence, verbatim. */
  action: string;
  /** The version for a day when the first one is not going to happen. */
  hardDay: string;
  /** lifestyle_experiments.protocol, which is what the dashboard card and the coach both read. */
  protocol: string;
  durationDays: number;
};

/** The approved action sentence, on its own, so the offer screen, the stored protocol and the copy test all read one string. */
export const OYV_EXPERIMENT_ACTION =
  'Each evening, name one thing you did today that had value even though nobody saw it.';

/** The daily card's question. It names the action rather than restating it in different words. */
export const OYV_EXPERIMENT_DAILY_QUESTION =
  'Did you name one thing you did today that had value even though nobody saw it?';

const HARD_DAY = 'On a difficult day, one word for it, said in your head, still counts.';

export function buildOyvExperiment(): OyvExperimentOffer {
  return {
    title: 'One thing nobody saw',
    action: OYV_EXPERIMENT_ACTION,
    hardDay: HARD_DAY,
    // One stored string, holding both versions, because the dashboard card
    // and the coach both read `protocol` and neither should be shown half
    // of an experiment.
    protocol: `${OYV_EXPERIMENT_ACTION} ${HARD_DAY}`,
    durationDays: OYV_EXPERIMENT_DURATION_DAYS,
  };
}
