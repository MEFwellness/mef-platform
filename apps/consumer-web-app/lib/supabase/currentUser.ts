import { createClient } from './server';
import { requestCache } from '../reactRequestCache';

/**
 * Request-memoized signed-in user lookup. A single dashboard load calls
 * roughly a dozen server actions, each of which independently calls
 * `supabase.auth.getUser()`, a real network round trip to Supabase Auth,
 * not a local JWT decode. React's `cache()` scopes its memoization to one
 * request (via AsyncLocalStorage under the hood), so every call within the
 * same render pass after the first returns the already-resolved result
 * instead of re-validating the same session token again. Safe precisely
 * because it never crosses requests: a different member's request gets
 * its own cache, and nothing here is held longer than one render.
 *
 * Callers still create their own Supabase client for their actual data
 * queries. This only replaces the redundant `auth.getUser()` call itself,
 * not client creation, which is cheap and stays scoped to each function.
 */
export const getCachedUser = requestCache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
