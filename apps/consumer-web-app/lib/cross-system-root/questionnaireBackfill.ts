/**
 * BACKFILL: ROOT READS EVERY BODY SYSTEMS SURVEY ALREADY TAKEN.
 *
 * WHY IT EXISTS. Root starts reading a sitting when it completes. Members
 * who finished the survey before that would otherwise stay invisible to
 * Root Noticed until they happened to sit it again. This walks the sittings
 * already stored and runs them through the SAME two steps a live submit
 * runs: the Signal Library's own ingestion (so every answer the survey rule
 * treats as active is filed) and the survey lookup (so her newest sitting
 * consults the Association Map). There is no second mapping and no second
 * lookup in this file.
 *
 * SAFE TO RUN AS MANY TIMES AS ANYONE LIKES, and provably so.
 *   A signal row carries a fingerprint naming the sitting and the question,
 *     so a second run files nothing new.
 *   A survey finding carries a digest of everything it contains, so a
 *     second run over unchanged data deletes nothing and writes nothing,
 *     and every row keeps its id (./data.ts, replaceFindings).
 *
 * WHAT IT NEVER DOES. It never writes to a survey sitting, a score, a band,
 * a result or a red flag: it only reads member_body_systems_sessions. It
 * never reads a sitting that has not completed with a stored reading, so a
 * half finished survey is never treated as finished. It runs from a script,
 * never from a page, so no screen can set it off.
 *
 * EVERY READ ACROSS MEMBERS IS PAGED (lib/data/pagedSelect.ts). The sitting
 * scan and the profile lookup both read across the whole membership, which
 * is exactly the read the thousand row cap cuts silently.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllRows } from '@/lib/data/pagedSelect';
import { ingestSitting } from '@/lib/cross-system-signals/service';
import { SOURCE_BODY_SYSTEMS } from '@/lib/cross-system-signals/constants';
import { runQuestionnaireLookup, type QuestionnaireLookupOutcome } from './questionnaireEngine';

export type QuestionnaireBackfillMember = {
  memberId: string;
  isTest: boolean;
  /** Completed sittings found, oldest first. */
  sittingIds: string[];
  /** Signal rows this run filed. Zero on a second run. */
  signalsWritten: number;
  /** Null on a dry run or a skipped member. */
  lookup: QuestionnaireLookupOutcome | null;
  skippedAsTest: boolean;
};

export type QuestionnaireBackfillResult = {
  members: QuestionnaireBackfillMember[];
  sittingsRead: number;
  signalsWritten: number;
  findingsWritten: number;
  membersUnchanged: number;
};

type SittingRow = { id: string; member_id: string; completed_at: string };

/** How many member ids one profile read names. */
const PROFILE_CHUNK = 200;

/** Every completed sitting with a stored reading, oldest first, across the membership. */
export async function listCompletedSittings(
  supabase: SupabaseClient,
  memberId: string | null
): Promise<{ ok: boolean; rows: SittingRow[] }> {
  const { ok, rows, error } = await selectAllRows<SittingRow>(() => {
    let query = supabase
      .from('member_body_systems_sessions')
      .select('id, member_id, completed_at')
      .not('completed_at', 'is', null)
      .not('results', 'is', null);
    if (memberId) query = query.eq('member_id', memberId);
    return query.order('completed_at', { ascending: true }).order('id', { ascending: true });
  });
  if (!ok) console.error('listCompletedSittings failed', error);
  return { ok, rows };
}

/** Which of these members are seeded test accounts. */
async function testAccounts(
  supabase: SupabaseClient,
  memberIds: readonly string[]
): Promise<{ ok: boolean; ids: Set<string> }> {
  const ids = new Set<string>();
  for (let index = 0; index < memberIds.length; index += PROFILE_CHUNK) {
    const chunk = memberIds.slice(index, index + PROFILE_CHUNK);
    const { ok, rows, error } = await selectAllRows<{ id: string; is_test: boolean | null }>(() =>
      supabase
        .from('profiles')
        .select('id, is_test')
        .in('id', chunk)
        .order('id', { ascending: true })
    );
    if (!ok) {
      console.error('testAccounts read failed', error);
      return { ok: false, ids };
    }
    for (const row of rows) if (row.is_test === true) ids.add(row.id);
  }
  return { ok: true, ids };
}

export async function backfillQuestionnaireRoot(input: {
  client: SupabaseClient;
  /** One member only, whether or not she is a test account. */
  memberId?: string | null;
  /** Walk seeded test accounts too. Real members only without it. */
  includeTest?: boolean;
  /** List what would be walked and write nothing. */
  dryRun?: boolean;
  now?: string;
  onMember?: (member: QuestionnaireBackfillMember) => void;
}): Promise<QuestionnaireBackfillResult> {
  const supabase = input.client;
  const memberId = input.memberId ?? null;
  const result: QuestionnaireBackfillResult = {
    members: [],
    sittingsRead: 0,
    signalsWritten: 0,
    findingsWritten: 0,
    membersUnchanged: 0,
  };

  const scan = await listCompletedSittings(supabase, memberId);
  if (!scan.ok) throw new Error('Could not read completed Body Systems Survey sittings.');
  result.sittingsRead = scan.rows.length;

  const byMember = new Map<string, string[]>();
  for (const row of scan.rows) {
    const held = byMember.get(row.member_id);
    if (held) held.push(row.id);
    else byMember.set(row.member_id, [row.id]);
  }

  const tests = await testAccounts(supabase, [...byMember.keys()]);
  // An unreadable test flag is not permission to walk everybody.
  if (!tests.ok) throw new Error('Could not read which members are test accounts.');

  for (const [id, sittingIds] of byMember) {
    const isTest = tests.ids.has(id);
    const member: QuestionnaireBackfillMember = {
      memberId: id,
      isTest,
      sittingIds,
      signalsWritten: 0,
      lookup: null,
      skippedAsTest: false,
    };

    if (isTest && !input.includeTest && memberId === null) {
      member.skippedAsTest = true;
    } else if (!input.dryRun) {
      // OLDEST FIRST, the order they were sat in, so a signal is only
      // carried across as settled after it was first reported.
      for (const sittingId of sittingIds) {
        const filed = await ingestSitting({
          memberId: id,
          sourceKey: SOURCE_BODY_SYSTEMS,
          sittingId,
          client: supabase,
        });
        member.signalsWritten += filed.written;
      }
      member.lookup = await runQuestionnaireLookup({
        memberId: id,
        trigger: 'backfill',
        client: supabase,
        ...(input.now ? { now: input.now } : {}),
      });
      result.signalsWritten += member.signalsWritten;
      if (member.lookup.unchanged) result.membersUnchanged += 1;
      else if (member.lookup.skipped === null) result.findingsWritten += member.lookup.findings;
    }

    result.members.push(member);
    input.onMember?.(member);
  }

  return result;
}
