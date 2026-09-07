/**
 * The one small thing offered at the end of The Weight of Yes.
 *
 * FIXED, NOT DERIVED, exactly as the three templates beside it are. This
 * experience produces no analysis of her answers, and building an
 * experiment out of them would be the quiet interpretation the brief rules
 * out.
 *
 * IT NEVER QUOTES HER. A stored protocol is read on a dashboard card days
 * later and by her coach after that, and a sentence with her own words
 * baked into it would go stale the moment those words stopped being true.
 * "One small no" is the whole of the ask, and which no it is stays hers.
 *
 * THE DAILY QUESTION COUNTS BOTH ANSWERS. Swallowing one is not a failure
 * to report, it is the thing this experiment is actually about noticing,
 * so the question says so out loud rather than leaving her to guess whether
 * "Not today" is a bad mark.
 *
 * PURE. No I/O. The caller writes the row through the existing
 * lifestyle_experiments machinery, which is what applies the two active
 * experiment cap and the read-time expiry after seven days.
 */

import { TWOY_EXPERIMENT_DURATION_DAYS } from './constants';

export type TwoyExperimentOffer = {
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
export const TWOY_EXPERIMENT_ACTION = 'Say one small no this week. Any size counts.';

/** The daily card's question, approved verbatim. */
export const TWOY_EXPERIMENT_DAILY_QUESTION =
  'Did you say a no today, or swallow one? Either answer counts as noticing.';

const HARD_DAY =
  'On a difficult day, noticing the no you swallowed is the whole of the work. Nothing has to be said out loud for it to count as seen.';

export function buildTwoyExperiment(): TwoyExperimentOffer {
  return {
    title: 'One small no',
    action: TWOY_EXPERIMENT_ACTION,
    hardDay: HARD_DAY,
    // One stored string, holding both versions, because the dashboard card
    // and the coach both read `protocol` and neither should be shown half
    // of an experiment.
    protocol: `${TWOY_EXPERIMENT_ACTION} ${HARD_DAY}`,
    durationDays: TWOY_EXPERIMENT_DURATION_DAYS,
  };
}
