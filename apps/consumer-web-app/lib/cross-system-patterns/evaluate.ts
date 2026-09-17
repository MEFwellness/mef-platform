/**
 * RE-EVALUATION. The three moments the engine runs, and what each one
 * costs.
 *
 * A RENDER NEVER DECIDES ANYTHING, so none of this happens on one. Each
 * function below is called by an explicit act:
 *
 *   a member finished a sitting and its signals were just ingested;
 *   a coach pressed Save on the Add Signal tool;
 *   a coach saved, activated or deactivated a definition.
 *
 * The coach's card itself is computed LIVE by the pure matcher on every
 * read, which is why a render never needs to write: the screen is correct
 * the instant any of the three happen, whether or not the ledger write
 * succeeded. What the ledger adds is the record of which version was read
 * and which rows satisfied it on the day. See ./data.ts.
 *
 * EVERY RUN IS BEST EFFORT AND NEVER THROWS. A member's sitting is already
 * saved and already returned to her by the time any of this is called, and
 * a coach's signal is already stored. Nothing here may turn a failure to
 * file an evaluation into a failure to finish an assessment or save an
 * entry, so every function catches, logs and returns a count.
 *
 * INACTIVE DEFINITIONS ARE NOT READ. `matchMemberSignals` filters on the
 * head record's active flag before it looks at a signal, and a
 * deactivation re-evaluates precisely so the rows it used to write are
 * deleted rather than left standing.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllRows } from '@/lib/data/pagedSelect';
import { listSignalsForMember } from '@/lib/cross-system-signals/data';
import { listRelationships } from '@/lib/cross-system-relationships/data';
import type { RelationshipSummary } from '@/lib/cross-system-relationships/types';
import { MAX_MEMBERS_PER_RELATIONSHIP_PASS, type EvaluationReason } from './constants';
import { membersHoldingAny, replaceMatches } from './data';
import { matchMemberSignals } from './match';
import { patternEngineServiceRoleClient } from './serviceRole';

export type EvaluationOutcome = {
  /** How many patterns this member currently surfaces across the definitions considered. */
  surfaced: number;
  /** Why nothing happened, when nothing happened. */
  skipped: null | 'no_service_role' | 'no_active_relationships' | 'read_failed' | 'write_failed';
};

const NOTHING: EvaluationOutcome = { surfaced: 0, skipped: 'no_service_role' };

/**
 * One member, against every active definition in the library.
 *
 * This is what an ingested sitting and a coach entry both call. The
 * considered set is every ACTIVE relationship, so a pattern that has
 * stopped meeting its floor has its ledger row removed by the same pass
 * that would have written it.
 *
 * An inactive relationship is deliberately NOT in the considered set: it
 * is handled by the deactivation itself, which re-evaluates its own
 * members, and including it here would make every ingestion pay for every
 * definition a coach has ever switched off.
 */
export async function evaluateMember(input: {
  memberId: string;
  reason: EvaluationReason;
  /** Overridden only by tests and the backfill, which supply their own connection. */
  client?: SupabaseClient;
  /** Overridden only by tests, so a pass can be driven at a known instant. */
  now?: string;
}): Promise<EvaluationOutcome> {
  const supabase = input.client ?? patternEngineServiceRoleClient();
  if (!supabase) return NOTHING;

  try {
    const [listed, signals] = await Promise.all([
      listRelationships(supabase),
      listSignalsForMember(supabase, input.memberId),
    ]);
    if (!listed.ok || !signals.ok) return { surfaced: 0, skipped: 'read_failed' };

    const active = listed.summaries.filter((summary) => summary.head.isActive);
    if (active.length === 0) return { surfaced: 0, skipped: 'no_active_relationships' };

    const matches = matchMemberSignals(active, signals.records);
    const written = await replaceMatches(supabase, {
      memberId: input.memberId,
      consideredRelationshipIds: active.map((summary) => summary.head.id),
      matches,
      reason: input.reason,
      evaluatedAt: input.now ?? new Date().toISOString(),
    });
    if (!written.ok) return { surfaced: matches.length, skipped: 'write_failed' };
    return { surfaced: matches.length, skipped: null };
  } catch (error) {
    console.error('evaluateMember failed', error);
    return { surfaced: 0, skipped: 'write_failed' };
  }
}

