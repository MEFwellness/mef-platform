/**
 * The delivery route for an autosaved Body Systems Survey draft.
 *
 * WHY A ROUTE AND NOT THE SERVER ACTION DIRECTLY. Same reason, and the
 * same shape, as app/api/popup-response/route.ts: this file adds no logic,
 * no second write path and no second set of guards. It hands straight to
 * the function that already owned this write, and everything that decides
 * whether the write is allowed (her session, her pending assignment, the
 * sanitising of every answer key and value) still happens inside that
 * function, so an argument arriving over this route is exactly as
 * constrained as one arriving over a Server Action.
 *
 * WHAT CHANGES IS THE COST OF ASKING. A Server Action call from a client
 * component is a POST whose response is the whole re-rendered React tree
 * for the page she is on, and /body-systems reads the survey state and the
 * entire content bundle on every render. Her Continue can afford that, and
 * still uses the action. The autosave behind each individual tap cannot:
 * a hundred and three questions would be a hundred and three full server
 * renders of a page that has not changed. This returns a few bytes of
 * JSON instead.
 *
 * IT IS THE SAME DRAFT EITHER WAY. Both paths write the one row for her
 * one pending assignment, so an autosave and a Continue landing in either
 * order leave the same stored answers.
 */

import { NextResponse } from 'next/server';
import { saveBodySystemsProgressAction } from '@/app/actions/bodySystems';

type ProgressBody = {
  branch?: unknown;
  answers?: unknown;
  redFlagAnswers?: unknown;
  stepIndex?: unknown;
};

export async function POST(request: Request): Promise<NextResponse> {
  let body: ProgressBody;
  try {
    body = (await request.json()) as ProgressBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const result = await saveBodySystemsProgressAction(
    body.branch,
    body.answers,
    body.redFlagAnswers,
    body.stepIndex
  );

  return NextResponse.json(result.ok ? { ok: true } : { ok: false, error: result.error });
}
