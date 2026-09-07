/**
 * The one small thing offered at the end of Being Seen.
 *
 * FIXED, NOT DERIVED, exactly as the four templates beside it are. This
 * experience produces no analysis of her answers, and building an
 * experiment out of them would be the quiet interpretation the brief rules
 * out.
 *
 * IT NEVER QUOTES HER. A stored protocol is read on a dashboard card days
 * later and by her coach after that, and a sentence with her own words
 * baked into it would go stale the moment those words stopped being true.
 * The ask is one uninvited piece of herself, and which piece it is stays
 * hers.
 *
 * THE DAILY QUESTION COUNTS BOTH ANSWERS. Keeping something in is not a
 * failure to report, it is the thing this experiment is actually about
 * noticing, so the question says so out loud rather than leaving her to
 * guess whether "Not today" is a bad mark.
 *
 * PURE. No I/O. The caller writes the row through the existing
 * lifestyle_experiments machinery, which is what applies the two active
 * experiment cap and the read-time expiry after seven days.
 */

import { BSN_EXPERIMENT_DURATION_DAYS } from './constants';

export type BsnExperimentOffer = {
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
export const BSN_EXPERIMENT_ACTION =
  'Offer one uninvited piece of yourself this week: an opinion, a preference, a story, without being asked first.';

/** The daily card's question, approved verbatim. */
export const BSN_EXPERIMENT_DAILY_QUESTION =
  'Did you show something today you would usually keep in? Noticing counts either way.';

const HARD_DAY =
  'On a difficult day, noticing the thing you kept in is the whole of the work. Nothing has to be said out loud for it to count as seen.';

export function buildBsnExperiment(): BsnExperimentOffer {
  return {
    title: 'One uninvited thing',
    action: BSN_EXPERIMENT_ACTION,
    hardDay: HARD_DAY,
    // One stored string, holding both versions, because the dashboard card
    // and the coach both read `protocol` and neither should be shown half
    // of an experiment.
    protocol: `${BSN_EXPERIMENT_ACTION} ${HARD_DAY}`,
    durationDays: BSN_EXPERIMENT_DURATION_DAYS,
  };
}
