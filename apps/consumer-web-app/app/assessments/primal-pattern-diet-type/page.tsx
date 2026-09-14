/**
 * Primal Pattern Diet Type, retired 2026-09-13.
 *
 * This screen used to be the assessment's welcome and overview. The
 * instrument has been replaced by the Rooted Reset Fuel Pattern
 * Assessment (lib/assessment-registry/registry.ts, retired: true), and a
 * retired assessment has no way in: no card on the shelf, no place on the
 * coach's assignable list, and a server side refusal for a new attempt.
 *
 * The route is kept as a redirect rather than deleted, because a
 * bookmark, an old push notification and a link in a coach message all
 * still point here, and a 404 is a worse answer than the library.
 *
 * NOTHING OF HER DATA IS AFFECTED. Every primal_pattern_assessments row,
 * every answer and every published finding is exactly where it was, her
 * own completed result is still readable at its own address under
 * ./results/[assessmentId], and a coach keeps every read he had.
 */

import { redirect } from 'next/navigation';

export default function RetiredPrimalPatternOverviewPage() {
  redirect('/questionnaires');
}
