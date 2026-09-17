/**
 * What a folded section header says about itself, in one line and one dot.
 *
 * THE RULE THIS FILE OBEYS. A digest is arithmetic over values the page
 * has ALREADY fetched and the cards inside the section ALREADY print. It
 * issues no query, it reads no clock, and it invents no severity: every
 * gold dot below is triggered by a flag some existing card or service
 * already computed (an open alert, an escalated thread, an overdue
 * assignment, a pending review item, an unfinished reflection). If a
 * header and the card under it ever disagreed, the header would be the
 * reason a coach stopped opening sections at all.
 *
 * WHAT THE DOT IS NOT. It is not an evidence tier. "Early indication",
 * "emerging pattern" and "supported" describe how much is known about a
 * finding, and colouring them would turn a confidence scale into an alarm
 * scale. Those chips stay exactly as they are, uncoloured, inside the
 * cards.
 *
 * THREE COLOURS, AND ONLY THREE.
 *   green  nothing in this section is asking for anything.
 *   gold   something here is worth a look.
 *   grey   this section is empty, or it holds switches rather than news.
 */

/** The three, named once. */
export type SectionDot = 'green' | 'gold' | 'grey';

/** One folded header's line and dot. */
export type SectionDigest = {
  text: string;
  dot: SectionDot;
};

/** Joins the non-empty parts of a digest into one sentence, or falls back when every part was empty. */
function line(parts: (string | null)[], fallback: string): string {
  const kept = parts.filter((part): part is string => part !== null && part.length > 0);
  return kept.length > 0 ? kept.join(', ') : fallback;
}

/** "1 thing" / "2 things", so no digest ever prints "1 findings". */
export function plural(count: number, singular: string, pluralWord?: string): string {
  return `${count} ${count === 1 ? singular : (pluralWord ?? `${singular}s`)}`;
}

export type IntelligenceDigestInput = {
  /** Root Cause Signals' most-supported findings, the same array that panel maps over. */
  findings: number;
  /** Its cross-assessment correlations, the same array. */
  correlations: number;
  /** Coach alerts still open or acknowledged, which is exactly what getClientCoachAlerts returns. */
  openAlerts: number;
  /** Threads Root escalated to a coach, the same array the Root Has Flagged card renders. */
  escalations: number;
  /** Reassessments the signals view is already suggesting, unanswered by definition. */
  suggestedReassessments: number;
};

export function intelligenceDigest(input: IntelligenceDigestInput): SectionDigest {
  const { findings, correlations, openAlerts, escalations, suggestedReassessments } = input;
  const text = line(
    [
      findings > 0 ? plural(findings, 'finding') : null,
      correlations > 0 ? plural(correlations, 'correlation') : null,
      openAlerts > 0 ? plural(openAlerts, 'open alert') : null,
      escalations > 0 ? plural(escalations, 'flagged thread') : null,
      // Named, because it can be the ONLY reason this header went gold, and
      // a gold dot over the words "Nothing surfaced yet" is a header
      // arguing with itself. Live on 2026-09-06 it was exactly that.
      suggestedReassessments > 0
        ? `${plural(suggestedReassessments, 'reassessment')} suggested`
        : null,
    ],
    'Nothing surfaced yet'
  );
  const flagged = openAlerts > 0 || escalations > 0 || suggestedReassessments > 0;
  const empty = findings === 0 && correlations === 0 && !flagged;
  return { text, dot: flagged ? 'gold' : empty ? 'grey' : 'green' };
}

/**
 * The three groups the section now opens on, and nothing else
 * (2026-09-08).
 *
 * IT IS THE SAME OBJECT THE GROUPS THEMSELVES ARE DRAWN FROM,
 * `assessmentStatusCounts` over `groupAssessmentsByStatus`. That is the
 * point: the folded header used to count assignment ROWS while the list
 * below it counted questionnaires, so "1 pending" could sit above two
 * waiting rows the moment one questionnaire had been sent twice. One
 * source, one arithmetic, one answer.
 *
 * The sittings count that used to be in this line is gone with it. It
 * counted a different thing again (finished sittings across five cards),
 * and beside a Completed group it read as a second, disagreeing total.
 */
