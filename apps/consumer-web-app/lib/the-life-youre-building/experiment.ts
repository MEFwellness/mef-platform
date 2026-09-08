/**
 * The one small thing offered at the end of The Life You're Building.
 *
 * FIXED, NOT DERIVED, exactly as the seven templates beside it are. This
 * experience produces no analysis of her answers, and building an
 * experiment out of them would be the quiet interpretation the brief rules
 * out.
 *
 * IT NEVER QUOTES HER, and on this template that restraint costs something
 * real, because she named a specific first stone at question eight and the
 * temptation to print it here is obvious. A stored protocol is read on a
 * dashboard card days later and by her coach after that, and a sentence
 * with her own words baked into it would go stale the moment those words
 * stopped being true. So the ask names the stone she named without
 * reproducing it, and which stone it is stays hers.
 *
 * THE DAILY QUESTION IS NOT THE ACTION, AND THAT IS DELIBERATE. The action
 * happens once in the week. The question is asked every evening and is
 * wider than the stone on purpose: a day that carried anything belonging to
 * the life she is building is a real day, whether or not it was the stone.
 * A daily question that only ever asked about the one act would be answered
 * "no" six times out of seven for a week that actually went well.
 *
 * PURE. No I/O. The caller writes the row through the existing
 * lifestyle_experiments machinery, which is what applies the two active
 * experiment cap and the read-time expiry after seven days.
 */

import { TLYB_EXPERIMENT_DURATION_DAYS } from './constants';

export type TlybExperimentOffer = {
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
export const TLYB_EXPERIMENT_ACTION = 'Lay the first stone you named, once this week.';

/** The daily card's question, approved verbatim. */
export const TLYB_EXPERIMENT_DAILY_QUESTION =
  'Did today have anything in it that belongs to the life you are building?';

const HARD_DAY =
  'On a difficult day, the honest answer is often no, and no is an answer. The week is seven days long and the stone only has to be laid once.';

export function buildTlybExperiment(): TlybExperimentOffer {
  return {
    title: 'The first stone',
    action: TLYB_EXPERIMENT_ACTION,
    hardDay: HARD_DAY,
    // One stored string, holding both versions, because the dashboard card
    // and the coach both read `protocol` and neither should be shown half
    // of an experiment.
    protocol: `${TLYB_EXPERIMENT_ACTION} ${HARD_DAY}`,
    durationDays: TLYB_EXPERIMENT_DURATION_DAYS,
  };
}
