/**
 * THE SENTENCES. A pattern a coach would otherwise have to spot in a chart,
 * said out loud instead.
 *
 * "She has skipped Dead Bug 3 times." That is the whole idea. Everything in
 * this file turns a count into an English sentence a coach reads in one
 * pass, ranked so the thing that matters most is at the top, and nothing in
 * it asks a coach to decode a colour, a bar or a score.
 *
 * THE THRESHOLDS, and why each one is where it is.
 *
 *   ANY pain report                         one is enough. It is a safety
 *                                           fact and it leads the list.
 *   An exercise SKIPPED twice               once is a Tuesday. Twice is a
 *                                           pattern, and it is the same
 *                                           number the prompt asked for.
 *   An exercise REPORTED twice              two reports about one movement
 *                                           is her telling us twice.
 *   ANY too easy flag                       a progression decision the app
 *                                           deliberately did not make.
 *   ANY too difficult flag                  the other direction, same
 *                                           reasoning.
 *   Completion under half                   a fact about the program, not
 *                                           about her.
 *
 * The skip threshold here is TWO and lib/programs/feedback/reasons.ts's
 * REPEATED_SKIP_THRESHOLD is THREE, and that is deliberate rather than a
 * drift: three skips stop an exercise being OFFERED to her, which is a
 * decision made about her program without a person in the loop, and two
 * skips TELL A COACH, which is a person in the loop. Telling somebody
 * earlier than you act is the right way round.
 *
 * Pure functions over a ProgramSignals. No reads, no writes, no React.
 *
 * NO EM DASHES, per the house rule.
 */
import type { ProgramSignals } from './aggregate';

/** How many skips of one exercise a coach is told about. Lower than the threshold that stops offering it: see the header. */
export const INSIGHT_SKIP_THRESHOLD = 2;

/** How many reports about one exercise a coach is told about. */
export const INSIGHT_REPEAT_REPORT_THRESHOLD = 2;

/** Below this, the program itself is the thing to talk about. */
export const LOW_COMPLETION_PERCENT = 50;

/**
 * How loudly a coach should hear it. Not a severity score and never
 * rendered as a number: it orders the list and picks the accent colour.
 */
export type InsightTone = 'attention' | 'notice' | 'good';

export type InsightKind =
  | 'pain'
  | 'stopped'
  | 'repeated_skip'
  | 'repeated_report'
  | 'too_easy'
  | 'too_difficult'
  | 'low_completion'
  | 'strong_completion'
  | 'load_progress'
  | 'swap';

export interface SignalInsight {
  kind: InsightKind;
  tone: InsightTone;
  /** The sentence itself. Plain words, past tense, about what happened. */
  text: string;
  /** The exercise it is about, when it is about one. Lets the panel link it to the avoidance list. */
  externalId: string | null;
  exerciseName: string | null;
}

const TONE_ORDER: Record<InsightTone, number> = { attention: 0, notice: 1, good: 2 };

function times(count: number): string {
  return count === 1 ? 'once' : `${count} times`;
}

/**
 * Every pattern worth a sentence, most important first.
 *
 * Deliberately silent when there is nothing to say. A panel that always
 * lists six things trains a coach to stop reading it, so an empty list here
 * is a real answer and the screen renders one warm line instead.
 */
