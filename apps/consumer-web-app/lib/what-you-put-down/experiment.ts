/**
 * The one small thing offered at the end of What You Put Down.
 *
 * FIXED, NOT DERIVED, exactly as the five templates beside it are. This
 * experience produces no analysis of her answers, and building an
 * experiment out of them would be the quiet interpretation the brief rules
 * out.
 *
 * IT NEVER QUOTES HER, and on this template that restraint costs something
 * real, because she wrote a doorway at question eight and the temptation to
 * print it here is obvious. A stored protocol is read on a dashboard card
 * days later and by her coach after that, and a sentence with her own words
 * baked into it would go stale the moment those words stopped being true.
 * So the ask names the doorway she wrote without reproducing it, and which
 * doorway it is stays hers.
 *
 * THE DAILY QUESTION COUNTS BOTH ANSWERS. A day she did not touch it is not
 * a failure to report, it is the thing the seven days are for noticing, so
 * neither button is the failure button.
 *
 * PURE. No I/O. The caller writes the row through the existing
 * lifestyle_experiments machinery, which is what applies the two active
 * experiment cap and the read-time expiry after seven days.
 */

import { WYPD_EXPERIMENT_DURATION_DAYS } from './constants';

export type WypdExperimentOffer = {
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
export const WYPD_EXPERIMENT_ACTION = 'Step through the doorway you named, once this week.';

/** The daily card's question, approved verbatim. */
export const WYPD_EXPERIMENT_DAILY_QUESTION =
  'Did you touch the thing you put down today, even for a minute?';

const HARD_DAY =
  'On a difficult day, one minute is the whole of it. A doorway is not a project, and standing in it briefly is still standing in it.';

export function buildWypdExperiment(): WypdExperimentOffer {
  return {
    title: 'The doorway',
    action: WYPD_EXPERIMENT_ACTION,
    hardDay: HARD_DAY,
    // One stored string, holding both versions, because the dashboard card
    // and the coach both read `protocol` and neither should be shown half
    // of an experiment.
    protocol: `${WYPD_EXPERIMENT_ACTION} ${HARD_DAY}`,
    durationDays: WYPD_EXPERIMENT_DURATION_DAYS,
  };
}
