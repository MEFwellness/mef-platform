/**
 * Root Proactive Coaching Engine — the daily scheduled scan.
 *
 * lib/ai/README.md documents the one real gap in the existing AI
 * Coaching Engine Foundation: "member_missed_checkin"/"member_inactive"
 * are defined in the schema and accountabilityAgent already subscribes to
 * them, but nothing ever emits them, because by definition nothing a
 * member does can trigger an event about their *not* doing something.
 * That needs a scheduled job. This route is that job — the one place in
 * the app allowed to notice a member has gone quiet.
 *
 * For every active member it also refreshes the Personal Wellness
 * Intelligence Engine's trend detection (lib/intelligence/service.ts —
 * previously only recalculated on demand from a coach action or the
 * health-profile orchestration cascade, never on a schedule) and turns
 * any genuinely new trend conclusion into a notification + Coach Timeline
 * entry, and pre-warms today's Morning Brief.
 *
 * Uses the service-role client — same reasoning and same pattern as
 * app/api/cron/wearable-daily/route.ts, the one other cron in this app.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { emitAndDispatch } from '@/lib/ai/events';
import { buildRuleFacts } from '@/lib/ai/rules/facts';
import { recalculateWellnessIntelligence } from '@/lib/intelligence/service';
import { listInsightsForMember } from '@/lib/intelligence/data';
import { insertNotification } from '@/lib/notifications/data';
import { recordTimelineEvent } from '@/lib/timeline/data';
import { listRecentCheckinsForMember } from '@/lib/coaching-engine/data';
import { getOrCreateTodaysMorningBrief } from '@/lib/coaching-engine/service';
import type { WellnessInsight } from '@mef/shared-types-contracts';

export const dynamic = 'force-dynamic';

/** Missed check-in nudges start at 2 days; a warmer re-engagement message kicks in past 10 — matches the two new ai_rules seeded in migration 053. */
const MISSED_CHECKIN_THRESHOLD_DAYS = 2;
const INACTIVE_THRESHOLD_DAYS = 10;

/** At most this many proactive trend notifications per member per run — "never annoying" (section 5) means one meaningful nudge, not every trend the engine detected today. */
const MAX_TREND_NOTIFICATIONS_PER_MEMBER = 2;

const TREND_STATES_WORTH_SURFACING = new Set(['improving', 'declining', 'newly_emerging']);

function serviceRoleClient() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing — set it in your hosting provider's " +
        'project environment variables, then redeploy.'
    );
  }
  return createClient(url, serviceRoleKey);
}

/** Plain UTC "today" — there is no per-member session in a cron invocation to resolve a timezone-aware local date from, same constraint lib/wearables/sync.ts's todayLocalDate() operates under. */
function todayLocalDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function isCreatedToday(insight: WellnessInsight, today: string): boolean {
  return insight.created_at.slice(0, 10) === today;
}

type MemberRow = { id: string; display_name: string | null };

async function listActiveMembers(
  supabase: ReturnType<typeof serviceRoleClient>
): Promise<MemberRow[]> {
  const { data: roleRows, error: roleError } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'member')
    .is('revoked_at', null);

  if (roleError) {
    console.error('daily-coaching-scan: failed to list active members', roleError);
    return [];
  }

  const memberIds = Array.from(new Set((roleRows ?? []).map((row) => row.user_id as string)));
  if (memberIds.length === 0) return [];

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', memberIds);

  if (profileError) {
    console.error('daily-coaching-scan: failed to load profiles', profileError);
    return memberIds.map((id) => ({ id, display_name: null }));
  }
  return profiles as MemberRow[];
}

async function scanMember(
  supabase: ReturnType<typeof serviceRoleClient>,
  member: MemberRow,
  today: string
): Promise<void> {
  const firstName = member.display_name?.split(' ')[0] ?? 'there';
  const recentCheckins = await listRecentCheckinsForMember(supabase, member.id, today, 40);
  const facts = buildRuleFacts(recentCheckins, today);

  // ---- Absence detection: the one thing nothing else in the app can ever trigger ----
  if (facts.daysSinceLastCheckin !== null) {
    if (facts.daysSinceLastCheckin >= INACTIVE_THRESHOLD_DAYS) {
      await emitAndDispatch(
        supabase,
        { eventType: 'member_inactive', memberId: member.id, source: 'system', payload: {} },
        facts
      );
    } else if (facts.daysSinceLastCheckin >= MISSED_CHECKIN_THRESHOLD_DAYS) {
      await emitAndDispatch(
        supabase,
        {
          eventType: 'member_missed_checkin',
          memberId: member.id,
          source: 'system',
          payload: {},
        },
        facts
      );
    }
  }

  // ---- Refresh the Personal Wellness Intelligence Engine's trend read, then surface anything genuinely new ----
  await recalculateWellnessIntelligence(supabase, member.id, today);

  const activeInsights = await listInsightsForMember(supabase, member.id, {
    statusFilter: ['active'],
  });
  const freshTrends = activeInsights
    .filter(
      (insight) =>
        insight.insight_type === 'trend' &&
        insight.member_visible &&
        (insight.severity === 'notable' || insight.severity === 'important') &&
        insight.trend_state !== null &&
        TREND_STATES_WORTH_SURFACING.has(insight.trend_state) &&
        isCreatedToday(insight, today)
    )
    .slice(0, MAX_TREND_NOTIFICATIONS_PER_MEMBER);

  for (const insight of freshTrends) {
    await insertNotification(supabase, {
      memberId: member.id,
      type: 'proactive_coach_message',
      title: insight.title,
      body: insight.member_summary,
      sourceFeature: 'wellness_intelligence',
      sourceRecordId: insight.id,
    });
    await recordTimelineEvent(supabase, {
      memberId: member.id,
      eventType: insight.trend_state === 'declining' ? 'trend_declining' : 'trend_improving',
      localDate: today,
      title: insight.title,
      detail: insight.member_summary,
      sourceFeature: 'wellness_intelligence',
      sourceRecordId: insight.id,
    });
  }

  // ---- Pre-warm today's Morning Brief so it's already waiting ----
  await getOrCreateTodaysMorningBrief(supabase, member.id, today, firstName);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let supabase;
  try {
    supabase = serviceRoleClient();
  } catch (err) {
    console.error('daily-coaching-scan cron: Supabase misconfigured —', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Supabase misconfigured' },
      { status: 500 }
    );
  }

  const today = todayLocalDate();
  const members = await listActiveMembers(supabase);

  const results = await Promise.allSettled(
    members.map((member) => scanMember(supabase, member, today))
  );
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failures = results
    .map((r, i) =>
      r.status === 'rejected' ? { memberId: members[i]!.id, reason: String(r.reason) } : null
    )
    .filter((f): f is { memberId: string; reason: string } => f !== null);

  if (failures.length > 0) {
    console.error('daily-coaching-scan cron: some members failed', failures);
  }

  return NextResponse.json({
    membersProcessed: members.length,
    succeeded,
    failed: members.length - succeeded,
  });
}