export type AssessmentsDigestInput = {
  notYetAssigned: number;
  waiting: number;
  completed: number;
  /** Still open, carrying a due day already behind her own today. The identical test behind the Overdue chip. */
  overdue: number;
};

export function assessmentsDigest(input: AssessmentsDigestInput): SectionDigest {
  const { notYetAssigned, waiting, completed, overdue } = input;
  const text = line(
    [
      waiting > 0 ? `${waiting} waiting` : null,
      completed > 0 ? `${completed} completed` : null,
      notYetAssigned > 0 ? `${notYetAssigned} not yet assigned` : null,
    ],
    'Nothing to send and nothing sent'
  );
  const empty = waiting === 0 && completed === 0;
  return { text, dot: overdue > 0 ? 'gold' : empty ? 'grey' : 'green' };
}

/**
 * The Health Context header (2026-09-12).
 *
 * THREE THINGS, IN THE ORDER A COACH CARES ABOUT THEM. Whether anything on
 * the intake is asking for follow-up, whether it has come back at all, and
 * whether it is still out. The gold dot is triggered by the same
 * deterministic rules the card itself prints
 * (lib/health-intake/safety.ts), so the header and the card can never
 * disagree about whether something needs a look.
 *
 * A WAITING INTAKE IS NOT GOLD. Gold means something inside is asking for
 * something, and an assignment she has not opened yet is asking HER, not
 * the coach. It is named in the line so it is not invisible, and the
 * Assessment Status block above is where an overdue one goes gold.
 */
export type HealthContextDigestInput = {
  /** Finished sittings of the intake. */
  completed: number;
  /** True when an assignment is still open and unfinished. */
  waiting: boolean;
  /** Rules that fired on the most recent finished sitting. */
  safetySignals: number;
  /** Co-occurrence prompts on the most recent finished sitting. */
  exploringPrompts: number;
};

export function healthContextDigest(input: HealthContextDigestInput): SectionDigest {
  const { completed, waiting, safetySignals, exploringPrompts } = input;
  const text = line(
    [
      safetySignals > 0 ? `${plural(safetySignals, 'answer')} to follow up` : null,
      completed > 0 ? `${plural(completed, 'intake')} completed` : null,
      exploringPrompts > 0 ? `${plural(exploringPrompts, 'question')} worth exploring` : null,
      waiting ? 'one waiting' : null,
    ],
    'Not sent yet'
  );
  const empty = completed === 0 && !waiting;
  return { text, dot: safetySignals > 0 ? 'gold' : empty ? 'grey' : 'green' };
}

export type ProgressDigestInput = {
  /** Days inside the window that carry a check-in row. */
  loggedDays: number;
  /** How many days that window is. Named in the line, never implied. */
  windowDays: number;
  /** Every check-in this client has, so an account with none reads as empty rather than as behind. */
  totalCheckins: number;
  /**
   * The page's own attention list already says whether today is missing.
   * Passed in rather than re-derived, so this header and the chips beside
   * her name are one decision.
   */
  flaggedNoCheckinToday: boolean;
};

export function progressDigest(input: ProgressDigestInput): SectionDigest {
  const { loggedDays, windowDays, totalCheckins, flaggedNoCheckinToday } = input;
  if (totalCheckins === 0) {
    return { text: 'No check-ins recorded yet', dot: 'grey' };
  }
  return {
    text: `Checked in on ${loggedDays} of the last ${windowDays} days`,
    dot: flaggedNoCheckinToday ? 'gold' : 'green',
  };
}

export type WeeklyReflectionDigestInput = {
  /** Weeks she has actually filled in, the same array the panel lists. */
  reflections: number;
  /**
   * Which of the five delivery states this week is in, straight from
   * resolveReflectionDeliveryStatus. Null when there is nothing to say,
   * which is what the action returns for a client with no tier and no
   * assignment.
   */
  statusKind: 'completed' | 'delivered' | 'not_delivered' | 'no_record' | 'unreadable' | null;
};

