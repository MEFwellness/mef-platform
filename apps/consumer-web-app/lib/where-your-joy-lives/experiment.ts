/**
 * The one small thing offered at the end of Where Your Joy Lives.
 *
 * FIXED, NOT DERIVED, exactly as Owning Your Value's is. This experience
 * produces no analysis of her answers, and building an experiment out of
 * them would be the quiet interpretation the brief rules out.
 *
 * IT POINTS AT HER OWN WRITING WITHOUT REPEATING IT. "Your twenty-minute
 * version" is question eight, and she is the one who wrote what that is.
 * The protocol never quotes her answer back, because a stored protocol is
 * read on a dashboard card weeks later and a sentence with her words baked
 * into it would go stale the moment her answer stopped being true.
 *
 * THE DAILY QUESTION NAMES THE ACTION. The dashboard card asks her the
 * thing the experiment asked her to do, in the same words, so a member on
 * day 4 never has to remember what she signed up for.
 *
 * PURE. No I/O. The caller writes the row through the existing
 * lifestyle_experiments machinery, which is what applies the two active
 * experiment cap and the read-time expiry after seven days.
 */

import { WYJL_EXPERIMENT_DURATION_DAYS } from './constants';

export type WyjlExperimentOffer = {
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
export const WYJL_EXPERIMENT_ACTION =
  'Do your twenty-minute version once this week. Put it in your calendar like an appointment that cannot be moved.';

/** The daily card's question, approved verbatim. It names the action rather than restating it in different words. */
export const WYJL_EXPERIMENT_DAILY_QUESTION =
  'Did you protect your twenty minutes today, or did the voice from question nine win?';

const HARD_DAY = 'On a difficult day, five minutes of it still counts as having gone.';

export function buildWyjlExperiment(): WyjlExperimentOffer {
  return {
    title: 'Your twenty minutes',
    action: WYJL_EXPERIMENT_ACTION,
    hardDay: HARD_DAY,
    // One stored string, holding both versions, because the dashboard card
    // and the coach both read `protocol` and neither should be shown half
    // of an experiment.
    protocol: `${WYJL_EXPERIMENT_ACTION} ${HARD_DAY}`,
    durationDays: WYJL_EXPERIMENT_DURATION_DAYS,
  };
}
