/**
 * The one small thing offered at the end of The Giving Ledger.
 *
 * FIXED, NOT DERIVED, exactly as the two templates beside it are. This
 * experience produces no analysis of her answers, and building an
 * experiment out of them would be the quiet interpretation the brief rules
 * out.
 *
 * IT POINTS AT HER OWN WRITING WITHOUT REPEATING IT. "The deposit you
 * named" is question eight, and she is the one who wrote what that is. The
 * protocol never quotes her answer back, because a stored protocol is read
 * on a dashboard card weeks later and a sentence with her words baked into
 * it would go stale the moment her answer stopped being true. The coach
 * reads this column too.
 *
 * THE DAILY QUESTION IS ABOUT THE RETURN, NOT THE ASK. The ask happens once
 * in the week. What the seven days are actually for is noticing what comes
 * back, which is the thing a ledger like this has never had a column for,
 * so that is what the card asks her every evening.
 *
 * PURE. No I/O. The caller writes the row through the existing
 * lifestyle_experiments machinery, which is what applies the two active
 * experiment cap and the read-time expiry after seven days.
 */

import { TGL_EXPERIMENT_DURATION_DAYS } from './constants';

export type TglExperimentOffer = {
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
export const TGL_EXPERIMENT_ACTION =
  'Once this week, actually ask for the deposit you named. Say the words out loud to that person.';

/** The daily card's question, approved verbatim. */
export const TGL_EXPERIMENT_DAILY_QUESTION =
  'Did anything come back to you today? Name it, however small.';

const HARD_DAY =
  'On a difficult day, writing the sentence down and not sending it yet still counts as having found the words.';

export function buildTglExperiment(): TglExperimentOffer {
  return {
    title: 'The deposit you named',
    action: TGL_EXPERIMENT_ACTION,
    hardDay: HARD_DAY,
    // One stored string, holding both versions, because the dashboard card
    // and the coach both read `protocol` and neither should be shown half
    // of an experiment.
    protocol: `${TGL_EXPERIMENT_ACTION} ${HARD_DAY}`,
    durationDays: TGL_EXPERIMENT_DURATION_DAYS,
  };
}
