/**
 * The one genuinely new mechanism in this build: a template that can follow
 * on from an earlier one.
 *
 * WHAT IT IS. When a member has a COMPLETED The Giving Ledger sitting,
 * question one of The Weight of Yes runs in a version that quotes back the
 * deposit she named there, and the sitting records that it ran that way in
 * member_happiness_deep_dive_sessions.follow_up_source_experience_key (the
 * column migration 211 created and nothing has used until now).
 *
 * WHEN THE CHECK HAPPENS: DELIVERY TIME, NOT ASSIGNMENT TIME. The question
 * is asked when she is actually about to be shown question one, not when
 * the coach pressed Assign. A member who finishes The Giving Ledger after
 * the assignment lands but before she opens this one therefore gets the
 * follow-up, which is the reading that matches what she has actually done.
 *
 * ONCE SHE HAS WRITTEN A WORD, IT IS SETTLED. The flag is stamped on the
 * row the first time she presses Continue, and from then on the stored flag
 * decides which version she sees. Nothing re-derives it mid-sitting, so a
 * The Giving Ledger completed between her question three and her question
 * four can never change the question she already answered.
 *
 * THERE IS NO PREREQUISITE ANYWHERE IN HERE. This module answers "did that
 * happen", never "is she allowed in". lib/the-weight-of-yes/access.ts is
 * the gate and it has never heard of The Giving Ledger. A member with no
 * completed sitting gets the standalone question one and, everywhere she
 * can read, no evidence that another template exists.
 *
 * FAILS TO STANDALONE. A read that breaks resolves to null, which is the
 * standalone version. The cost of being wrong that way is a slightly less
 * personal question one. The cost of being wrong the other way is a
 * sentence with a hole in it where her own words should be.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { listTglSessions } from '../the-giving-ledger/data';
import { TGL_KEY } from '../the-giving-ledger/constants';
import { TGL_DEPOSIT_KEY } from '../the-giving-ledger/questions';

/**
 * What an earlier sitting hands this one.
 *
 * `sourceExperienceKey` is what gets stored on the row, so the fact is
 * recorded rather than inferred later from whether a deposit happens to be
 * readable today.
 */
export type TwoyFollowUp = {
  /** The experience_key of the sitting this one follows. */
  sourceExperienceKey: string;
  /** Her stored deposit_request, verbatim, trimmed of surrounding whitespace only. */
  depositRequest: string;
};

/** The one earlier experience this template can follow, today. */
export const TWOY_FOLLOW_UP_SOURCE_KEY = TGL_KEY;

/**
 * Her completed The Giving Ledger sittings, newest first, reduced to the
 * two fields this feature needs.
 *
 * Kept as its own tiny shape so the pure picker below can be tested
 * without a database and without importing that template's whole record
 * type into a test.
 */
export type FollowUpSourceSitting = {
  completedAt: string | null;
  depositRequest: string | null;
};

/**
 * The deposit that was standing when a given sitting happened.
 *
 * WHY NOT SIMPLY THE LATEST. A coach can send The Giving Ledger again, so a
 * member can have two completed sittings with two different deposits. The
 * coach's card is showing "what she said then, beside what she says now",
 * and "then" means the answer that was current when she wrote this one, not
 * whatever she has written since.
 *
 * `at` is the completion time of the The Weight of Yes sitting being
 * displayed. When it is null (an unfinished sitting), the newest deposit is
 * the right answer, because that is the one standing right now.
 */
export function depositForSitting(
  sittings: readonly FollowUpSourceSitting[],
  at: string | null
): string | null {
  const usable = sittings
    .filter((sitting) => sitting.completedAt && (sitting.depositRequest ?? '').trim().length > 0)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

  const chosen = at
    ? (usable.find((sitting) => (sitting.completedAt ?? '') <= at) ?? usable[0])
    : usable[0];

  const deposit = (chosen?.depositRequest ?? '').trim();
  return deposit.length > 0 ? deposit : null;
}

/**
 * Whether this member's question one runs as a follow-up right now.
 *
 * Reads her finished The Giving Ledger sittings through that template's own
 * scoped accessor rather than a second query written here, so the
 * experience_key scoping that keeps four templates apart on one table is
 * obeyed once, in the place that owns it.
 *
 * The deposit is read from that template's own column first and from its
 * answer sheet only as a fallback, which covers a sitting finished before
 * the column existed.
 */
export async function resolveTwoyFollowUp(
  supabase: SupabaseClient,
  memberId: string
): Promise<TwoyFollowUp | null> {
  const read = await listTglSessions(supabase, memberId, 4);
  if (!read.ok) return null;

  const sittings: FollowUpSourceSitting[] = read.records.map((record) => ({
    completedAt: record.completedAt,
    depositRequest: record.depositRequest ?? record.answers?.[TGL_DEPOSIT_KEY] ?? null,
  }));

  const deposit = depositForSitting(sittings, null);
  if (!deposit) return null;
  return { sourceExperienceKey: TWOY_FOLLOW_UP_SOURCE_KEY, depositRequest: deposit };
}

/**
 * The follow-up for a sitting that already exists, decided by what the row
 * RECORDS rather than by what is true today.
 *
 * A row whose flag is null answered the standalone question one, and no
 * later completion of The Giving Ledger changes that. A row whose flag
 * names an experience gets its quote read back live, because her words are
 * stored once and never copied.
 */
export async function resolveTwoyFollowUpForRow(
  supabase: SupabaseClient,
  memberId: string,
  storedKey: string | null
): Promise<TwoyFollowUp | null> {
  if (storedKey !== TWOY_FOLLOW_UP_SOURCE_KEY) return null;
  return await resolveTwoyFollowUp(supabase, memberId);
}
