/**
 * The adapter registry.
 *
 * WHAT A NEW ASSESSMENT COSTS. One file under ./adapters/ exporting one
 * object, one line in the list at the foot of ./adapters/index.ts, one
 * source row and however many dictionary rows it needs in a content
 * migration. Nothing in this file, nothing in ./service.ts, nothing in the
 * store and nothing in the coach's panel changes, which is the whole point
 * of the shape below: the engine iterates the registry and never names a
 * source.
 *
 * EVERY ADAPTER IS TWO HALVES, AND THE SPLIT IS THE TESTABILITY.
 *
 *   `load` and `listCompleted` touch the database. They fetch a sitting
 *     and list the sittings a backfill should walk, and they are the only
 *     part of an adapter that knows a table name.
 *   `build` is PURE. It is handed what `load` fetched plus the loaded
 *     library, and it returns drafts. No clock, no client, no randomness,
 *     so every adapter's real mapping logic is driven in tests with a
 *     literal sitting and a literal library.
 *
 * `build` IS ALSO TOLD WHAT THE MEMBER ALREADY HAS. `knownSlugs` carries
 * the standardized names this member already has at least one signal for,
 * so an adapter can write a row for a signal that has SETTLED as well as
 * for one that is loud. A library that only ever ingested loud answers
 * would leave last month's alarm standing forever with nothing able to
 * close it, which is the same failure the Root Map's "publish every
 * section every time" rule exists to prevent. What it must not do is
 * write a row for something the member has never reported at all.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalDraft, SignalLibrary, SignalRecord } from './types';

/** One completed sitting an adapter can be asked to ingest. */
export type IngestibleSitting = {
  /** The sitting's own id. Also the id a fingerprint is built from. */
  id: string;
  /** When it finished, as an instant. */
  completedAt: string;
};

/** What `build` is told beyond the sitting itself. */
export type BuildContext = {
  library: SignalLibrary;
  /** The member's local day this sitting belongs to, resolved by the caller from her own timezone. */
  capturedOn: string;
  /** Standardized names this member already has at least one signal for. */
  knownSlugs: ReadonlySet<string>;
  /**
   * Her rows captured at or before this sitting, from every source.
   *
   * Only the Body Systems Survey reads it today, to ask whether another
   * source currently supports an answer (./questionnaireRules.ts). Optional,
   * so an adapter or a test that has no use for it passes nothing.
   */
  records?: readonly SignalRecord[];
};

/**
 * One registered source.
 *
 * TInput is whatever that source's own `load` returns, and it never
 * escapes the adapter: the engine only ever holds `SignalAdapter<unknown>`
 * through ./adapters/index.ts, so adding a source with a completely
 * different shape costs the engine nothing.
 */
export type SignalAdapter<TInput> = {
  /** Matches a row in cross_system_signal_sources. */
  sourceKey: string;
  /** What this adapter is, in one line, for the backfill script's output. */
  description: string;
  /** Every completed sitting for this member, newest first. Used by the backfill. */
  listCompleted(supabase: SupabaseClient, memberId: string): Promise<IngestibleSitting[]>;
  /** One sitting's stored rows, or null when it cannot be read or is not finished. */
  load(supabase: SupabaseClient, memberId: string, sittingId: string): Promise<TInput | null>;
  /** PURE. Maps what load fetched into drafts. Never reads a clock or a client. */
  build(input: TInput, context: BuildContext): SignalDraft[];
};

/** The registry, keyed by source. Built once from the adapter list. */
export type AdapterRegistry = ReadonlyMap<string, SignalAdapter<unknown>>;

export function buildRegistry(
  adapters: readonly SignalAdapter<never>[]
): AdapterRegistry {
  const map = new Map<string, SignalAdapter<unknown>>();
  for (const adapter of adapters) {
    if (map.has(adapter.sourceKey)) {
      throw new Error(`Two signal adapters claim the source "${adapter.sourceKey}".`);
    }
    map.set(adapter.sourceKey, adapter as unknown as SignalAdapter<unknown>);
  }
  return map;
}

/**
 * The fingerprint a draft carries, built in one place.
 *
 * It names the source, the sitting and the thing inside the sitting, and
 * nothing else. It deliberately does NOT include the value: re-running
 * ingestion over one completed sitting must write nothing the second time
 * even if the code that reads it has since changed its mind about the
 * label, and a finished sitting cannot be re-answered anyway.
 */
export function fingerprint(
  sourceKey: string,
  sittingId: string,
  externalKey: string
): string {
  return `${sourceKey}:${sittingId}:${externalKey}`;
}