export function weeklyReflectionDigest(input: WeeklyReflectionDigestInput): SectionDigest {
  const { reflections, statusKind } = input;
  const text =
    reflections > 0 ? `${plural(reflections, 'week')} reflected on` : 'None recorded yet';
  // Waiting on HER is the one thing here a coach would want to see without
  // opening the section. An unreadable week is grey on purpose: a failed
  // read is not evidence of anything, and gold would claim it was.
  if (statusKind === 'delivered' || statusKind === 'not_delivered') {
    return { text, dot: 'gold' };
  }
  if (statusKind === null || statusKind === 'unreadable' || statusKind === 'no_record') {
    return { text, dot: reflections > 0 ? 'green' : 'grey' };
  }
  return { text, dot: 'green' };
}

export type CoachToolsDigestInput = {
  notes: number;
  feedItems: number;
  /** Movement Profile review items still marked pending, the same filter that panel counts. */
  pendingReviewItems: number;
  /** Conversation handoffs still pending, the same status the Conversation panel shows. */
  pendingHandoffs: number;
};

export function coachToolsDigest(input: CoachToolsDigestInput): SectionDigest {
  const { notes, feedItems, pendingReviewItems, pendingHandoffs } = input;
  const text = line(
    [
      notes > 0 ? plural(notes, 'note') : 'no notes',
      feedItems > 0 ? plural(feedItems, 'feed item') : 'feed empty',
      pendingReviewItems > 0 ? plural(pendingReviewItems, 'movement review') : null,
    ],
    'Nothing here yet'
  );
  const flagged = pendingReviewItems > 0 || pendingHandoffs > 0;
  const empty = notes === 0 && feedItems === 0 && !flagged;
  return { text, dot: flagged ? 'gold' : empty ? 'grey' : 'green' };
}

export type AppControlsDigestInput = {
  /** The one value that both decides whether a Water card exists for her and sets the coach's toggle. */
  waterTracked: boolean;
  hiddenFeatures: number;
  totalFeatures: number;
};

/**
 * Switches, so the dot is always grey.
 *
 * A hidden feature is a decision that has been made, not a thing waiting
 * to be done, and a gold dot on a section whose contents are all working
 * as configured is the kind of noise that teaches a coach to ignore gold.
 */
export function appControlsDigest(input: AppControlsDigestInput): SectionDigest {
  const { waterTracked, hiddenFeatures, totalFeatures } = input;
  const water = waterTracked ? 'Water tracking on' : 'Water tracking off';
  const features =
    totalFeatures === 0
      ? null
      : hiddenFeatures === 0
        ? `all ${totalFeatures} features shown`
        : `${hiddenFeatures} of ${totalFeatures} features hidden`;
  return { text: line([water, features], water), dot: 'grey' };
}

/**
 * The Signals header (2026-09-15).
 *
 * Two counts and nothing else: how many standardized signals this member
 * has, and how many dated entries sit behind them. Both are read straight
 * off the view the card itself renders, so the header and the list under
 * it count the same thing by construction.
 *
 * THE DOT IS NEVER GOLD. A signal is a thing her body said, not a thing
 * asking for anything, and nothing in this library ranks, grades or
 * escalates one. Colouring a count of symptoms would turn a record into an
 * alarm scale, which is exactly what the dot is documented at the top of
 * this file as not being. Grey when she has none, green when she has some.
 */
export type SignalsDigestInput = {
  /** Distinct standardized signals, the same number the card's groups add up to. */
  signals: number;
  /** Dated entries behind them, including every older one a timeline holds. */
  entries: number;
};

export function signalsDigest(input: SignalsDigestInput): SectionDigest {
  const { signals, entries } = input;
  if (signals === 0) return { text: 'Nothing recorded yet', dot: 'grey' };
  // LITERAL ABOUT WHAT IT COUNTS: distinct signals, and the dated entries
  // behind them.
  return {
    text: line(
      [
        plural(signals, 'distinct signal'),
        entries > signals ? `${plural(entries, 'dated entry', 'dated entries')}` : null,
      ],
      plural(signals, 'distinct signal')
    ),
    dot: 'green',
  };
}

