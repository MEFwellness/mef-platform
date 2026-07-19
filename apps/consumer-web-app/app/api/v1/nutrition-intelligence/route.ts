/**
 * Nutrition Intelligence Service — stable, versioned HTTP surface
 * (v1) over lib/nutrition-intelligence/service.ts. Same-app consumers
 * (e.g. the future Food Lens integration) should prefer importing
 * getMemberNutritionProfile() directly to avoid an unnecessary HTTP hop
 * within the same Next.js process — this route exists for consumers
 * outside the request/component tree (external services, scripts,
 * future mobile clients) that need an actual network-callable endpoint.
 * Either path returns the exact same NutritionIntelligenceProfile shape,
 * so nothing about a future storage change leaks past this file.
 *
 * Auth: cookie-based session via lib/supabase/server.ts, same as every
 * Server Action in this app — a caller always gets their own profile,
 * never another member's. RLS on primal_pattern_assessments is the real
 * authorization boundary underneath.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMemberNutritionProfile } from '@/lib/nutrition-intelligence/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const profile = await getMemberNutritionProfile(supabase, user.id);
  return NextResponse.json(profile, { status: 200 });
}
