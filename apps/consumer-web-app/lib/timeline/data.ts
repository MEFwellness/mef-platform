/**
 * Database access for the Personal Health Timeline — same shape as
 * lib/registry/data.ts. Every event this milestone writes is
 * member-visible by default and inserted under a session that can always
 * read its own just-written row (unlike the coach-gated tables elsewhere
 * in this codebase), so `.select()` is safe here. Both functions are
 * wrapped so a failure never throws — this is a best-effort side channel,
 * same discipline as every other recompute/write path triggered off a
 * primary action in this codebase.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HealthTimelineEvent,
  HealthTimelineEventType,
  HealthTimelineEvidenceRef,
} from '@mef/shared-types-contracts';

export type RecordTimelineEventInput = {
  memberId: string;
  eventType: HealthTimelineEventType;
  localDate: string;
  title: string;
  detail?: string | null;
  sourceFeature?: string | null;
  sourceRecordId?: string | null;
  evidenceRefs?: HealthTimelineEvidenceRef[];
  memberVisible?: boolean;
};

export async function recordTimelineEvent(
  supabase: SupabaseClient,
  input: RecordTimelineEventInput
): Promise<HealthTimelineEvent | null> {
  try {
    const { data, error } = await supabase
      .from('health_timeline_events')
      .insert({
        member_id: input.memberId,
        event_type: input.eventType,
        local_date: input.localDate,
        title: input.title,
        detail: input.detail ?? null,
        source_feature: input.sourceFeature ?? null,
        source_record_id: input.sourceRecordId ?? null,
        evidence_refs: input.evidenceRefs ?? [],
        member_visible: input.memberVisible ?? true,
      })
      .select('*')
      .single();

    if (error) {
      console.error('recordTimelineEvent failed', error);
      return null;
    }
    return data as HealthTimelineEvent;
  } catch (err) {
    console.error('recordTimelineEvent threw', err);
    return null;
  }
}

/** No UI reads this yet — exported for the future timeline page to import unchanged, per the milestone's "architecture without UI" requirement. */
export async function listTimelineEvents(
  supabase: SupabaseClient,
  memberId: string,
  options: { limit?: number } = {}
): Promise<HealthTimelineEvent[]> {
  try {
    const { data, error } = await supabase
      .from('health_timeline_events')
      .select('*')
      .eq('member_id', memberId)
      .order('occurred_at', { ascending: false })
      .limit(options.limit ?? 50);

    if (error) {
      console.error('listTimelineEvents failed', error);
      return [];
    }
    return data as HealthTimelineEvent[];
  } catch (err) {
    console.error('listTimelineEvents threw', err);
    return [];
  }
}
