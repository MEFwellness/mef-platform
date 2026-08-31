/**
 * Reading the acquisition funnel.
 *
 * ONE QUERY, ONE VIEW. Everything here reads public_entry_funnel (migration
 * 197), which has already resolved each arrival's source and settled its
 * is_test flag. Nothing recomputes either, so a number on the admin screen
 * and a number somebody types into SQL cannot disagree.
 *
 * THE TEST FILTER IS NOT OPTIONAL AND IT IS NOT PER SCREEN. An arrival is
 * test traffic when the SOURCE is one of ours or when the member who later
 * claimed it is a test account, and the view settles both. The reader here
 * takes `includeTest` so the one screen that genuinely wants to see the
 * fixtures can, and it defaults to false everywhere else.
 *
 * WHY THE POST-ACCOUNT STEPS ARE NOT HERE. Activation and return are
 * behaviour inside the product, and that already has a pipeline
 * (product_analytics_events, migration 146). Joining it to a source is one
 * join through member_public_entry_origin, and it is written out in
 * docs/ACQUISITION_FUNNEL.md rather than being hidden inside a function, so
 * whoever asks the question can see exactly what they are asking.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type FunnelRow = {
  sessionId: string;
  sourceCode: string | null;
  sourceRaw: string | null;
  sourceLabel: string;
  sourceChannel: string;
  patternKey: string | null;
  isTest: boolean;
  didStart: boolean;
  didComplete: boolean;
  didLeaveEmail: boolean;
  didClickToApp: boolean;
  didCreateAccount: boolean;
  firstSeenAt: string;
};

/** The seven steps, in the order somebody moves through them. `reached` is every arrival, so a source with a hundred clicks and no starts is visible rather than absent. */
export type SourceFunnel = {
  sourceCode: string;
  sourceLabel: string;
  sourceChannel: string;
  reached: number;
  started: number;
  completed: number;
  engagedResult: number;
  leads: number;
  clickedToApp: number;
  accounts: number;
};

const ROW_COLUMNS =
  'session_id, source_code, source_raw, source_label, source_channel, pattern_key, is_test, did_start, did_complete, did_leave_email, did_click_to_app, did_create_account, first_seen_at';

export async function listFunnelRows(
  supabase: SupabaseClient,
  options: { includeTest?: boolean; sinceIso?: string } = {}
): Promise<FunnelRow[]> {
  let query = supabase.from('public_entry_funnel').select(ROW_COLUMNS);
  if (!options.includeTest) query = query.eq('is_test', false);
  if (options.sinceIso) query = query.gte('first_seen_at', options.sinceIso);

  const { data, error } = await query.order('first_seen_at', { ascending: false });
  if (error) {
    console.error('listFunnelRows failed', error);
    return [];
  }
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      sessionId: r.session_id as string,
      sourceCode: (r.source_code as string | null) ?? null,
      sourceRaw: (r.source_raw as string | null) ?? null,
      sourceLabel: r.source_label as string,
      sourceChannel: r.source_channel as string,
      patternKey: (r.pattern_key as string | null) ?? null,
      isTest: Boolean(r.is_test),
      didStart: Boolean(r.did_start),
      didComplete: Boolean(r.did_complete),
      didLeaveEmail: Boolean(r.did_leave_email),
      didClickToApp: Boolean(r.did_click_to_app),
      didCreateAccount: Boolean(r.did_create_account),
      firstSeenAt: r.first_seen_at as string,
    };
  });
}

/**
 * "Read past the fold of their own result" is an event rather than a column,
 * because it is the one step that is about attention rather than about a
 * row changing. Counted here as the set of sessions with a result_engaged
 * event, so the caller can pass it in rather than every reader having to
 * know that.
 */
export async function engagedSessionIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('public_entry_events')
    .select('session_id')
    .eq('event_type', 'result_engaged');
  if (error) {
    console.error('engagedSessionIds failed', error);
    return new Set();
  }
  return new Set((data ?? []).map((row) => (row as { session_id: string }).session_id));
}

/**
 * The funnel per source. An arrival with no code at all is grouped as
 * 'direct'; an arrival carrying a code we never registered is grouped under
 * that code, so a mistyped or invented link shows up as its own row and can
 * be investigated rather than quietly inflating direct traffic.
 */
export function rollUpBySource(rows: FunnelRow[], engaged: Set<string>): SourceFunnel[] {
  const bucket = new Map<string, SourceFunnel>();

  for (const row of rows) {
    const key = row.sourceCode ?? row.sourceRaw ?? 'direct';
    let entry = bucket.get(key);
    if (!entry) {
      entry = {
        sourceCode: key,
        sourceLabel: row.sourceLabel,
        sourceChannel: row.sourceChannel,
        reached: 0,
        started: 0,
        completed: 0,
        engagedResult: 0,
        leads: 0,
        clickedToApp: 0,
        accounts: 0,
      };
      bucket.set(key, entry);
    }
    entry.reached += 1;
    if (row.didStart) entry.started += 1;
    if (row.didComplete) entry.completed += 1;
    if (engaged.has(row.sessionId)) entry.engagedResult += 1;
    if (row.didLeaveEmail) entry.leads += 1;
    if (row.didClickToApp) entry.clickedToApp += 1;
    if (row.didCreateAccount) entry.accounts += 1;
  }

  return [...bucket.values()].sort((a, b) => b.reached - a.reached || a.sourceCode.localeCompare(b.sourceCode));
}

/** The same seven counts across every source, so the screen can show the whole experiment as one line before it breaks it down. */
export function totalsOf(rows: SourceFunnel[]): Omit<SourceFunnel, 'sourceCode' | 'sourceLabel' | 'sourceChannel'> {
  return rows.reduce(
    (total, row) => ({
      reached: total.reached + row.reached,
      started: total.started + row.started,
      completed: total.completed + row.completed,
      engagedResult: total.engagedResult + row.engagedResult,
      leads: total.leads + row.leads,
      clickedToApp: total.clickedToApp + row.clickedToApp,
      accounts: total.accounts + row.accounts,
    }),
    { reached: 0, started: 0, completed: 0, engagedResult: 0, leads: 0, clickedToApp: 0, accounts: 0 }
  );
}

/** How many arrivals landed on each pattern. Useful for one question only: whether the rules are producing a spread or funnelling everybody into one answer. */
export function patternSpread(rows: FunnelRow[]): { patternKey: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.patternKey) continue;
    counts.set(row.patternKey, (counts.get(row.patternKey) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([patternKey, count]) => ({ patternKey, count }))
    .sort((a, b) => b.count - a.count);
}
