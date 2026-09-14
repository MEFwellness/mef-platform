/**
 * Primal Pattern Diet Type take flow, retired 2026-09-13. See the sibling
 * ../page.tsx for what retirement means and what it deliberately leaves
 * alone. Nobody starts a new attempt, so this route only sends her back
 * to the library. It writes nothing, exactly as it did before.
 */

import { redirect } from 'next/navigation';

export default function RetiredPrimalPatternTakePage() {
  redirect('/questionnaires');
}
