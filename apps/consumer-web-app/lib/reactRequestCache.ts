import * as React from 'react';

/**
 * LOOKED UP, NOT IMPORTED BY NAME, and the key is a variable on purpose.
 *
 * `import { cache } from 'react'` — and `React.cache` on a namespace import
 * — both make webpack resolve a named export at build time. In the two
 * runtimes that do not have one (the Edge runtime the middleware compiles
 * into, and a plain Node test process) that is a compile warning on every
 * build, even though the guard below already handles the absence correctly
 * at runtime and every one of those callers is meant to run unmemoized
 * there. A computed key asks the same question of the same module without
 * asserting at build time that the answer exists.
 */
const CACHE_EXPORT = 'cache';
const reactCache = (React as unknown as Record<string, unknown>)[CACHE_EXPORT] as
  | (<T>(fn: T) => T)
  | undefined;

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
