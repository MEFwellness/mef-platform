/**
 * A round-trip counter for one request, for development only.
 *
 * WHY IT EXISTS. Home's slowness was never one slow query; it was many
 * cards each making their own round trips and a third of them reading the
 * same row twice. Counting that needs the count, per request, labelled by
 * what it read, which is not something a wall-clock number from a browser
 * can tell you. This is how the before and after numbers in
 * docs/BUILD_STATUS.md were measured.
 *
 * OFF unless MEF_TRACE_QUERIES=1 is set in the environment, and it is never
 * set on a deployed environment. When it is off `recordQuery` returns on
 * its first line, so this costs one branch on the request path.
 *
 * Each line is numbered within its own request, so the last number is that
 * request's total and the lines themselves are the duplication report.
 */
import { requestCache } from '../reactRequestCache';

export const TRACE_ON = process.env.MEF_TRACE_QUERIES === '1';

/** One counter per request, so two concurrent members never share a tally. */
const counter = requestCache(() => ({ n: 0 }));

export function recordQuery(label: string, exact: string): void {
  if (!TRACE_ON) return;
  const c = counter();
  c.n += 1;
  console.log(`QUERY ${String(c.n).padStart(4)}  ${label}  ${exact}`);
}