/**
 * WHOLE-BODY PATTERNS (2026-09-15). The matching engine's own section.
 *
 * ITS DOT IS NEVER GOLD, for the same reason the Signals dot is never
 * gold and a stronger reason besides. A pattern is a thing a coach has
 * asked to be shown so she can REVIEW it, not a thing asking for
 * anything, and colouring one would turn "worth exploring" into an alarm
 * on the folded header before she has read a word of her own text. The
 * one exception is the case that is genuinely not about a pattern at all:
 * a card the red flag system has withheld, which is safety, and safety is
 * what the gold dot is for everywhere else on this page.
 */
export type PatternsDigestInput = {
  /** Cards showing a pattern, the same number the card itself renders. */
  patterns: number;
  /** Cards the red flag system withheld, the same number again. */
  suppressed: number;
  /** Definitions switched on in the library, so an empty section can say why. */
  activeRelationships: number;
};

export function patternsDigest(input: PatternsDigestInput): SectionDigest {
  const { patterns, suppressed, activeRelationships } = input;
  if (suppressed > 0) {
    return {
      text: line(
        [
          patterns > 0 ? plural(patterns, 'pattern') : null,
          `${plural(suppressed, 'entry', 'entries')} held back for safety`,
        ],
        `${plural(suppressed, 'entry', 'entries')} held back for safety`
      ),
      dot: 'gold',
    };
  }
  if (patterns === 0) {
    return {
      text: activeRelationships === 0 ? 'No pattern is active yet' : 'Nothing to review',
      dot: 'grey',
    };
  }
  // THE PLURAL IS SPELLED OUT, because the helper appends 's' to whatever
  // it is given and "2 pattern to reviews" is what that produces for a
  // phrase. Found on the live coach header during the 2026-09-15 run.
  return { text: plural(patterns, 'pattern to review', 'patterns to review'), dot: 'green' };
}

/**
 * ROOT NOTICED. The complaint-driven section's folded header.
 *
 * ITS DOT IS NEVER GOLD EITHER, and for the Signals section's own reason:
 * a finding is a thing Root brought forward for the coach to REVIEW, not a
 * thing asking for anything, and colouring a count of a client's reported
 * symptoms would turn a record into an alarm scale on a header she has not
 * opened yet.
 *
 * The one exception is the case that is genuinely not about a finding at
 * all: one the red flag system withheld, which is safety, and safety is
 * what the gold dot is for everywhere else on this page.
 */
export type RootNoticedDigestInput = {
  /** Findings showing something, the same number the card itself renders. */
  findings: number;
  /** Findings the red flag system withheld, the same number again. */
  suppressed: number;
  /** Complaints Root has read for this client. */
  complaints: number;
  /** Entries switched on in the Association Map, so an empty section can say why. */
  mapEntries: number;
  /** True when Root has read a completed Body Systems Survey for this client. */
  questionnaireRead?: boolean;
};

export function rootNoticedDigest(input: RootNoticedDigestInput): SectionDigest {
  const { findings, suppressed, complaints, mapEntries } = input;
  const heardSomething = complaints > 0 || input.questionnaireRead === true;
  if (suppressed > 0) {
    return {
      text: line(
        [
          findings > 0 ? rootCheckedConnections(findings) : null,
          `${plural(suppressed, 'report', 'reports')} held back for safety`,
        ],
        `${plural(suppressed, 'report', 'reports')} held back for safety`
      ),
      dot: 'gold',
    };
  }
  if (findings === 0) {
    if (mapEntries === 0) return { text: 'No association map entry is active yet', dot: 'grey' };
    if (!heardSomething) return { text: 'Nothing reported yet', dot: 'grey' };
    return { text: 'Nothing to review', dot: 'grey' };
  }
  // WHAT IT COUNTS, AND NOTHING MORE: the association matches Root checked.
  // Never "to review", because a coach may already have reviewed or
  // dismissed the cards built on them, and those are counted in the
  // briefing on their own.
  return { text: rootCheckedConnections(findings), dot: 'green' };
}

/** "Root checked 17 connections". */
export function rootCheckedConnections(count: number): string {
  return `Root checked ${plural(count, 'connection')}`;
}
