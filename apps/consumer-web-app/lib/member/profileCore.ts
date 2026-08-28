/**
 * The one `profiles` row every member screen needs, read once per request.
 *
 * WHY THIS EXISTS. Home alone read `profiles` twenty-four times on one
 * load. Most of those were the same two columns asked for by different
 * modules that had no way of knowing the answer was already in hand: the
 * page wanted `display_name, timezone`, `lib/time/memberToday.ts` wanted
 * `timezone`, the visibility layer wanted `timezone`, the priority engine
 * wanted `timezone`, the weekly review wanted `timezone`. Each was a real
 * network round trip for a row that cannot change during one render.
 *
 * This is that row, stated once. It is request-memoized (React's `cache`,
 * the same mechanism `lib/supabase/currentUser.ts` uses for the signed-in
 * user), so it is scoped to a single request and dies with it: a different
 * member's request gets its own read, and nothing here is held long enough
 * to go stale. It is a deduplicated read, not a cache.
 *
 * It keys on the member's own id, not on which client object the caller
 * happens to be holding, so it dedupes across modules that each built their
 * own client.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { readOnce } from '../data/readOnce';

export type MemberProfileCore = {
  /** Exactly as she typed it. Never a placeholder. */
  displayName: string | null;
  /** Her IANA zone as stored, or null when she has none on file. The fallback belongs to the caller, and `lib/time/memberToday.ts` is where it is stated. */
  timezone: string | null;
};

export async function memberProfileCore(
  supabase: SupabaseClient,
  memberId: string
): Promise<MemberProfileCore> {
  return readOnce(`memberProfile:${memberId}`, () => readProfileCore(supabase, memberId));
}

async function readProfileCore(
  supabase: SupabaseClient,
  memberId: string
): Promise<MemberProfileCore> {
  const { data } = await supabase
    .from('profiles')
    .select('display_name, timezone')
    .eq('id', memberId)
    .maybeSingle();
  return {
    displayName: (data?.display_name as string | null) ?? null,
    timezone: (data?.timezone as string | null) ?? null,
  };
}
