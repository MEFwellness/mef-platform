/**
 * Exercise Library search/browse route. The only thing the browser talks
 * to for exercise search — apiClient.ts (the only holder of
 * EXERCISE_API_KEY) is called from here, server-side, and never from the
 * client directly. Requires a member session: this path isn't in
 * middleware.ts's PUBLIC_PATHS, so the existing auth middleware already
 * redirects an unauthenticated request before it ever reaches this
 * handler — same as every other authenticated API route in this app (see
 * app/api/speech/route.ts).
 *
 * `resource=muscles|equipment|categories` powers the filter dropdowns;
 * the default (search) resource returns exercises normalized and merged
 * with MEF metadata + the signed-in member's favorite state.
 *
 * Results are re-sorted by media availability (video > image > no media)
 * via rankByMediaAvailability before returning — a stable sort that never
 * changes relevance order within a tier and never drops a no-media
 * exercise, only reorders it after the media-having ones. `imageOnly` and
 * `hideNoMedia` are applied client-of-this-route (same idiom as
 * `bodyRegion` below) since the vendor API has no concept of "usable
 * image" the way this app defines it — `hasVideo` alone is still sent to
 * the vendor as a real search parameter.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  buildExerciseApiClientFromEnv,
  ExerciseApiError,
  type ExerciseApiExercise,
  type ExerciseApiSearchParams,
} from '@/lib/exercise-library/apiClient';
import { getExerciseMetadataMap } from '@/lib/exercise-library/metadata';
import { listMyExerciseFavoriteIds } from '@/lib/exercise-library/favorites';
import { normalizeExerciseApiExercise } from '@/lib/exercise-library/normalize';
import { resolveSearchAlias } from '@/lib/exercise-library/searchAliases';
import { musclesMatchBodyRegion, type BodyRegion } from '@/lib/exercise-library/bodyRegions';
import { rankByMediaAvailability } from '@/lib/exercise-library/ranking';

export const dynamic = 'force-dynamic';

const RESOURCES = ['exercises', 'muscles', 'equipment', 'categories'] as const;
type Resource = (typeof RESOURCES)[number];

const BODY_REGIONS: readonly string[] = ['upper_body', 'lower_body', 'core', 'full_body'];

function isResource(value: string | null): value is Resource {
  return (RESOURCES as readonly string[]).includes(value ?? '');
}

function errorResponse(err: ExerciseApiError) {
  const status = err.status >= 400 ? err.status : 502;
  return NextResponse.json(
    {
      error: {
        code: err.code,
        message: err.message,
        retryAfterSeconds: err.retryAfterSeconds ?? null,
      },
    },
    { status }
  );
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

  const client = buildExerciseApiClientFromEnv();
  if (!client) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_CONFIGURED',
          message: 'The Exercise Library is temporarily unavailable.',
        },
      },
      { status: 503 }
    );
  }

  const params = request.nextUrl.searchParams;
  const resourceParam = params.get('resource');
  const resource: Resource = isResource(resourceParam) ? resourceParam : 'exercises';

  try {
    if (resource === 'muscles') return NextResponse.json(await client.getMuscles());
    if (resource === 'equipment') return NextResponse.json(await client.getEquipmentOptions());
    if (resource === 'categories') return NextResponse.json(await client.getCategories());

    const rawQuery = params.get('q') ?? undefined;
    const bodyRegionParam = params.get('bodyRegion');
    const bodyRegion =
      bodyRegionParam && BODY_REGIONS.includes(bodyRegionParam)
        ? (bodyRegionParam as BodyRegion)
        : null;
    const imageOnly = params.get('imageOnly') === 'true';
    const hideNoMedia = params.get('hideNoMedia') === 'true';

    const searchParams: ExerciseApiSearchParams = {
      q: rawQuery ? resolveSearchAlias(rawQuery) : undefined,
      category: params.get('category') ?? undefined,
      muscle: params.get('muscle') ?? undefined,
      equipment: params.get('equipment') ?? undefined,
      level: params.get('level') ?? undefined,
      force: params.get('force') ?? undefined,
      mechanic: params.get('mechanic') ?? undefined,
      hasVideo: params.has('hasVideo') ? params.get('hasVideo') === 'true' : undefined,
      limit: params.has('limit') ? Number(params.get('limit')) : 30,
      offset: params.has('offset') ? Number(params.get('offset')) : 0,
    };

    const result = await client.searchExercises(searchParams);
    let exercises: ExerciseApiExercise[] = result.data;
    let total = result.total;

    if (bodyRegion) {
      exercises = exercises.filter((exercise) =>
        musclesMatchBodyRegion(
          [...(exercise.primaryMuscles ?? []), ...(exercise.secondaryMuscles ?? [])],
          bodyRegion
        )
      );
      // A client-side filter over one page of API results is no longer an
      // accurate total-matching-count — surfacing the stale API total
      // alongside a shorter filtered list would be more misleading than
      // omitting it.
      total = null;
    }

    const externalIds = exercises.map((e) => e.id);
    const [metadataMap, favoriteIds] = await Promise.all([
      getExerciseMetadataMap(supabase, 'exercise_api_dev', externalIds),
      listMyExerciseFavoriteIds(supabase, user.id, 'exercise_api_dev'),
    ]);

    let data = exercises.map((exercise) =>
      normalizeExerciseApiExercise(
        exercise,
        metadataMap.get(exercise.id) ?? null,
        favoriteIds.has(exercise.id)
      )
    );

    if (imageOnly) {
      data = data.filter((exercise) => Boolean(exercise.imageUrl));
      total = null;
    }
    if (hideNoMedia) {
      data = data.filter((exercise) => Boolean(exercise.videoUrl) || Boolean(exercise.imageUrl));
      total = null;
    }

    data = rankByMediaAvailability(data);

    return NextResponse.json({ data, total, limit: result.limit, offset: result.offset });
  } catch (err) {
    if (err instanceof ExerciseApiError) return errorResponse(err);
    console.error('[exercise-library] unexpected error', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error loading exercises' } },
      { status: 500 }
    );
  }
}
