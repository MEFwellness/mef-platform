-- One running experiment per member per SUBJECT, enforced by the database
-- rather than by each experience remembering to check.
--
-- THE BUG. The Readiness Pulse deliberately targets the Life Signal
-- Check's own loudest signal (lib/readiness-pulse/scoring.ts, the
-- `targetSignal` line) and inherits its hardest-time-of-day for the timing
-- phrase. So a member who finishes both is guaranteed the same behavior
-- twice, worded from two parallel copy tables: "take a genuine 5-minute
-- break in the mornings" from one and "take a real 5-minute break in the
-- mornings" from the other. Both guards that already existed
-- (startLscExperimentAction, startRplExperimentAction) are scoped to a
-- single source_experience_key, so neither can see the other, and
-- MAX_ACTIVE_EXPERIMENTS permits exactly two. Three production accounts
-- were holding that pair, one of them as two genuinely running
-- experiments.
--
-- WHAT A SUBJECT IS. Not the source experience and not the title: the
-- thing the experiment is about, in one vocabulary every experience
-- shares. `signal:energy` for the Life Signal Check's chosen signal AND
-- the Readiness Pulse's target signal, because those are the same
-- behavior. `value:purpose` for a Core Values Snapshot experiment.
-- `experience:being-seen` for a deep-dive that has exactly one experiment
-- of its own, which includes the Readiness Pulse's two noticing patterns,
-- so "Daily Noticing" stays a genuinely different offer and never
-- suppresses a real signal experiment. `recommendation:<id>` for a
-- Recommendation Engine experiment. The full vocabulary, and the reason
-- for each namespace, is lib/lifestyle-experiments/subject.ts.

alter table lifestyle_experiments add column subject_key text;

-- DELIBERATELY NOT BACKFILLED. Every row written before this migration
-- keeps subject_key null, which is what puts it outside the index below.
-- One real member is running two Tension experiments right now, one from
-- the Life Signal Check and one from the Readiness Pulse, both inside
-- their seven-day window. Backfilling would mean either failing this
-- migration or rewriting a running experiment out from under her, and a
-- guard is not worth taking someone's week off them. Her two rows run out
-- on their own. Home stops drawing duplicates for her immediately either
-- way, because lib/lifestyle-experiments/subject.ts recovers a
-- pre-migration row's subject from the title it already stores
-- (SIGNAL_LABEL / AREA_LABEL, both reverse lookups that already existed
-- for the daily prompt).
--
-- So this index binds forward only, and it binds completely: every
-- experiment started from here on carries a subject_key, from all ten
-- call sites, because they all go through one insert.

create unique index lifestyle_experiments_one_active_subject_per_member
  on lifestyle_experiments (member_id, subject_key)
  where status = 'active' and subject_key is not null;

comment on column lifestyle_experiments.subject_key is
  'What this experiment is about, in one vocabulary shared by every experience, so the Life Signal Check''s Energy experiment and the Readiness Pulse''s Energy experiment are recognisably the same thing. Null on every row predating migration 216, on purpose: see that migration and lib/lifestyle-experiments/subject.ts.';

-- Why a partial index on the stored status column is safe even though
-- 'expired_no_reflection' is a read-time derivation: expireOverdueExperiments
-- (lib/lifestyle-experiments/data.ts) writes that derivation back onto the
-- row, and every path that can insert an experiment calls
-- countActiveExperiments first, which calls it. So an overdue row has
-- already left this index by the time anyone tries to start its
-- replacement, and a genuine restart is never blocked.
