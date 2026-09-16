/**
 * Storing what Root noticed, and reading it back.
 *
 * WHY A FINDING IS STORED AT ALL, when Prompt 3 argued a pattern card
 * should be computed live on every read. Two reasons that did not apply
 * there. A finding is triggered by an EVENT, a sentence she wrote on a
 * particular day, and "what Root noticed when those words arrived" is not
 * recoverable from today's rows once the day has passed. And the coach
 * needs an unread count she can clear, which is state about HER, not about
 * the member.
 *
 * THE EVIDENCE INSIDE A FINDING IS STILL COMPUTED LIVE on every read, by
 * the pure lookup, so a questionnaire she answered since cannot leave a
 * stale claim standing on a coach's screen. What the stored row adds is the
 * thing a recomputation cannot: WHICH version of the map entry was read,
 * WHICH rows were under each area, and WHEN.
 *
 * A RE-EVALUATION REPLACES. One row per complaint and map entry, deleted
 * outright when the entry stops being triggered, because a stored row
 * meaning "nothing" is a row every reader has to remember to filter. Same
 * rule, and the same reason, as migration 245's ledger.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RootFindingDraft } from './types';

export type FindingTrigger =
  | 'complaint_classified'
  | 'sitting_ingested'
  | 'coach_signal_added'
  | 'relationship_saved'
  | 'backfill';

/**
 * Replaces every finding for one complaint.
 *
 * The delete runs first and is scoped to this report, so a map entry that
 * has been deactivated since, or one whose primary no longer matches after
 * an edit, loses the row it wrote rather than leaving it standing.
 */
export async function replaceFindings(
  supabase: SupabaseClient,
  input: {
    memberId: string;
    reportId: string;
    findings: readonly RootFindingDraft[];
    trigger: FindingTrigger;
    noticedOn: string;
    noticedAt: string;
  }
): Promise<{ ok: boolean; written: number }> {
  const existing = await supabase
    .from('cross_system_root_findings')
    .select('id, relationship_id, reviewed_at, reviewed_by, dismissed_at, dismissed_by')
    .eq('report_id', input.reportId);
  if (existing.error) {
    console.error('replaceFindings could not read existing rows', existing.error);
    return { ok: false, written: 0 };
  }

  // HER REVIEW STATE SURVIVES A RECOMPUTE. A coach who marked a finding
  // reviewed on Monday must not have it come back unread on Tuesday
  // because an unrelated signal landed and the pass ran again.
  const carried = new Map(
    (existing.data ?? []).map((row: Record<string, unknown>) => [
      row.relationship_id as string,
      {
        reviewed_at: row.reviewed_at as string | null,
        reviewed_by: row.reviewed_by as string | null,
        dismissed_at: row.dismissed_at as string | null,
        dismissed_by: row.dismissed_by as string | null,
      },
    ])
  );

  const removal = await supabase
    .from('cross_system_root_findings')
    .delete()
    .eq('report_id', input.reportId);
  if (removal.error) {
    console.error('replaceFindings delete failed', removal.error);
    return { ok: false, written: 0 };
  }

  /*
    THREE INSERTS FOR THE WHOLE COMPLAINT, NOT THREE PER FINDING.

    The corrected build fixed forty round trips down to three per finding,
    which was right for a map of eighteen entries where a complaint
    triggered one or two. This map is over two hundred entries: a knee
    complaint reaches the knee entry, the joint clicking entry, the
    Joint/Movement system entry and the wide musculoskeletal entry, and a
    sentence naming two things reaches twice that. Per finding batching
    would put that back where it started.

    So every finding goes in one insert, every area of every finding in a
    second, and every row of every area in a third, regardless of how many
    entries the complaint triggered. The ids come back through `select` and
    are matched by a key the caller chose (the relationship for a finding,
    the finding and position for an area), never by the order the rows
    arrive in, because PostgREST does not promise insertion order.

    IT STILL RUNS WHILE A MEMBER'S OWN CHECK-IN IS COMPLETING, which is why
    the count of round trips is a correctness concern and not only a speed
    one. Her result is already saved and this block is best effort, so it
    can never cost her the check-in, but it holds her request open.
  */
  const surfaced = input.findings.filter((finding) => finding.surfaced);
  if (surfaced.length === 0) return { ok: true, written: 0 };

  const findingRows = surfaced.map((finding) => {
    const state = carried.get(finding.head.id);
    return {
      member_id: input.memberId,
      report_id: input.reportId,
      relationship_id: finding.head.id,
      version_id: finding.version.id,
      classification_id: null,
      current_finding_count: finding.currentCount,
      historical_finding_count: finding.historicalCount,
      not_observed_count: finding.notObservedCount,
      area_count: finding.areas.length,
      is_safety_withheld: finding.safetyWithheld,
      triggered_by: input.trigger,
      noticed_on: input.noticedOn,
      noticed_at: input.noticedAt,
      reviewed_at: state?.reviewed_at ?? null,
      reviewed_by: state?.reviewed_by ?? null,
      dismissed_at: state?.dismissed_at ?? null,
      dismissed_by: state?.dismissed_by ?? null,
    };
  });

  const insertedFindings = await supabase
    .from('cross_system_root_findings')
    .insert(findingRows)
    .select('id, relationship_id');
  if (insertedFindings.error) {
    console.error('replaceFindings insert failed', insertedFindings.error);
    return { ok: false, written: 0 };
  }

  const findingIdByRelationship = new Map(
    (insertedFindings.data ?? []).map((row: Record<string, unknown>) => [
      row.relationship_id as string,
      row.id as string,
    ])
  );

  // A WITHHELD FINDING STORES NO AREAS AND NO ROWS. The safety override is
  // not a drawing decision a later reader could ignore: there is nothing in
  // the database for a screen to leak.
  const withAreas = surfaced.filter(
    (finding) => !finding.safetyWithheld && findingIdByRelationship.has(finding.head.id)
  );

  const areaRows = withAreas.flatMap((finding) =>
    finding.areas.map((area, index) => ({
      finding_id: findingIdByRelationship.get(finding.head.id)!,
      position: index,
      ref_kind: area.refKind,
      ref_key: area.refKey,
      ref_label: area.refLabel,
      component_role: area.role,
      evidence_state: area.state,
      finding_count: area.rows.length,
    }))
  );

  if (areaRows.length > 0) {
    const insertedAreas = await supabase
      .from('cross_system_root_finding_areas')
      .insert(areaRows)
      .select('id, finding_id, position');
    if (insertedAreas.error) {
      console.error('replaceFindings area insert failed', insertedAreas.error);
      return { ok: true, written: findingRows.length };
    }

    const areaIdByKey = new Map(
      (insertedAreas.data ?? []).map((row: Record<string, unknown>) => [
        `${row.finding_id as string}::${row.position as number}`,
        row.id as string,
      ])
    );

    const signalRows = withAreas.flatMap((finding) => {
      const findingId = findingIdByRelationship.get(finding.head.id)!;
      return finding.areas.flatMap((area, index) => {
        const areaId = areaIdByKey.get(`${findingId}::${index}`);
        if (!areaId) return [];
        return area.rows.map((row, position) => ({
          finding_id: findingId,
          area_id: areaId,
          signal_id: row.record.id,
          position,
        }));
      });
    });

    if (signalRows.length > 0) {
      const linked = await supabase.from('cross_system_root_finding_signals').insert(signalRows);
      if (linked.error) console.error('replaceFindings signal link failed', linked.error);
    }
  }

  return { ok: true, written: findingRows.length };
}

