/**
 * The delivery route for one Health Appraisal answer.
 *
 * WHY A ROUTE AND NOT THE SERVER ACTION DIRECTLY. The same reason, and the
 * same shape, as app/api/body-systems/progress/route.ts: a Server Action's
 * response is the whole re-rendered page, and 260 taps would be 260 full
 * renders of a page that has not changed. This adds no logic and no second
 * set of guards. It hands straight to saveHaqAnswerAction, which re-asks
 * the gate, checks the answer against the question's own choices and writes
 * through the shared runtime.
 *
 * IT RETURNS NOTHING BUT WHETHER IT WORKED. No stored row, no value, no
 * progress figure travels back.
 */

import { NextResponse } from 'next/server';
import { saveHaqAnswerAction } from '@/app/actions/haq';

export async function POST(request: Request): Promise<NextResponse> {
  let body: { questionKey?: unknown; value?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const result = await saveHaqAnswerAction(body.questionKey, body.value);
  return NextResponse.json(result.ok ? { ok: true } : { ok: false, error: result.error });
}
