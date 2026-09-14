/**
 * The delivery route for everything a member does to a meal card.
 *
 * =====================================================================
 * WHY A ROUTE HANDLER AND NOT A SERVER ACTION.
 * =====================================================================
 *
 * A Server Action's response is the whole re-rendered React tree for the
 * page it was called from. The Fuel Pattern result page is a reveal that
 * holds precisely because nothing behind it can replace it, and a member
 * meets the meal cards while she is standing in it. Tapping Show me
 * another three times would otherwise drag three full server renders of
 * the page she is reading underneath her. This returns a few bytes of
 * JSON instead, is not the router's, and survives her navigating away.
 * It is the same decision app/api/popup-response/route.ts made, for the
 * same reason.
 *
 * =====================================================================
 * NOTHING HERE TRUSTS THE BROWSER.
 * =====================================================================
 *
 * The member is resolved from her own session, never from the body. Every
 * meal id is checked against the library. Every reason is checked against
 * the closed list. And the standing exclusion a reason creates is decided
 * HERE, from the reason, rather than accepted from the client: a
 * hand-made POST cannot record an exclusion she never chose, and an
 * allergy can only ever name an allergen that is genuinely in the meal
 * she was looking at.
 *
 * A slot's remembered meal is checked the same way. If the browser posts
 * a meal that her own recorded preferences exclude, which is what a page
 * left open across a change would do, the route refuses that value,
 * picks the meal she should be seeing and returns it so her screen can
 * correct itself.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { fpaMealById } from '@/lib/fuel-pattern/meals/library';
import {
  exclusionForAllergen,
  exclusionForReason,
  isFpaRejectionReason,
  type FpaExclusionKey,
} from '@/lib/fuel-pattern/meals/preferences';
import {
  listFpaMealExclusions,
  listFpaMealRejections,
  recordFpaMealExclusions,
  recordFpaMealRejection,
  resolveFpaExclusionKeys,
  saveFpaMeal,
  saveFpaSlotState,
  unsaveFpaMeal,
} from '@/lib/fuel-pattern/meals/data';
import {
  orderedOwnPool,
  orderedWiderPool,
  pickSlotMeal,
} from '@/lib/fuel-pattern/meals/selection';
import { FPA_MEAL_TYPES, type FpaAllergen, type FpaMealType } from '@/lib/fuel-pattern/meals/types';
import type { FuelPattern } from '@/lib/fuel-pattern/types';

const PATTERNS: FuelPattern[] = [
  'protein_supportive',
  'balanced_fuel',
  'carb_supportive',
  'flexible_fuel',
];

/** The single line under "Other dietary preference". Never required, and never long. */
const MAX_NOTE_LENGTH = 200;

type Body = {
  action?: unknown;
  mealId?: unknown;
  mealType?: unknown;
  pattern?: unknown;
  reason?: unknown;
  note?: unknown;
  allergens?: unknown;
  currentMealId?: unknown;
  shownMealIds?: unknown;
  saved?: unknown;
};

function isPattern(value: unknown): value is FuelPattern {
  return typeof value === 'string' && PATTERNS.includes(value as FuelPattern);
}

function isMealType(value: unknown): value is FpaMealType {
  return typeof value === 'string' && (FPA_MEAL_TYPES as readonly string[]).includes(value);
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const user = await getCachedUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const supabase = createClient();
  const memberId = user.id;

  switch (body.action) {
    case 'slot':
      return slot(supabase, memberId, body);
    case 'reject':
      return reject(supabase, memberId, body);
    case 'save':
      return save(supabase, memberId, body);
    default:
      return NextResponse.json({ ok: false }, { status: 400 });
  }
}

/**
 * Remember where one slot has got to, and correct it when the browser is
 * holding something her preferences no longer allow.
 */
