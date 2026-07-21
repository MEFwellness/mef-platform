import { cache as reactCache } from 'react';
import { createClient } from './server';

/**
 * React's cache() only exists in the actual Next.js app-router runtime.
 * Its own bundler substitutes an RSC-compatible React build for anything
 * under app/, even though this project's own react dependency is stable
 * 18.3, which doesn't export cache() at all. Importing this same module
 * from a plain-Node context (the vitest integration suite, which resolves
 * the real node_modules/react) sees `cache` as undefined instead of a
 * function. Falling back to an identity wrapper there means "no
 * memoization" (each call just runs immediately) rather than a hard
 * crash; the test suite never depended on the memoization itself, only on
 * getCachedUser() correctly returning the signed-in user.
 */
const cache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  typeof reactCache === 'function' ? reactCache : (fn) => fn;

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
export const getCachedUser = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