export function programInsights(signals: ProgramSignals): SignalInsight[] {
  const insights: SignalInsight[] = [];
  const her = 'She';

  // 1. Safety. Always first, and never collapsed into a count when there is
  //    only one, because "she reported pain on Bird Dog" is the sentence a
  //    coach needs and "1 pain report" is not.
  for (const report of signals.painReports) {
    insights.push({
      kind: 'pain',
      tone: 'attention',
      text:
        report.resolvedAt === null
          ? `${her} reported pain on ${report.exerciseName}${report.programWeek ? ` in week ${report.programWeek}` : ''}. This has not been reviewed yet.`
          : `${her} reported pain on ${report.exerciseName}${report.programWeek ? ` in week ${report.programWeek}` : ''}. You marked it reviewed.`,
      externalId: report.externalId,
      exerciseName: report.exerciseName,
    });
  }

  for (const stopped of signals.stoppedExercises) {
    // A stop that already produced a pain report is the same event said
    // twice, so only a stop with no report of its own gets a sentence.
    if (signals.painReports.some((report) => report.externalId === stopped.externalId)) continue;
    insights.push({
      kind: 'stopped',
      tone: 'attention',
      text: `${her} stopped ${stopped.exerciseName} mid session ${times(stopped.count)}.`,
      externalId: stopped.externalId,
      exerciseName: stopped.exerciseName,
    });
  }

  // 2. Repeated skips.
  for (const skip of signals.skippedExercises) {
    if (skip.count < INSIGHT_SKIP_THRESHOLD) continue;
    insights.push({
      kind: 'repeated_skip',
      tone: 'notice',
      text: `${her} has skipped ${skip.exerciseName} ${skip.count} times.`,
      externalId: skip.externalId,
      exerciseName: skip.exerciseName,
    });
  }

  // 3. An exercise she has reported more than once, whatever the reason.
  const reportCounts = new Map<string, { name: string; count: number; reasons: Set<string> }>();
  for (const flag of [...signals.otherReports, ...signals.tooDifficultFlags]) {
    const entry = reportCounts.get(flag.externalId) ?? {
      name: flag.exerciseName,
      count: 0,
      reasons: new Set<string>(),
    };
    entry.count += 1;
    reportCounts.set(flag.externalId, entry);
  }
  for (const [externalId, entry] of reportCounts) {
    if (entry.count < INSIGHT_REPEAT_REPORT_THRESHOLD) continue;
    insights.push({
      kind: 'repeated_report',
      tone: 'notice',
      text: `${her} has asked for something different on ${entry.name} ${entry.count} times.`,
      externalId,
      exerciseName: entry.name,
    });
  }

  // 4. Too difficult, once is enough to say.
  const difficultByExercise = new Map<string, { name: string; count: number }>();
  for (const flag of signals.tooDifficultFlags) {
    const entry = difficultByExercise.get(flag.externalId) ?? { name: flag.exerciseName, count: 0 };
    entry.count += 1;
    difficultByExercise.set(flag.externalId, entry);
  }
  for (const [externalId, entry] of difficultByExercise) {
    insights.push({
      kind: 'too_difficult',
      tone: 'notice',
      text: `${her} said ${entry.name} was too difficult${entry.count > 1 ? ` (${times(entry.count)})` : ''}.`,
      externalId,
      exerciseName: entry.name,
    });
  }

  // 5. Too easy. This is the one the load rules answer.
  const easyByExercise = new Map<string, { name: string; count: number }>();
  for (const flag of signals.tooEasyFlags) {
    const entry = easyByExercise.get(flag.externalId) ?? { name: flag.exerciseName, count: 0 };
    entry.count += 1;
    easyByExercise.set(flag.externalId, entry);
  }
  for (const [externalId, entry] of easyByExercise) {
    insights.push({
      kind: 'too_easy',
      tone: 'notice',
      text: `${her} said ${entry.name} felt too easy${entry.count > 1 ? ` (${times(entry.count)})` : ''}. She is waiting on you for more.`,
      externalId,
      exerciseName: entry.name,
    });
  }

  // 6. Swaps she made. Said once per swap, with her reason.
  for (const swap of signals.swaps) {
    insights.push({
      kind: 'swap',
      tone: 'notice',
      text: `${her} swapped ${swap.fromExerciseName} for ${swap.toExerciseName} because of ${swap.reasonLabel}.`,
      externalId: null,
      exerciseName: swap.toExerciseName,
    });
  }

  // 7. The program itself.
  if (signals.totalSessions > 0 && signals.completionPercent < LOW_COMPLETION_PERCENT) {
    insights.push({
      kind: 'low_completion',
      tone: 'attention',
      text: `${her} has finished ${signals.completedSessions} of ${signals.totalSessions} sessions so far.`,
      externalId: null,
      exerciseName: null,
    });
  } else if (signals.totalSessions > 0 && signals.completionPercent >= 80) {
    insights.push({
      kind: 'strong_completion',
      tone: 'good',
      text: `${her} has finished ${signals.completedSessions} of ${signals.totalSessions} sessions.`,
      externalId: null,
      exerciseName: null,
    });
  }

  // 8. Weight going up. The only good news the panel makes a point of.
  for (const trend of signals.loadTrends) {
    if (trend.points.length < 2 || trend.lastLoad <= trend.firstLoad) continue;
    insights.push({
      kind: 'load_progress',
      tone: 'good',
      text: `${her} has taken ${trend.exerciseName} from ${trend.firstLoad} to ${trend.lastLoad} ${trend.unit}${trend.perSide ? ' per side' : ''}.`,
      externalId: trend.externalId,
      exerciseName: trend.exerciseName,
    });
  }

  return insights.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}

/** The one line a panel shows when there is genuinely nothing to flag. Warm, and honest that it means nothing rather than everything. */
export const NO_INSIGHTS_YET =
  'Nothing to flag yet. Once she works through a few sessions, what she skips, swaps and lifts shows up here.';

/** What the load column says before she has logged anything. Said in the panel rather than left blank, because a blank column reads as broken. */
export const NO_LOGGED_WEIGHTS_YET =
  'She has not logged a weight yet. Load suggestions begin once she does, and never before.';
