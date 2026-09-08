/**
 * The SECOND use of the follow-up mechanism, and the first reuse of it.
 *
 * WHAT IT IS. When a member has a COMPLETED Owning Your Value sitting,
 * question nine of The Life You're Building runs in a version that quotes
 * back the sentence she asked Root to hold onto there, her intro carries
 * one extra line, her closing prints Then beside Now, and the sitting
 * records that it ran that way in
 * member_happiness_deep_dive_sessions.follow_up_source_experience_key (the
 * column migration 211 created and migration 214 first used).
 *
 * IT IS THE SAME MECHANISM, NOT A SECOND ONE. The rule migration 214's
 * build established is obeyed here exactly, and the shape of this module
 * deliberately mirrors lib/the-weight-of-yes/followUp.ts so the two can be
 * read side by side. What differs is only which template is followed and
 * which of its stored answers is quoted.
 *
 * WHEN THE CHECK HAPPENS: DELIVERY TIME, NOT ASSIGNMENT TIME. The question
 * is asked when she is actually about to be shown the intro, not when the
 * coach pressed Assign. A member who finishes Owning Your Value after the
 * assignment lands but before she opens this one therefore gets the
 * follow-up, which is the reading that matches what she has actually done.
 *
 * ONCE HER SITTING STARTS, THE MODE IS SETTLED AND NEVER REWRITES. The flag
 * is stamped on the row the first time she presses Continue, and from then
 * on the stored flag decides which version she sees. Nothing re-derives it
 * mid-sitting, so an Owning Your Value finished between her question three
 * and her question four can never change the sitting she is already inside.
 *
 * THERE IS NO PREREQUISITE ANYWHERE IN HERE. This module answers "did that
 * happen", never "is she allowed in". lib/the-life-youre-building/access.ts
 * is the gate and it has never heard of Owning Your Value. A member with no
 * completed sitting gets the standalone question nine and, everywhere she
 * can read, no evidence that another template exists.
 *
 * FAILS TO STANDALONE. A read that breaks resolves to null, which is the
 * standalone version. The cost of being wrong that way is a slightly less
 * personal question nine. The cost of being wrong the other way is a
 * sentence with a hole in it where her own words should be.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { listOyvSessions } from '../owning-your-value/data';
import { OYV_KEY } from '../owning-your-value/constants';
import { OYV_HELD_SENTENCE_KEY } from '../owning-your-value/questions';

/**
 * What an earlier sitting hands this one.
 *
 * `sourceExperienceKey` is what gets stored on the row, so the fact is
 * recorded rather than inferred later from whether a held sentence happens
 * to be readable today.
 */
export type TlybFollowUp = {
  /** The experience_key of the sitting this one follows. */
  sourceExperienceKey: string;
  /** Her stored held_sentence, verbatim, trimmed of surrounding whitespace only. */
  heldSentence: string;
};

/** The one earlier experience this template can follow, today. */
export const TLYB_FOLLOW_UP_SOURCE_KEY = OYV_KEY;

/**
 * Her completed Owning Your Value sittings, reduced to the two fields this
 * feature needs.
 *
 * Kept as its own tiny shape so the pure picker below can be tested without
 * a database and without importing that template's whole record type into
 * a test.
 */
export type FollowUpSourceSitting = {
  completedAt: string | null;
  heldSentence: string | null;
};

/**
 * The held sentence that was standing when a given sitting happened.
 *
 * WHY NOT SIMPLY THE LATEST. A coach can send Owning Your Value again, so a
 * member can have two completed sittings with two different held sentences.
 * The closing and the coach's card are showing "what she wrote then, beside
 * what she says now", and "then" means the sentence that was current when
 * she wrote this one, not whatever she has written since.
 *
 * `at` is the completion time of The Life You're Building sitting being
 * displayed. When it is null (an unfinished sitting, or a member who has
 * not started one), the newest held sentence is the right answer, because
 * that is the one standing right now.
 */
