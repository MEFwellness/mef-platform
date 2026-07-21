/**
 * Turns a ProgramScheduleConfig (migration 82's coach_program_assignments.
 * schedule_config) into the concrete list of local dates (YYYY-MM-DD) each
 * assignment materializes one coach_assigned_workouts row for. Pure
 * function, no I/O — same "compute in app code over real config, not a
 * database trigger" convention as lib/movement/rules/ and
 * lib/movement-profile/reviewDetection.ts.
 *
 * A hard cap (MAX_OCCURRENCES) protects against a coach mistakenly
 * configuring an unbounded repeating schedule (e.g. no end date) from
 * generating an unbounded number of rows — "Efficient queries... Minimal
 * API requests" from the spec.
 */

import type { ProgramScheduleConfig } from '@mef/shared-types-contracts';

export const MAX_OCCURRENCES = 180;

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Returns ordered, de-duplicated local dates. Never throws — an invalid/empty config simply yields no occurrences. */
export function generateScheduledDates(config: ProgramScheduleConfig): string[] {
  const dates = new Set<string>();

  switch (config.type) {
    case 'single': {
      if (config.date) dates.add(config.date);
      break;
    }

    case 'weekly':
    case 'multiple_weeks': {
      if (!config.startDate || config.daysOfWeek.length === 0 || config.weeks < 1) break;
      const start = parseDateOnly(config.startDate);
      const weeks = Math.min(config.weeks, Math.ceil(MAX_OCCURRENCES / config.daysOfWeek.length));
      for (let week = 0; week < weeks; week++) {
        for (const dayOfWeek of config.daysOfWeek) {
          const weekStart = addDays(start, week * 7 - start.getUTCDay());
          const occurrence = addDays(weekStart, dayOfWeek);
          if (occurrence.getTime() >= parseDateOnly(config.startDate).getTime()) {
            dates.add(toDateOnly(occurrence));
          }
          if (dates.size >= MAX_OCCURRENCES) break;
        }
        if (dates.size >= MAX_OCCURRENCES) break;
      }
      break;
    }

    case 'specific_dates': {
      for (const date of config.dates.slice(0, MAX_OCCURRENCES)) dates.add(date);
      break;
    }

    case 'repeating': {
      if (!config.startDate || !config.endDate || config.everyNDays < 1) break;
      let cursor = parseDateOnly(config.startDate);
      const end = parseDateOnly(config.endDate);
      let guard = 0;
      while (cursor.getTime() <= end.getTime() && guard < MAX_OCCURRENCES) {
        dates.add(toDateOnly(cursor));
        cursor = addDays(cursor, config.everyNDays);
        guard++;
      }
      break;
    }
  }

  return Array.from(dates).sort();
}

/** Human-readable summary for the assignment list UI — e.g. "Every Mon, Wed, Fri for 4 weeks". */
export function describeSchedule(config: ProgramScheduleConfig): string {
  const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  switch (config.type) {
    case 'single':
      return `Single workout on ${config.date}`;
    case 'weekly':
    case 'multiple_weeks': {
      const days = config.daysOfWeek.map((d) => WEEKDAY_LABELS[d]).join(', ');
      return `Every ${days} for ${config.weeks} week${config.weeks === 1 ? '' : 's'}`;
    }
    case 'specific_dates':
      return `${config.dates.length} specific date${config.dates.length === 1 ? '' : 's'}`;
    case 'repeating':
      return `Every ${config.everyNDays} day${config.everyNDays === 1 ? '' : 's'} from ${config.startDate} to ${config.endDate}`;
    default:
      return 'Custom schedule';
  }
}
