import { cache as reactCache } from 'react';

/**
 * React's cache() only exists in the actual Next.js app-router runtime. Its
 * own bundler substitutes an RSC-compatible React build for anything under
 * app/, even though this project's own react dependency is stable 18.3,
 * which doesn't export cache() at all. Importing this from a plain-Node
 * context (the vitest integration suite, which resolves the real
 * node_modules/react) sees `cache` as undefined instead of a function.
 * Falling back to an identity wrapper there means "no memoization" (each
 * call just runs immediately) rather than a hard crash.
 *
 * Same guard lib/supabase/currentUser.ts's getCachedUser already used —
 * pulled out here so every request-scoped memoization in the app (the
 * signed-in user, the Supabase client, the Coaching Brain/Intelligence
 * Engine/Root Router entry points) shares one implementation instead of
 * copy-pasting the same three lines per file.
 */
export const requestCache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  typeof reactCache === 'function' ? reactCache : (fn) => fn;