export function heldSentenceForSitting(
  sittings: readonly FollowUpSourceSitting[],
  at: string | null
): string | null {
  const usable = sittings
    .filter((sitting) => sitting.completedAt && (sitting.heldSentence ?? '').trim().length > 0)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

  const chosen = at
    ? (usable.find((sitting) => (sitting.completedAt ?? '') <= at) ?? usable[0])
    : usable[0];

  const sentence = (chosen?.heldSentence ?? '').trim();
  return sentence.length > 0 ? sentence : null;
}

/**
 * Whether this member's sitting runs as a follow-up right now.
 *
 * Reads her finished Owning Your Value sittings through that template's own
 * scoped accessor rather than a second query written here, so the
 * experience_key scoping that keeps eight templates apart on one table is
 * obeyed once, in the place that owns it.
 *
 * The held sentence is read from that template's own column first and from
 * its answer sheet only as a fallback, which covers a sitting finished
 * before the column existed.
 */
export async function resolveTlybFollowUp(
  supabase: SupabaseClient,
  memberId: string
): Promise<TlybFollowUp | null> {
  const sittings = await tlybFollowUpSourceSittings(supabase, memberId);
  const held = heldSentenceForSitting(sittings, null);
  if (!held) return null;
  return { sourceExperienceKey: TLYB_FOLLOW_UP_SOURCE_KEY, heldSentence: held };
}

/**
 * Her finished sittings of the template this one can follow, reduced to the
 * two fields anything here needs.
 *
 * THE ONE PLACE THE EARLIER TEMPLATE IS READ. Everything else in this
 * feature, including the route and the coach's own action, goes through
 * this module rather than importing that template directly, so nothing that
 * can reach a member's screen even has the earlier template's name in it.
 * The standalone-mentions-nothing proof
 * (tests/the-life-youre-building-follow-up.test.ts) reads those files and
 * would fail if one of them started importing it.
 *
 * A failed read is an empty list, which is the standalone answer, for the
 * reason this file's header gives.
 */
export async function tlybFollowUpSourceSittings(
  supabase: SupabaseClient,
  memberId: string,
  limit = 4
): Promise<FollowUpSourceSitting[]> {
  const read = await listOyvSessions(supabase, memberId, limit);
  if (!read.ok) return [];
  return read.records.map((record) => ({
    completedAt: record.completedAt,
    heldSentence: record.heldSentence ?? record.answers?.[OYV_HELD_SENTENCE_KEY] ?? null,
  }));
}

/**
 * The sentence a given stored sitting's closing prints as "Then", or null.
 *
 * COSTS NOTHING FOR A STANDALONE SITTING: a null flag short-circuits before
 * any query runs, so a member who never ran the follow-up pays exactly what
 * she paid before this template could follow anything.
 *
 * Read live rather than copied onto the row, because her words are stored
 * once, in the sitting she wrote them in.
 */
export async function tlybFollowUpAnswerForRow(
  supabase: SupabaseClient,
  memberId: string,
  storedKey: string | null,
  at: string | null
): Promise<string | null> {
  if (storedKey !== TLYB_FOLLOW_UP_SOURCE_KEY) return null;
  return heldSentenceForSitting(await tlybFollowUpSourceSittings(supabase, memberId), at);
}

/**
 * The follow-up for a sitting that already exists, decided by what the row
 * RECORDS rather than by what is true today.
 *
 * A row whose flag is null answered the standalone question nine, and no
 * later completion of Owning Your Value changes that. A row whose flag
 * names an experience gets its quote read back live, because her words are
 * stored once and never copied.
 */
export async function resolveTlybFollowUpForRow(
  supabase: SupabaseClient,
  memberId: string,
  storedKey: string | null
): Promise<TlybFollowUp | null> {
  if (storedKey !== TLYB_FOLLOW_UP_SOURCE_KEY) return null;
  return await resolveTlybFollowUp(supabase, memberId);
}