export type StoredFinding = {
  id: string;
  memberId: string;
  reportId: string;
  relationshipId: string;
  versionId: string;
  currentFindingCount: number;
  historicalFindingCount: number;
  notObservedCount: number;
  areaCount: number;
  isSafetyWithheld: boolean;
  triggeredBy: string;
  noticedOn: string;
  noticedAt: string;
  reviewedAt: string | null;
  dismissedAt: string | null;
};

function toStored(row: Record<string, unknown>): StoredFinding {
  return {
    id: row.id as string,
    memberId: row.member_id as string,
    reportId: row.report_id as string,
    relationshipId: row.relationship_id as string,
    versionId: row.version_id as string,
    currentFindingCount: row.current_finding_count as number,
    historicalFindingCount: row.historical_finding_count as number,
    notObservedCount: row.not_observed_count as number,
    areaCount: row.area_count as number,
    isSafetyWithheld: row.is_safety_withheld as boolean,
    triggeredBy: row.triggered_by as string,
    noticedOn: row.noticed_on as string,
    noticedAt: row.noticed_at as string,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    dismissedAt: (row.dismissed_at as string | null) ?? null,
  };
}

/** Her findings, newest first. */
export async function listFindingsForMember(
  supabase: SupabaseClient,
  memberId: string,
  limit = 60
): Promise<{ ok: boolean; findings: StoredFinding[] }> {
  const { data, error } = await supabase
    .from('cross_system_root_findings')
    .select('*')
    .eq('member_id', memberId)
    .order('noticed_on', { ascending: false })
    .order('noticed_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('listFindingsForMember failed', error);
    return { ok: false, findings: [] };
  }
  return { ok: true, findings: (data ?? []).map((row) => toStored(row as Record<string, unknown>)) };
}

/** Marks one finding as read by this coach. The only thing she may write. */
export async function markFindingReviewed(
  supabase: SupabaseClient,
  findingId: string,
  coachId: string,
  at: string
): Promise<boolean> {
  const { error } = await supabase
    .from('cross_system_root_findings')
    .update({ reviewed_at: at, reviewed_by: coachId })
    .eq('id', findingId);
  if (error) {
    console.error('markFindingReviewed failed', error);
    return false;
  }
  return true;
}

export async function dismissFinding(
  supabase: SupabaseClient,
  findingId: string,
  coachId: string,
  at: string
): Promise<boolean> {
  const { error } = await supabase
    .from('cross_system_root_findings')
    .update({ dismissed_at: at, dismissed_by: coachId })
    .eq('id', findingId);
  if (error) {
    console.error('dismissFinding failed', error);
    return false;
  }
  return true;
}
