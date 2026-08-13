/**
 * Root Movement, Level 1 — how long a session takes, and how a
 * prescription reads.
 *
 * Pure functions over already-loaded slot rows. A session's length is
 * DERIVED, never stored: the templates carry a target range the owner
 * decided, and the slots carry the actual prescriptions, and if editing
 * a slot moves the real total outside the stated range then the template
 * is wrong and the integrity test says so. Storing a computed duration
 * would let those two drift apart silently.
 */

import type { MovementSessionTemplateSlot } from '@mef/shared-types-contracts';

/**
 * What one repetition costs, in seconds, for the purpose of estimating a
 * session's length. Four seconds is a controlled tempo at the pace these
 * sessions are cued for, not a rushed one, which is the honest number to
 * use when the member is being told how long this will take.
 */
export const SECONDS_PER_REP = 4;

type SlotLike = Pick<
  MovementSessionTemplateSlot,
  'prescription_type' | 'prescription_seconds' | 'prescription_reps' | 'rest_seconds'
>;

/** Working time for one slot, excluding the rest that follows it. */
export function slotWorkSeconds(slot: SlotLike): number {
  if (slot.prescription_type === 'time') return slot.prescription_seconds ?? 0;
  return (slot.prescription_reps ?? 0) * SECONDS_PER_REP;
}

/** Work plus rest, across every slot. */
export function estimateSessionSeconds(slots: SlotLike[]): number {
  return slots.reduce((total, slot) => total + slotWorkSeconds(slot) + slot.rest_seconds, 0);
}

/**
 * The duration a member is shown, e.g. "10 to 12 min". The word "to"
 * rather than a dash: this app's copy carries no em dashes, and a hyphen
 * between two numbers reads as a minus sign often enough to be worth
 * avoiding.
 */
export function formatTargetDuration(minMinutes: number, maxMinutes: number): string {
  if (minMinutes === maxMinutes) return `${minMinutes} min`;
  return `${minMinutes} to ${maxMinutes} min`;
}

/** The prescription line under an exercise, e.g. "45 seconds" or "12 reps". */
export function formatPrescription(slot: SlotLike): string {
  if (slot.prescription_type === 'time') {
    const seconds = slot.prescription_seconds ?? 0;
    if (seconds >= 60 && seconds % 60 === 0) {
      const minutes = seconds / 60;
      return minutes === 1 ? '1 minute' : `${minutes} minutes`;
    }
    return `${seconds} seconds`;
  }
  const reps = slot.prescription_reps ?? 0;
  return reps === 1 ? '1 rep' : `${reps} reps`;
}

/** The rest line, when there is any rest at all after this slot. */
export function formatRest(slot: SlotLike): string | null {
  if (slot.rest_seconds <= 0) return null;
  return `${slot.rest_seconds} seconds rest`;
}