/**
 * One definition that has just been saved, activated or deactivated.
 *
 * BOUNDED, BECAUSE A SWEEP WOULD NOT BE. A member holding none of the
 * signals a definition names cannot match it, so the pass re-evaluates the
 * members who hold at least one row under one of its own keys, plus
 * everybody who already has a ledger row for it, which is what lets a
 * DEACTIVATION clear the rows it wrote even for a member whose signals
 * have since been retired.
 *
 * The card is computed live on every read, so a member past the cap still
 * reads correctly on the screen; only her ledger row waits for her next
 * signal.
 */
export async function evaluateRelationshipChange(input: {
  relationshipId: string;
  client?: SupabaseClient;
  now?: string;
  limit?: number;
}): Promise<{ members: number; surfaced: number }> {
  const supabase = input.client ?? patternEngineServiceRoleClient();
  if (!supabase) return { members: 0, surfaced: 0 };

  try {
    const listed = await listRelationships(supabase);
    if (!listed.ok) return { members: 0, surfaced: 0 };
    const changed = listed.summaries.find((summary) => summary.head.id === input.relationshipId);

    const limit = input.limit ?? MAX_MEMBERS_PER_RELATIONSHIP_PASS;
    const candidates = new Set<string>();

    if (changed) {
      const refs = refsOf(changed);
      for (const memberId of await membersHoldingAny(supabase, refs, limit)) {
        candidates.add(memberId);
      }
    }

    // Everybody the previous version of this definition already surfaced
    // for. Without this, deactivating a pattern would leave its ledger rows
    // standing for any member whose signals no longer name it.
    const held = await selectAllRows<{ member_id: string }>(() =>
      supabase
        .from('cross_system_pattern_matches')
        .select('member_id')
        .eq('relationship_id', input.relationshipId)
        .order('id', { ascending: true })
    );
    if (held.error) console.error('evaluateRelationshipChange held read failed', held.error);
    for (const row of held.error ? [] : held.rows) candidates.add(row.member_id);

    let surfaced = 0;
    for (const memberId of candidates) {
      const outcome = await evaluateOneAgainstOne(supabase, {
        memberId,
        relationshipId: input.relationshipId,
        summary: changed && changed.head.isActive ? changed : null,
        now: input.now ?? new Date().toISOString(),
      });
      surfaced += outcome;
    }
    return { members: candidates.size, surfaced };
  } catch (error) {
    console.error('evaluateRelationshipChange failed', error);
    return { members: 0, surfaced: 0 };
  }
}

/**
 * One member against ONE definition, leaving her other ledger rows alone.
 *
 * A null summary means the definition is inactive or gone, so the pass
 * considers it and matches nothing, which deletes its row and writes none.
 */
async function evaluateOneAgainstOne(
  supabase: SupabaseClient,
  input: {
    memberId: string;
    relationshipId: string;
    summary: RelationshipSummary | null;
    now: string;
  }
): Promise<number> {
  const signals = await listSignalsForMember(supabase, input.memberId);
  if (!signals.ok) return 0;
  const matches = input.summary ? matchMemberSignals([input.summary], signals.records) : [];
  await replaceMatches(supabase, {
    memberId: input.memberId,
    consideredRelationshipIds: [input.relationshipId],
    matches,
    reason: 'relationship_changed',
    evaluatedAt: input.now,
  });
  return matches.length;
}

/** Every vocabulary key one definition names, in any role. */
function refsOf(summary: RelationshipSummary): {
  signalSlugs: string[];
  categoryKeys: string[];
  bodyAreaKeys: string[];
} {
  const signalSlugs = new Set<string>();
  const categoryKeys = new Set<string>();
  const bodyAreaKeys = new Set<string>();
  for (const component of summary.current.components) {
    if (component.refKind === 'signal') signalSlugs.add(component.refKey);
    if (component.refKind === 'category') categoryKeys.add(component.refKey);
    if (component.refKind === 'body_area') bodyAreaKeys.add(component.refKey);
  }
  return {
    signalSlugs: [...signalSlugs],
    categoryKeys: [...categoryKeys],
    bodyAreaKeys: [...bodyAreaKeys],
  };
}
