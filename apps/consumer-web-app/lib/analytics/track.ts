/**
 * Product Analytics, the single write path.
 *
 * This is a thin, never-throwing wrapper over recordMemberEvent
 * (lib/events/service.ts), which is already the one and only place that
 * inserts into member_wellness_events. There is deliberately no second
 * pipeline, no third-party SDK, and no separate analytics table: migration
 * 146 widened the existing event_type constraint, exactly as that table's
 * own header comment says a new event source should.
 *
 * Two guarantees this file exists to provide:
 *
 *   1. It never throws and never rejects. Every call site is a side effect
 *      on a path the member is already waiting on (a check-in submit, a
 *      page view). A failed analytics write logs and returns; it can never
 *      break a page, a check-in, or a login. Callers that genuinely do not
 *      want to wait use `fireAndForget` below.
 *   2. It never writes health content. `sanitizeAnalyticsPayload` drops
 *      every key that is not on the known-neutral allowlist, so even a
 *      mistaken call site passing a check-in answer through cannot persist
 *      it. This is belt and braces on top of the per-field validation in
 *      lib/analytics/surfaces.ts, and it is the hard line the
 *      instrumentation brief draws for this health-adjacent app.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ProductAnalyticsEventType,
  ProductAnalyticsPayload,
} from '@mef/shared-types-contracts';
import { recordMemberEvent } from '../events/service';
import { memberTimezone } from '../time/memberToday';

/**
 * The only keys that may ever reach the database on an analytics payload.
 * Mirrors ProductAnalyticsPayload exactly. Anything else is dropped, not
 * an error: analytics must never break a caller, and silently discarding
 * an unexpected field is strictly safer than persisting it.
 */
const ALLOWED_PAYLOAD_KEYS = [
  'surface',
  'feature',
  'action',
  'method',
  'assessmentType',
  'scanType',
  'status',
  'entryType',
  'lockReason',
  'fromTier',
  'toTier',
  'term',
  'rule',
  'presentation',
  // Adaptive Coaching Direction (migration 150): which KIND of action was
  // delivered. A fixed slug from lib/coaching-direction/types.ts, never
  // the action's own wording and never its evidence.
  'actionType',
  // The Weekly Root Review (migration 151): whether the review was full or
  // thin, and WHICH question was answered. There is deliberately no key
  // here for the answer itself, which is why the answer physically cannot
  // reach an analytics row.
  'shape',
  'questionKey',
  // Adaptive Coaching Direction Part 3 (migration 152): three counts from
  // one grading pass, written as digit strings by
  // lib/coaching-direction/gradesService.ts's `countValue`. There is
  // deliberately no key for WHICH action type or thread was graded.
  'gradeCount',
  'landingCount',
  'deadCount',
  // Root Movement Level 1 (migration 153): which of the six fixed
  // sessions, which catalog exercise was skipped, and two counts. There
  // is deliberately no key for a reason, a rating or a note, so a
  // movement event physically cannot carry health content.
  'sessionKey',
  'exerciseId',
  'exerciseCount',
  'skipCount',
  // The public entry experience (migration 197): which registered source
  // code sent this member and which experience she came through. Two
  // slugs. There is deliberately no key here for her pattern, for any
  // answer she gave before she had an account, or for the email she may
  // have left, which is why a public_entry_claimed row physically cannot
  // carry any of them.
  'sourceCode',
  'experienceKey',
] as const;

/**
 * Longest a single payload value may be. Every legitimate value is a
 * short slug (the longest surface name is 19 characters, the longest
 * feature key is under 30), so anything past this is prose, which is the
 * shape health content would arrive in.
 */
const MAX_VALUE_LENGTH = 48;

export function sanitizeAnalyticsPayload(
  payload: ProductAnalyticsPayload | undefined
): ProductAnalyticsPayload {
  if (!payload) return {};
  const clean: Record<string, string | null> = {};
  for (const key of ALLOWED_PAYLOAD_KEYS) {
    const value = (payload as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (value === null) {
      clean[key] = null;
      continue;
    }
    if (typeof value !== 'string') continue;
    if (value.length > MAX_VALUE_LENGTH) continue;
    clean[key] = value;
  }
  return clean as ProductAnalyticsPayload;
}

/**
 * The member's own stored timezone, never a client-supplied one, same
 * source of truth app/actions/events.ts and app/actions/checkin.ts already
 * use for every occurred_at/local_date computation. Falls back to the same
 * default those call sites already fall back to, so an analytics event can
 * never fail to write just because a profile row is missing a timezone.
 */
export async function resolveMemberTimezone(
  supabase: SupabaseClient,
  memberId: string
): Promise<string> {
  try {
    return await memberTimezone(supabase, memberId);
  } catch {
    return 'America/New_York';
  }
}

export type TrackProductEventInput = {
  memberId: string;
  eventType: ProductAnalyticsEventType;
  timezone: string;
  payload?: ProductAnalyticsPayload;
  /** Defaults to 'member'. See trackProductEvent's own note on the one caller that does not. */
  source?: 'member' | 'coach' | 'system';
};

/**
 * Records one behavioral event. Resolves to true when the row was written
 * and false when it was not; never rejects, so `await` here is always safe
 * on a member-facing path.
 *
 * `source` defaults to 'member', because these are overwhelmingly records
 * of what the member did. The two events written by the database itself
 * (signup_completed, membership_tier_changed, migration 146) use 'system'
 * and never come through here.
 *
 * The one caller that passes 'coach' is Part 3's escalation resolve
 * (migration 152): the event belongs to the member's own stream, because
 * that is where the escalation it closes was recorded, but a coach did it
 * and a rollup must be able to tell that apart from something she did
 * herself.
 */
export async function trackProductEvent(
  supabase: SupabaseClient,
  input: TrackProductEventInput
): Promise<boolean> {
  try {
    const event = await recordMemberEvent(supabase, {
      memberId: input.memberId,
      eventType: input.eventType,
      timezone: input.timezone,
      payload: sanitizeAnalyticsPayload(input.payload),
      ...(input.source ? { source: input.source } : {}),
    });
    return event !== null;
  } catch (error) {
    console.error('trackProductEvent failed', input.eventType, error);
    return false;
  }
}

/**
 * For call sites that must not wait for the write at all, a page render,
 * or anything on the critical path of what the member is looking at.
 * Detaches the promise and swallows its result. trackProductEvent already
 * never rejects, so the extra `.catch` is defensive only.
 */
export function fireAndForget(promise: Promise<unknown>): void {
  void promise.catch(() => {
    /* analytics is never allowed to surface an error */
  });
}
