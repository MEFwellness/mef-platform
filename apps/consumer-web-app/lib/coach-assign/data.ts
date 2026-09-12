/**
 * The two reads the coach's assign form needs that nothing else on the
 * page already made.
 *
 * BOTH ARE READS AND NOTHING ELSE. No render on this page writes anything,
 * and neither of these is an exception.
 *
 * NAMING THE COACH WHO SENT IT IS SUBJECT TO RLS, AND THAT IS CORRECT.
 * profiles lets a coach read their own row and their own clients' rows
 * (migration 16), so another coach's name comes back only for an
 * administrator. That is not a gap to work around: the form says "by you"
 * when it is the reader's own assignment, falls back to the stored
 * "another coach" line when the name cannot be read, and never invents
 * one. A failed read and an empty result resolve the same way here on
 * purpose, because both mean the same thing to the sentence: we cannot
 * name them.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_COACH_ASSIGN_COPY } from './copy';

/**
 * Every line of the assign form, stored rows over the approved defaults.
 *
 * A FAILED READ IS THE DEFAULTS, NOT AN EMPTY FORM. These sentences are
 * what the form is made of, and a coach staring at blank lines because one
 * query failed is worse than a coach reading the wording this app shipped
 * with.
 */
export async function loadCoachAssignCopy(
  supabase: SupabaseClient
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('coach_assign_copy')
    .select('copy_key, value')
    .eq('is_active', true);

  if (error) {
    console.error('loadCoachAssignCopy failed', error);
    return { ...DEFAULT_COACH_ASSIGN_COPY };
  }

  const out: Record<string, string> = { ...DEFAULT_COACH_ASSIGN_COPY };
  for (const row of data ?? []) out[row.copy_key as string] = row.value as string;
  return out;
}

/** The coaches this reader is allowed to see, by auth user id. Anything unreadable is simply absent. */
export async function loadAssignerNames(
  supabase: SupabaseClient,
  assignerIds: readonly string[]
): Promise<Record<string, string>> {
  const ids = [...new Set(assignerIds)].filter((id) => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) return {};

  const { data, error } = await supabase.from('profiles').select('id, display_name').in('id', ids);

  if (error) {
    console.error('loadAssignerNames failed', error);
    return {};
  }

  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    const name = ((row.display_name as string | null) ?? '').trim();
    if (name.length > 0) out[row.id as string] = name;
  }
  return out;
}
