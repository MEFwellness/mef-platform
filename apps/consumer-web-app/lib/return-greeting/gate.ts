/**
 * Pure gate for the No-Guilt Return greeting (Root Presence System,
 * Prompt 4, requirement 5) — split out from lib/coaching-engine/service.ts's
 * I/O so the threshold decision itself is directly unit-testable with no
 * database involved, same draft/service split every other engine in this
 * codebase uses (e.g. lib/intelligence/trendEngine.ts + service.ts).
 */

import { RETURN_GREETING_MIN_GAP_DAYS } from './copy';

/** `null` means the member has never checked in at all — never eligible, there's no "back" to return from. */
export function isEligibleForReturnGreeting(daysSinceLastCheckin: number | null): boolean {
  return daysSinceLastCheckin !== null && daysSinceLastCheckin >= RETURN_GREETING_MIN_GAP_DAYS;
}
