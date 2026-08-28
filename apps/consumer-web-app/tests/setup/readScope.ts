/**
 * One simulated request's read scope, for the tests.
 *
 * `lib/data/readOnce.ts` finds the current request's map through React's
 * `cache`, which does not exist in this suite (vitest resolves the real
 * `react` package, which has no `cache` export). Without a scope, every
 * call would get a fresh map and every test asserting "one round trip"
 * would pass vacuously by never deduplicating at all.
 *
 * So the tests install a real map for the duration of one simulated
 * request. Nothing about the code under test changes: `readOnce` and
 * `forgetReads` run exactly as they do in the app.
 */
import { installReadScopeResolver, type RequestReads } from '../../lib/data/readOnce';

export async function withReadScope<T>(work: () => Promise<T>): Promise<T> {
  const reads: RequestReads = new Map();
  installReadScopeResolver(() => reads);
  try {
    return await work();
  } finally {
    installReadScopeResolver(null);
  }
}
