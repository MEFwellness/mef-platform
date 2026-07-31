/**
 * Core Values Snapshot — Weekly Experiment pattern logic. Pure, no I/O.
 * Reads real stored daily-log rows (cvs_experiment_daily_logs, migration
 * 134) to answer "how many days in, and what does the pattern say" — the
 * day-3/day-7 follow-ups and the experiment page both read through this,
 * never hand-compute their own version of "is it day 7 yet."
 */

export type Day3Response = 'going_well' | 'mixed' | 'not_started';

export type CvsDailyLogRow = {
  localDate: string;
  completed: boolean | null;
  day3Response: Day3Response | null;
};

export function daysSinceStart(startDate: string, asOfLocalDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const asOf = new Date(`${asOfLocalDate}T00:00:00Z`);
  return Math.max(0, Math.round((asOf.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

export function isDay3Eligible(startDate: string, asOfLocalDate: string): boolean {
  return daysSinceStart(startDate, asOfLocalDate) >= 3;
}

export function isDay7Eligible(startDate: string, asOfLocalDate: string): boolean {
  return daysSinceStart(startDate, asOfLocalDate) >= 7;
}

export type Day7Pattern = 'mostly_yes' | 'patchy';

export type Day7Result = {
  yesCount: number;
  loggedCount: number;
  totalDays: number;
  pattern: Day7Pattern;
};

/** mostly-yes: theory confirmed, invite more. patchy (including never-logged): curious about what interfered, zero judgment. */
export function classifyDay7Pattern(logs: CvsDailyLogRow[], totalDays = 7): Day7Result {
  const yesCount = logs.filter((l) => l.completed === true).length;
  const loggedCount = logs.filter((l) => l.completed !== null).length;
  const pattern: Day7Pattern = yesCount >= Math.ceil(totalDays * 0.7) ? 'mostly_yes' : 'patchy';
  return { yesCount, loggedCount, totalDays, pattern };
}
