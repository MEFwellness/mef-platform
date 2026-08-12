/**
 * The one call path from this service layer into the database.
 *
 * Every analytics function goes through here, which is what makes three
 * guarantees checkable in one place rather than per call site:
 *
 *   1. All aggregation happens in Postgres. This helper only ever receives
 *      a finished summary. Nothing in this layer selects raw event rows and
 *      counts them in JavaScript, and nothing ever should: the event table
 *      is designed to grow to tens of millions of rows.
 *   2. Authorization failures surface as a distinct error rather than as an
 *      empty result. An empty analytics report and a rejected one look
 *      identical on a dashboard, and confusing the two is how a permissions
 *      bug hides for months.
 *   3. Test accounts and the date range are passed explicitly on every
 *      call. There is no ambient default hiding in a client.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** The caller is not a platform administrator. Thrown, never swallowed into an empty report. */
export class AnalyticsAccessDeniedError extends Error {
  constructor(message = 'Analytics services require the platform_administrator role.') {
    super(message);
    this.name = 'AnalyticsAccessDeniedError';
  }
}

/** The query itself failed. Distinct from "there was no data", which is a normal, successful result. */
export class AnalyticsQueryError extends Error {
  readonly functionName: string;
  constructor(functionName: string, message: string) {
    super(`${functionName} failed: ${message}`);
    this.name = 'AnalyticsQueryError';
    this.functionName = functionName;
  }
}

/**
 * Postgres raises 42501 (insufficient_privilege) from
 * analytics_assert_admin. PostgREST forwards the code, but not always in
 * the same field depending on how the failure surfaced, so both the code
 * and the message are checked.
 */
function isAccessDenied(error: { code?: string | null; message?: string | null }): boolean {
  if (error.code === '42501') return true;
  const message = error.message ?? '';
  return message.includes('platform_administrator') || message.includes('platform administrator');
}

export async function callAnalyticsRpc<T>(
  supabase: SupabaseClient,
  functionName: string,
  params: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.rpc(functionName, params);

  if (error) {
    if (isAccessDenied(error)) throw new AnalyticsAccessDeniedError(error.message);
    throw new AnalyticsQueryError(functionName, error.message);
  }

  return data as T;
}
