/**
 * The delivery route for adding or removing one Health Appraisal body map
 * mark. Same reason for being a route as app/api/haq/answer/route.ts, and
 * the same rule: no logic here, the actions re-ask the gate and validate.
 *
 * An add hands back the mark she made (its id, area, view and category) so
 * her screen can offer to remove it. Nothing else travels back.
 */

import { NextResponse } from 'next/server';
import { addHaqBodyMarkAction, removeHaqBodyMarkAction } from '@/app/actions/haq';

type Body = { action?: unknown; location?: unknown; side?: unknown; issueType?: unknown; markId?: unknown };

export async function POST(request: Request): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (body.action === 'add') {
    const result = await addHaqBodyMarkAction({
      location: body.location,
      side: body.side,
      issueType: body.issueType,
    });
    return NextResponse.json(result.ok ? { ok: true, mark: result.mark } : { ok: false, error: result.error });
  }

  if (body.action === 'remove') {
    const result = await removeHaqBodyMarkAction(body.markId);
    return NextResponse.json(result.ok ? { ok: true } : { ok: false, error: result.error });
  }

  return NextResponse.json({ ok: false }, { status: 400 });
}
