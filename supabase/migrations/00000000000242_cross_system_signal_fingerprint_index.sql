-- The Signal Library's re-ingestion guard, made usable as an ON CONFLICT
-- target.
--
-- WHAT WAS WRONG. Migration 240 wrote the fingerprint index as a PARTIAL
-- unique index, `where ingest_fingerprint is not null`, to say out loud
-- that a coach entry carries no fingerprint and is never deduplicated.
-- That is the correct intent, and it is also unusable as an upsert target:
-- Postgres will only infer a partial index for ON CONFLICT when the
-- statement repeats the index's own WHERE clause, and PostgREST's
-- `onConflict` has no way to send one. Every ingestion write came back
-- 42P10, "there is no unique or exclusion constraint matching the ON
-- CONFLICT specification", and wrote nothing. Caught on the first real
-- backfill run, before any signal had been written.
--
-- WHAT REPLACES IT, AND WHY IT SAYS THE SAME THING. A plain unique index
-- on (member_id, ingest_fingerprint). Postgres treats NULLs as distinct in
-- a unique index by default, so any number of rows with a null fingerprint
-- coexist: a coach recording the same thing twice in one day still records
-- it twice, which is the behaviour the partial predicate was there to
-- protect. The only thing that changed is that the index is now inferrable.
--
-- Nothing else about the table moves. No policy, no column, no row.

drop index if exists cross_system_signals_fingerprint_idx;

-- NULLS ARE DISTINCT, which is the default and is relied on here rather
-- than merely tolerated: it is what keeps a coach entry, which carries no
-- fingerprint, out of this constraint entirely.
create unique index cross_system_signals_fingerprint_idx
  on cross_system_signals (member_id, ingest_fingerprint);

comment on index cross_system_signals_fingerprint_idx is
  'Re-running ingestion over one completed sitting writes nothing the second time. A coach entry carries a null fingerprint and is never deduplicated, because nulls are distinct here.';
