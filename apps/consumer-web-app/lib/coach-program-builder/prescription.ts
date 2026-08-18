/**
 * How a prescription READS, in one place.
 *
 * The same stored fields are rendered on three surfaces: the coach's draft
 * review, the member's program screen, and the guided walk-through. They
 * must agree word for word, or a coach approves "2 x 30 seconds" and a
 * member is shown something else.
 *
 * Pure functions over already-loaded rows, no database and no React, so a
 * test can assert the exact sentence without rendering anything.
 *
 * Copy rules this file follows, same as the rest of the member-facing
 * product: no em dashes, no exclamation marks, no shorthand a member would
 * have to decode. "45 seconds", not "45s". The one piece of shorthand kept
 * is the tempo notation itself, which is labelled where it is shown.
 */

/** The fields any of the three surfaces might have. Deliberately loose: template rows, assigned-workout rows and an in-progress coach edit all satisfy it. */
export interface PrescriptionLike {
  sets?: number | null;
  reps?: string | null;
  rep_range_low?: number | null;
  rep_range_high?: number | null;
  hold_duration_seconds?: number | null;
  time_seconds?: number | null;
  tempo?: string | null;
  rest_seconds?: number | null;
}

function seconds(value: number): string {
  if (value >= 60 && value % 60 === 0) {
    const minutes = value / 60;
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }
  return value === 1 ? '1 second' : `${value} seconds`;
}

/** "2 sets" / "1 set", or null when no set count is recorded. */
export function formatSets(prescription: PrescriptionLike): string | null {
  const sets = prescription.sets;
  if (!sets || sets <= 0) return null;
  return sets === 1 ? '1 set' : `${sets} sets`;
}

/**
 * The work itself: a hold ("60 seconds") or reps ("10 reps"), whichever
 * this exercise carries. Null when neither is recorded, which is what an
 * older program written before real dosing existed looks like.
 */
export function formatWork(prescription: PrescriptionLike): string | null {
  const hold = prescription.hold_duration_seconds ?? prescription.time_seconds;
  if (hold && hold > 0) return seconds(hold);

  const reps = prescription.reps?.trim();
  if (reps) return /rep/i.test(reps) ? reps : `${reps} reps`;

  const low = prescription.rep_range_low;
  const high = prescription.rep_range_high;
  if (low && high) return low === high ? `${low} reps` : `${low} to ${high} reps`;
  if (low) return `${low} reps`;
  return null;
}

/** "45 seconds rest", or null when there is no rest recorded. */
export function formatRest(prescription: PrescriptionLike): string | null {
  const rest = prescription.rest_seconds;
  if (!rest || rest <= 0) return null;
  return `${seconds(rest)} rest`;
}

/** "Tempo 3-1-3", or null. */
export function formatTempo(prescription: PrescriptionLike): string | null {
  const tempo = prescription.tempo?.trim();
  if (!tempo) return null;
  return `Tempo ${tempo}`;
}

/**
 * The whole prescription on one line, e.g.
 * "2 sets of 10 reps · Tempo 3-1-3 · 45 seconds rest".
 *
 * Returns null when there is nothing at all to say, so a caller renders no
 * line rather than an empty one. Anything generated after this build
 * always has something to say.
 *
 * `includeRest: false` is for the guided player, which already prints the
 * rest as its own sentence under the prescription and would otherwise say
 * it twice.
 */
export function formatPrescriptionLine(
  prescription: PrescriptionLike,
  options: { includeRest?: boolean } = {}
): string | null {
  const includeRest = options.includeRest ?? true;
  const sets = formatSets(prescription);
  const work = formatWork(prescription);
  const parts: string[] = [];

  if (sets && work) parts.push(`${sets} of ${work}`);
  else if (work) parts.push(work);
  else if (sets) parts.push(sets);

  const tempo = formatTempo(prescription);
  if (tempo) parts.push(tempo);

  const rest = includeRest ? formatRest(prescription) : null;
  if (rest) parts.push(rest);

  return parts.length > 0 ? parts.join(' · ') : null;
}

/** The short form for a list row: the work and nothing else, e.g. "2 sets of 60 seconds". */
export function formatPrescriptionSummary(prescription: PrescriptionLike): string | null {
  const sets = formatSets(prescription);
  const work = formatWork(prescription);
  if (sets && work) return `${sets} of ${work}`;
  return work ?? sets;
}
