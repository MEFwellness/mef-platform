/**
 * The evaluation ledger's reads and writes.
 *
 * WHAT A LEDGER ROW IS FOR. The coach's card is computed live by the pure
 * matcher on every read, so it can never be stale. What a stored row adds
 * is the thing a recomputation cannot give: which VERSION of a definition
 * was current when the engine last ran, which exact signal rows satisfied
 * it that day, and when that was. A definition edited next month would
 * otherwise erase the record of what last month's evaluation read.
 *
 * NOBODY WRITES ONE BY HAND. Migration 245 gives neither table an insert,
 * update or delete policy for any role, coach included, so every write
 * below goes through the trusted connection in ./serviceRole.ts and there
 * is no other door. A coach cannot manufacture a match for a member and
 * neither can a hand made request.
 *
 * A RE-EVALUATION REPLACES, IT DOES NOT ACCUMULATE. One row per member and
 * relationship, deleted outright when the pattern no longer meets its
 * floor. A stored row that means "nothing" is a row every reader has to
 * remember to filter, and the reader that forgets is the bug.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllRows, selectAllRowsInChunks, writeInChunks } from '@/lib/data/pagedSelect';
import type { PatternStrength, EvaluationReason } from './constants';
import type { PatternMatch } from './types';

/** One current evaluation, as a coach surface reads it back. */
export type PatternMatchRecord = {
  id: string;
  memberId: string;
  relationshipId: string;
  versionId: string;
  versionNumber: number;
  levelKey: string;
  levelLabel: string;
  strength: PatternStrength;
  supportingCount: number;
  relatedCount: number;
  distinctCategoryCount: number;
  sourceCount: number;
  evaluatedAt: string;
  evaluatedReason: EvaluationReason;
  /** The stored signal rows that contributed, by id and role. */
  contributingSignalIds: string[];
};

const MATCH_COLUMNS =
  'id, member_id, relationship_id, version_id, version_number, level_key, level_label, strength, supporting_count, related_count, distinct_category_count, source_count, evaluated_at, evaluated_reason';

type MatchRow = {
  id: string;
  member_id: string;
  relationship_id: string;
  version_id: string;
  version_number: number;
  level_key: string;
  level_label: string;
  strength: string;
  supporting_count: number;
  related_count: number;
  distinct_category_count: number;
  source_count: number;
  evaluated_at: string;
  evaluated_reason: string;
};

/**
 * Every current evaluation for one member, with the rows behind each one.
 *
 * Read through whichever client the caller hands in. A coach surface
 * passes her session, so migration 245's select policy decides; the engine
 * passes the trusted connection.
 */
export async function listMatchesForMember(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ ok: boolean; records: PatternMatchRecord[] }> {
  const { rows: data, error } = await selectAllRows<MatchRow>(() =>
    supabase
      .from('cross_system_pattern_matches')
      .select(MATCH_COLUMNS)
      .eq('member_id', memberId)
      .order('evaluated_at', { ascending: false })
      .order('id', { ascending: true })
  );
  if (error) {
    console.error('listMatchesForMember failed', error);
    return { ok: false, records: [] };
  }
  const rows = (data ?? []) as unknown as MatchRow[];
  if (rows.length === 0) return { ok: true, records: [] };

  const contributions = await selectAllRowsInChunks<{ match_id: string; signal_id: string }>(
    rows.map((row) => row.id),
    (chunk) =>
      supabase
        .from('cross_system_pattern_match_signals')
        .select('match_id, signal_id')
        .in('match_id', chunk)
        .order('id', { ascending: true })
  );
  if (contributions.error) {
    console.error('listMatchesForMember contributions failed', contributions.error);
  }
  const byMatch = new Map<string, string[]>();
  for (const row of contributions.error ? [] : contributions.rows) {
    const held = byMatch.get(row.match_id);
    if (held) held.push(row.signal_id);
    else byMatch.set(row.match_id, [row.signal_id]);
  }

  return {
    ok: true,
    records: rows.map((row) => ({
      id: row.id,
      memberId: row.member_id,
      relationshipId: row.relationship_id,
      versionId: row.version_id,
      versionNumber: row.version_number,
      levelKey: row.level_key,
      levelLabel: row.level_label,
      strength: row.strength as PatternStrength,
      supportingCount: row.supporting_count,
      relatedCount: row.related_count,
      distinctCategoryCount: row.distinct_category_count,
      sourceCount: row.source_count,
      evaluatedAt: row.evaluated_at,
      evaluatedReason: row.evaluated_reason as EvaluationReason,
      contributingSignalIds: byMatch.get(row.id) ?? [],
    })),
  };
}

/**
 * Replaces this member's whole ledger with what the engine just found.
 *
 * THE DELETE COMES FIRST AND IT IS THE POINT. A pattern that used to
 * surface and no longer does, because a signal settled or because the
 * coach deactivated its definition, must leave nothing behind. Scoping the
 * delete to the relationships the caller EVALUATED rather than to the
 * member's whole ledger is what lets a single relationship's change be
 * re-evaluated without discarding everything else it did not look at.
 *
 * `evaluatedAt` is passed in rather than read from a clock here, so the
 * whole of one pass carries one instant and a test can drive it.
 */
