/**
 * The one small thing offered at the end of Your Own Company.
 *
 * FIXED, NOT DERIVED, exactly as the six templates beside it are. This
 * experience produces no analysis of her answers, and building an
 * experiment out of them would be the quiet interpretation the brief rules
 * out.
 *
 * IT NEVER QUOTES HER, and on this template that restraint costs something
 * real, because she wrote a rewrite at question eight and the temptation to
 * print it here is obvious. A stored protocol is read on a dashboard card
 * days later and by her coach after that, and a sentence with her own words
 * baked into it would go stale the moment those words stopped being true.
 * So the ask names the rewrite she wrote without reproducing it, and which
 * rewrite it is stays hers.
 *
 * THE DAILY QUESTION COUNTS BOTH HALVES, AND SAYS SO. Catching the voice is
 * the thing being practised; answering it is what she is aiming at. A day
 * she noticed the sentence and had nothing to say back is a real day, so
 * the question says that out loud rather than leaving her to decide whether
 * it counts.
 *
 * PURE. No I/O. The caller writes the row through the existing
 * lifestyle_experiments machinery, which is what applies the two active
 * experiment cap and the read-time expiry after seven days.
 */

import { YOC_EXPERIMENT_DURATION_DAYS } from './constants';

export type YocExperimentOffer = {
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
export const YOC_EXPERIMENT_ACTION =
  'Catch the voice once a day and answer it with your rewrite, out loud or in your head.';

/** The daily card's question, approved verbatim. */
export const YOC_EXPERIMENT_DAILY_QUESTION =
  'Did you catch the voice today? Catching it counts even if the rewrite did not come.';

const HARD_DAY =
  'On a difficult day, catching it is the whole of it. Hearing the sentence as a sentence is the part that is being practised, and the answer can arrive late or not at all.';

export function buildYocExperiment(): YocExperimentOffer {
  return {
    title: 'The catch',
    action: YOC_EXPERIMENT_ACTION,
    hardDay: HARD_DAY,
    // One stored string, holding both versions, because the dashboard card
    // and the coach both read `protocol` and neither should be shown half
    // of an experiment.
    protocol: `${YOC_EXPERIMENT_ACTION} ${HARD_DAY}`,
    durationDays: YOC_EXPERIMENT_DURATION_DAYS,
  };
}
