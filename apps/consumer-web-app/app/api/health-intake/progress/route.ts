/**
 * The delivery route for an autosaved Health & Lifestyle Intake draft.
 *
 * WHY A ROUTE AND NOT THE SERVER ACTION DIRECTLY. Same reason, and the same
 * shape, as app/api/whole-body-signal/progress/route.ts and
 * app/api/body-systems/progress/route.ts: this file adds no logic, no
 * second write path and no second set of guards. It hands straight to the
 * function that already owned this write, and everything that decides
 * whether the write is allowed (her session, her pending assignment, the
 * sanitising of every field id and value against the screens her own
 * answers opened) still happens inside that function.
 *
 * WHAT CHANGES IS THE COST OF ASKING. A Server Action's response is the
 * whole re-rendered React tree for the page she is on, and an intake is
 * forty or more saves. This returns a few bytes of JSON instead. Only
 * submitting still goes through a Server Action, because a completion
 * really does need the route it was called from to re-render.
 */

import { NextResponse } from 'next/server';
import { saveHealthIntakeProgressAction } from '@/app/actions/healthIntake';

type ProgressBody = {
  answers?: unknown;
  stepIndex?: unknown;
};

export async function POST(request: Request): Promise<NextResponse> {
  let body: ProgressBody;
  try {
    body = (await request.json()) as ProgressBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const result = await saveHealthIntakeProgressAction(body.answers, body.stepIndex);
  return NextResponse.json(result.ok ? { ok: true } : { ok: false, error: result.error });
}