export async function replaceMatches(
  supabase: SupabaseClient,
  input: {
    memberId: string;
    /** The relationships this pass considered, matched or not. */
    consideredRelationshipIds: readonly string[];
    matches: readonly PatternMatch[];
    reason: EvaluationReason;
    evaluatedAt: string;
  }
): Promise<{ ok: boolean; written: number }> {
  if (input.consideredRelationshipIds.length === 0) return { ok: true, written: 0 };

  const cleared = await writeInChunks([...input.consideredRelationshipIds], (chunk) =>
    supabase
      .from('cross_system_pattern_matches')
      .delete()
      .eq('member_id', input.memberId)
      .in('relationship_id', chunk)
  );
  if (cleared.error) {
    console.error('replaceMatches delete failed', cleared.error);
    return { ok: false, written: 0 };
  }

  const surfaced = input.matches.filter((match) => match.surfaced);
  if (surfaced.length === 0) return { ok: true, written: 0 };

  const { rows: data, error } = await writeInChunks(
    surfaced.map((match) => ({
      member_id: input.memberId,
      relationship_id: match.head.id,
      version_id: match.version.id,
      version_number: match.version.versionNumber,
      level_key: match.levelKey,
      level_label: match.levelLabel,
      strength: match.strength,
      supporting_count: match.supportingCount,
      related_count: match.relatedCount,
      distinct_category_count: match.distinctCategoryCount,
      source_count: match.sourceCount,
      evaluated_at: input.evaluatedAt,
      evaluated_reason: input.reason,
    })),
    (chunk) => supabase.from('cross_system_pattern_matches').insert(chunk).select('id, relationship_id')
  );
  if (error || !data) {
    console.error('replaceMatches insert failed', error);
    return { ok: false, written: 0 };
  }

  const idByRelationship = new Map(
    (data as { id: string; relationship_id: string }[]).map((row) => [row.relationship_id, row.id])
  );

  // EXACTLY WHICH ROWS CONTRIBUTED. This is the point of the whole ledger:
  // a match that could not name the rows behind it is an assertion.
  const contributions: {
    match_id: string;
    signal_id: string;
    role: string;
    component_position: number;
  }[] = [];
  for (const match of surfaced) {
    const matchId = idByRelationship.get(match.head.id);
    if (!matchId) continue;
    for (const entry of [...match.primary, ...match.supporting]) {
      contributions.push({
        match_id: matchId,
        signal_id: entry.record.id,
        role: entry.role,
        component_position: entry.componentPosition,
      });
    }
  }
  if (contributions.length > 0) {
    // Grows with matches times the signals behind each, so it goes in chunks.
    const written = await writeInChunks(contributions, (chunk) =>
      supabase.from('cross_system_pattern_match_signals').insert(chunk)
    );
    if (written.error) {
      console.error('replaceMatches contributions failed', written.error);
      return { ok: false, written: surfaced.length };
    }
  }

  return { ok: true, written: surfaced.length };
}

/**
 * The members who could possibly be affected by one definition.
 *
 * A MEMBER WITH NONE OF THE SIGNALS A DEFINITION NAMES CANNOT MATCH IT, so
 * a relationship edit does not need a sweep of the membership. This asks
 * the signal table for the members holding a row under any of that
 * definition's own keys, which is one indexed read and is bounded by the
 * cap the caller passes.
 */
export async function membersHoldingAny(
  supabase: SupabaseClient,
  refs: { signalSlugs: string[]; categoryKeys: string[]; bodyAreaKeys: string[] },
  limit: number
): Promise<string[]> {
  const clauses: string[] = [];
  if (refs.signalSlugs.length > 0) clauses.push(`signal_slug.in.(${quoted(refs.signalSlugs)})`);
  if (refs.categoryKeys.length > 0) clauses.push(`category_key.in.(${quoted(refs.categoryKeys)})`);
  if (refs.bodyAreaKeys.length > 0) clauses.push(`body_area_key.in.(${quoted(refs.bodyAreaKeys)})`);
  if (clauses.length === 0) return [];

  // `limit * 40` rows is above PostgREST's 1,000 row cap from a limit of 26,
  // and the default pass asks for 200 members, so the rows are paged up to
  // that number rather than asked for in one request that returns 1,000.
  const { rows: data, error } = await selectAllRows<{ member_id: string }>(
    () =>
      // scale-exempt: the clauses name the signal, category and area keys of ONE map entry
      supabase.from('cross_system_signals').select('member_id').or(clauses.join(',')).order('id', { ascending: true }),
    { limit: limit * 40 }
  );
  if (error) {
    console.error('membersHoldingAny failed', error);
    return [];
  }
  const seen: string[] = [];
  for (const row of (data ?? []) as { member_id: string }[]) {
    if (seen.includes(row.member_id)) continue;
    seen.push(row.member_id);
    if (seen.length >= limit) break;
  }
  return seen;
}

/**
 * PostgREST's `or` takes a bare comma separated list, so a key carrying a
 * comma, a bracket or a quote would otherwise change the shape of the
 * filter. Every key this is called with is a slug the server resolved out
 * of the Signal Library, but a filter that is only safe because of where
 * its input came from is one refactor away from not being.
 */
function quoted(values: readonly string[]): string {
  return values
    .filter((value) => /^[a-z0-9_-]+$/i.test(value))
    .map((value) => `"${value}"`)
    .join(',');
}