async function slot(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  body: Body
): Promise<NextResponse> {
  if (!isMealType(body.mealType) || !isPattern(body.pattern)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const mealType = body.mealType;
  const pattern = body.pattern;

  const rawShown = Array.isArray(body.shownMealIds) ? body.shownMealIds : [];
  const shownMealIds = rawShown
    .filter((id): id is string => typeof id === 'string')
    .filter((id) => fpaMealById(id)?.type === mealType)
    .slice(0, 24);

  const posted =
    typeof body.currentMealId === 'string' ? fpaMealById(body.currentMealId) : null;
  const postedIsThisSlot = posted?.type === mealType;

  const [ownExclusions, rejections] = await Promise.all([
    listFpaMealExclusions(supabase, memberId),
    listFpaMealRejections(supabase, memberId),
  ]);
  const exclusions = await resolveFpaExclusionKeys(supabase, memberId, ownExclusions);
  const filter = { rejectedMealIds: rejections.map((row) => row.mealId), exclusions };

  const pick = pickSlotMeal({
    ownPool: orderedOwnPool(pattern, mealType, memberId),
    widerPool: orderedWiderPool(pattern, mealType),
    filter,
    // Handing the picker what the browser says it is showing and asking
    // it NOT to advance means "keep this if it still stands", which is
    // exactly the check this route needs to make.
    state: {
      currentMealId: postedIsThisSlot ? (posted?.id ?? null) : null,
      shownMealIds,
    },
    advance: false,
  });

  await saveFpaSlotState(supabase, memberId, {
    mealType,
    pattern,
    currentMealId: pick.state.currentMealId,
    shownMealIds: pick.state.shownMealIds,
  });

  return NextResponse.json({
    ok: true,
    mealId: pick.meal?.id ?? null,
    widened: pick.widened,
    corrected: pick.meal?.id !== (postedIsThisSlot ? posted?.id : null),
  });
}

/**
 * She does not eat this one. The meal is recorded whatever else happens,
 * and the reason, when she gave one, decides whether anything standing
 * is recorded with it.
 */
async function reject(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  body: Body
): Promise<NextResponse> {
  const meal = typeof body.mealId === 'string' ? fpaMealById(body.mealId) : null;
  if (!meal) return NextResponse.json({ ok: false }, { status: 400 });

  const reason =
    typeof body.reason === 'string' && isFpaRejectionReason(body.reason) ? body.reason : null;

  const note =
    reason === 'other' && typeof body.note === 'string' && body.note.trim().length > 0
      ? body.note.trim().slice(0, MAX_NOTE_LENGTH)
      : null;

  const recorded = await recordFpaMealRejection(supabase, memberId, {
    mealId: meal.id,
    reason,
    note,
  });
  if (!recorded) return NextResponse.json({ ok: false }, { status: 500 });

  const standing: Array<{ key: FpaExclusionKey; isAllergy: boolean; sourceMealId: string | null }> =
    [];

  const dietary = reason ? exclusionForReason(reason) : null;
  if (dietary) standing.push({ key: dietary, isAllergy: false, sourceMealId: meal.id });

  if (reason === 'allergy') {
    // AN ALLERGY CAN ONLY EVER NAME AN ALLERGEN THAT IS IN THIS MEAL.
    // The sheet offers her the meal's own allergens and nothing else, and
    // this is where that is actually enforced. When she sends none, or
    // the meal carries none, the rejection stands on its own and nothing
    // standing is recorded, because guessing which food she meant would
    // take meals away that she never asked us to take away.
    const requested = Array.isArray(body.allergens) ? body.allergens : meal.allergens;
    const allergens = requested
      .filter((value): value is FpaAllergen =>
        typeof value === 'string' && (meal.allergens as readonly string[]).includes(value)
      );
    for (const allergen of allergens) {
      standing.push({ key: exclusionForAllergen(allergen), isAllergy: true, sourceMealId: meal.id });
    }
  }

  if (standing.length > 0) {
    const landed = await recordFpaMealExclusions(supabase, memberId, standing);
    if (!landed) return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    exclusions: standing.map((entry) => entry.key),
  });
}

/** Save or unsave one meal. */
async function save(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  body: Body
): Promise<NextResponse> {
  const meal = typeof body.mealId === 'string' ? fpaMealById(body.mealId) : null;
  if (!meal) return NextResponse.json({ ok: false }, { status: 400 });

  if (body.saved === false) {
    const removed = await unsaveFpaMeal(supabase, memberId, meal.id);
    return NextResponse.json({ ok: removed }, { status: removed ? 200 : 500 });
  }

  if (!isPattern(body.pattern)) return NextResponse.json({ ok: false }, { status: 400 });
  const stored = await saveFpaMeal(supabase, memberId, meal.id, body.pattern);
  return NextResponse.json({ ok: stored }, { status: stored ? 200 : 500 });
}
