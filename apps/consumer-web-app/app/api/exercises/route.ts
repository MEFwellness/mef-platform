/**
 * Exercise Library search/browse route. The only thing the browser talks
 * to for exercise search. Reads exclusively from our own database
 * (exercise_catalog, populated ahead of time from Your Move's browse
 * endpoint — see scripts/exercise-media/fetch-your-move-catalog.ts) —
 * never a live Your Move HTTP call, so browsing/searching/scrolling never
 * spends Your Move's monthly exercise quota (only an actual tap-to-play
 * does, see app/api/exercises/[id]/video-url/route.ts).
 *
 * `resource=muscles|equipment|categories` powers the filter dropdowns —
 * distinct values pulled from exercise_catalog itself, not a hardcoded
 * vendor vocabulary (Your Move's own category/muscle casing is
 * inconsistent on their side; storing it as-fetched and deriving filter
 * options from what's actually in our table keeps the dropdowns honest
 * about what will actually return results).
 *
 * Results are re-sorted by media availability (video > cues > no media)
 * via rankByMediaAvailability before returning — a stable sort that never
 * changes relevance order within a tier and never drops a no-media
 * exercise, only reorders it after the media/cues-having ones.
 *
 * COACH AND ADMINISTRATOR ONLY. The screens this serves — the Exercise
 * Library at /exercises and the two program pickers — are all internal
 * coaching tools, and /exercises has been staff-only since the internal
 * movement tools moved to the staff dashboards. This endpoint was not,
 * so the whole catalog was one fetch away for any signed-in account.
 * A member now gets 403 and no rows. The nested video-url route
 * (app/api/exercises/[id]/video-url) is deliberately NOT gated this way:
 * it is what a member taps to play an exercise in a Root Movement
 * session, and it resolves one exercise at a time by id rather than
 * handing out the catalog.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { searchExerciseCatalog, listDistinctCatalogValues } from '@/lib/your-move/catalog';
import { getExerciseMetadataMap } from '@/lib/exercise-library/metadata';
import { listMyExerciseFavoriteIds } from '@/lib/exercise-library/favorites';
import { normalizeExerciseCatalogRow } from '@/lib/exercise-library/normalize';
import { resolveSearchAlias } from '@/lib/exercise-library/searchAliases';
import { musclesMatchBodyRegion, type BodyRegion } from '@/lib/exercise-library/bodyRegions';
import { rankByMediaAvailability } from '@/lib/exercise-library/ranking';
import { getExtractedPosterMap } from '@/lib/your-move/posters';

export const dynamic = 'force-dynamic';

const RESOURCES = ['exercises', 'muscles', 'equipment', 'categories'] as const;
type Resource = (typeof RESOURCES)[number];

const BODY_REGIONS: readonly string[] = ['upper_body', 'lower_body', 'core', 'full_body'];

function isResource(value: string | null): value is Resource {
  return (RESOURCES as readonly string[]).includes(value ?? '');
}

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Sign in required' } },
      { status: 401 }
    );
  }

  // Fails closed: hasActiveRole returns false on a failed lookup, and
  // false here means 403. A coach caught by a broken RPC is told to try
  // again; a member is never handed the catalog.
  const [isCoach, isAdmin] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    hasActiveRole(supabase, user.id, 'platform_administrator'),
  ]);
  if (!isCoach && !isAdmin) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'This is a coaching tool' } },
      { status: 403 }
    );
  }

  const params = request.nextUrl.searchParams;
  const resourceParam = params.get('resource');
  const resource: Resource = isResource(resourceParam) ? resourceParam : 'exercises';

  try {
    if (resource === 'muscles') return NextResponse.json(await listDistinctCatalogValues(supabase, 'primary_muscle'));
    if (resource === 'equipment') return NextResponse.json(await listDistinctCatalogValues(supabase, 'equipment'));
    if (resource === 'categories') return NextResponse.json(await listDistinctCatalogValues(supabase, 'category'));

    const rawQuery = params.get('q') ?? undefined;
    const bodyRegionParam = params.get('bodyRegion');
    const bodyRegion =
      bodyRegionParam && BODY_REGIONS.includes(bodyRegionParam) ? (bodyRegionParam as BodyRegion) : null;

    const limit = params.has('limit') ? Number(params.get('limit')) : 30;
    const offset = params.has('offset') ? Number(params.get('offset')) : 0;

    const result = await searchExerciseCatalog(supabase, {
      q: rawQuery ? resolveSearchAlias(rawQuery) : undefined,
      category: params.get('category') ?? undefined,
      muscle: params.get('muscle') ?? undefined,
      equipment: params.get('equipment') ?? undefined,
      difficulty: params.get('level') ?? undefined,
      limit,
      offset,
    });

    let exercises = result.data;
    let total = result.total;

    if (bodyRegion) {
      exercises = exercises.filter((exercise) =>
        musclesMatchBodyRegion([exercise.primary_muscle, ...exercise.secondary_muscles].filter((m): m is string => Boolean(m)), bodyRegion)
      );
      // A client-side filter over one page of DB results is no longer an
      // accurate total-matching-count — surfacing the stale total
      // alongside a shorter filtered list would be more misleading than
      // omitting it.
      total = null;
    }

    const externalIds = exercises.map((e) => e.external_id);
    const [metadataMap, favoriteIds, posterMap] = await Promise.all([
      getExerciseMetadataMap(supabase, externalIds),
      listMyExerciseFavoriteIds(supabase, user.id, 'your_move'),
      getExtractedPosterMap(supabase, externalIds),
    ]);

    let data = exercises.map((exercise) =>
      normalizeExerciseCatalogRow(
        exercise,
        metadataMap.get(exercise.external_id) ?? null,
        favoriteIds.has(exercise.external_id),
        posterMap.get(exercise.external_id) ?? null
      )
    );

    data = rankByMediaAvailability(data);

    return NextResponse.json({ data, total, limit, offset });
  } catch (err) {
    console.error('[exercise-library] unexpected error', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error loading exercises' } },
      { status: 500 }
    );
  }
}
