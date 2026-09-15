/**
 * Ingestion. The engine that runs the adapters and writes what they map.
 *
 * IT NAMES NO SOURCE. Everything below iterates the registry, which is why
 * adding a sixth assessment costs this file nothing at all.
 *
 * THE SHAPE OF ONE RUN.
 *   1. build the trusted connection, or do nothing at all;
 *   2. load the library once, and the member's known signal slugs once;
 *   3. ask the adapter to load the sitting, then to build drafts from it;
 *   4. write them, skipping any fingerprint this member already has.
 *
 * EVERY RUN IS BEST EFFORT AND NEVER THROWS. A member's completed sitting
 * is already saved and already returned to her by the time any of this is
 * called. Nothing in this file may turn a failure to file a signal into a
 * failure to finish an assessment, so every caller below catches, logs and
 * returns a count rather than propagating.
 *
 * EVERY DATE NAMES ITS TIMEZONE. `capturedOn` is resolved from the
 * MEMBER'S own zone, from the instant the sitting actually completed, by
 * lib/time/localDate.ts. No adapter reads a clock and nothing here calls
 * `new Date()` to mean today.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { localDateStringFor } from '../time/localDate';
import { memberTimezone } from '../time/memberToday';
import { SIGNAL_ADAPTER_REGISTRY } from './adapters';
import { loadSignalLibrary } from './contentData';
import { insertSignals, knownSignalSlugs } from './data';
import { signalLibraryServiceRoleClient } from './serviceRole';
import type { AdapterRegistry } from './registry';

export type IngestOutcome = {
  /** How many signal rows this run actually wrote. Zero on a re-run over the same sitting. */
  written: number;
  /** Why nothing happened, when nothing happened. Null on a run that reached the adapters. */
  skipped:
    | null
    | 'no_service_role'
    | 'unknown_source'
    | 'sitting_not_readable'
    | 'nothing_to_map'
    | 'write_failed';
};

const NOTHING: IngestOutcome = { written: 0, skipped: 'no_service_role' };

/**
 * One completed sitting, one source.
 *
 * Called from the server action that completed the sitting, after it has
 * already saved and already decided what to return to the member.
 */
export async function ingestSitting(input: {
  memberId: string;
  sourceKey: string;
  sittingId: string;
  /** Overridden only by tests and by the backfill, which supply their own connection. */
  client?: SupabaseClient;
  registry?: AdapterRegistry;
}): Promise<IngestOutcome> {
  const supabase = input.client ?? signalLibraryServiceRoleClient();
  if (!supabase) return NOTHING;

  const registry = input.registry ?? SIGNAL_ADAPTER_REGISTRY;
  const adapter = registry.get(input.sourceKey);
  if (!adapter) {
    console.error('ingestSitting: no adapter registered for', input.sourceKey);
    return { written: 0, skipped: 'unknown_source' };
  }

  try {
    const loaded = await adapter.load(supabase, input.memberId, input.sittingId);
    if (loaded === null) return { written: 0, skipped: 'sitting_not_readable' };

    const [library, knownSlugs, timezone] = await Promise.all([
      loadSignalLibrary(supabase),
      knownSignalSlugs(supabase, input.memberId),
      memberTimezone(supabase, input.memberId),
    ]);

    // HER day, from the instant the sitting completed. The adapter is
    // handed this rather than allowed to read a clock, which is what keeps
    // a backfill of a sitting from March dated March.
    const completedAt = completedAtOf(loaded);
    const capturedOn = localDateStringFor(completedAt, timezone);

    const drafts = adapter.build(loaded, { library, capturedOn, knownSlugs });
    if (drafts.length === 0) return { written: 0, skipped: 'nothing_to_map' };

    const write = await insertSignals(supabase, input.memberId, drafts);
    if (!write.ok) return { written: 0, skipped: 'write_failed' };
    return { written: write.written, skipped: null };
  } catch (error) {
    console.error('ingestSitting failed', input.sourceKey, error);
    return { written: 0, skipped: 'write_failed' };
  }
}

/**
 * The instant a loaded sitting finished.
 *
 * Every adapter's input carries one, under `completedAt` or under
 * `recordedAt` for the check-in, whose row already resolved its own day.
 * Falling back to the current instant would date a backfilled sitting
 * today, so an input with neither is refused by returning an empty string,
 * which `localDateStringFor` turns into an invalid date the adapter's own
 * mapping then has to survive. In practice no adapter can produce one:
 * every `load` above returns null rather than a sitting with no instant.
 */
function completedAtOf(loaded: unknown): string {
  if (loaded && typeof loaded === 'object') {
    const record = loaded as Record<string, unknown>;
    if (typeof record.completedAt === 'string') return record.completedAt;
    if (typeof record.recordedAt === 'string') return record.recordedAt;
  }
  return '';
}

/**
 * Every completed sitting this member has, across every registered source.
 *
 * THIS IS THE BACKFILL. It is safe to run as many times as anyone likes,
 * because the fingerprint index turns the second run into nothing. It is
 * also what a coach's panel would call if a source were added later and
 * her old sittings needed filing.
 */
export async function ingestAllForMember(input: {
  memberId: string;
  client?: SupabaseClient;
  registry?: AdapterRegistry;
  /** Called after each source, so a script can print progress. */
  onSource?: (sourceKey: string, sittings: number, written: number) => void;
}): Promise<{ written: number; bySource: Record<string, number> }> {
  const supabase = input.client ?? signalLibraryServiceRoleClient();
  if (!supabase) return { written: 0, bySource: {} };

  const registry = input.registry ?? SIGNAL_ADAPTER_REGISTRY;
  const bySource: Record<string, number> = {};
  let written = 0;

  for (const [sourceKey, adapter] of registry) {
    let sourceWritten = 0;
    let sittings = 0;
    try {
      const completed = await adapter.listCompleted(supabase, input.memberId);
      sittings = completed.length;
      // OLDEST FIRST, so `knownSlugs` grows the way it did in real life and
      // a settled signal is only carried across after it was first
      // reported. Newest first would let March close out something
      // February had not yet said.
      const ordered = [...completed].sort((a, b) => a.completedAt.localeCompare(b.completedAt));
      for (const sitting of ordered) {
        const outcome = await ingestSitting({
          memberId: input.memberId,
          sourceKey,
          sittingId: sitting.id,
          client: supabase,
          registry,
        });
        sourceWritten += outcome.written;
      }
    } catch (error) {
      console.error('ingestAllForMember failed for', sourceKey, error);
    }
    bySource[sourceKey] = sourceWritten;
    written += sourceWritten;
    input.onSource?.(sourceKey, sittings, sourceWritten);
  }

  return { written, bySource };
}
