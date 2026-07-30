/**
 * Fetch-at-play-time endpoint for Your Move video URLs. The browser calls
 * this ONLY when a member taps play on a your_move-sourced exercise — never
 * on page load, never from the browse grid — so a page view or a scroll
 * through search results never spends Your Move quota; only an actual tap
 * does. See lib/your-move/videoPlayback.ts for the cache-then-fetch logic.
 *
 * Not in middleware.ts's PUBLIC_PATHS (nested under /api/exercises, same
 * auth gate as the parent route) — requires a member session like every
 * other exercise-library route.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveYourMoveVideoUrl } from '@/lib/your-move/videoPlayback';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
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

  const result = await resolveYourMoveVideoUrl(supabase, 'exercise_api_dev', params.id);

  switch (result.status) {
    case 'ok':
      return NextResponse.json({ videoUrl: result.videoUrl });
    case 'not_mapped':
      return NextResponse.json(
        { error: { code: 'NOT_MAPPED', message: 'No Your Move video for this exercise' } },
        { status: 404 }
      );
    case 'not_configured':
      return NextResponse.json(
        { error: { code: 'NOT_CONFIGURED', message: 'Video playback is temporarily unavailable' } },
        { status: 503 }
      );
    case 'error':
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: result.message } },
        { status: 502 }
      );
  }
}
