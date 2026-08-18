-- ============================================================================
-- 180. One LIVE review per program, not one open one.
-- ============================================================================
-- Found by the live run, and it is the reason a coach pressing Discard was
-- discarding the wrong thing.
--
-- WHAT HAPPENED, precisely.
--
-- The review screen creates a review as a side effect of rendering: open
-- the page, get a review. Migration 178 made that safe with a partial
-- unique index on (member_id, program_group_key) WHERE status = 'open', so
-- opening the page twice lands on the same review.
--
-- But a Next.js server action revalidates the route it was called from, so
-- the page RE-RENDERS after every action. By then the coach had chosen an
-- outcome and the review's status was 'drafted', not 'open'. The index no
-- longer covered it, the re-render found no open review, and it inserted a
-- SECOND one. React then handed the screen the new review, so the Discard
-- button was pointing at an empty review that had never drafted anything.
-- It discarded that, correctly and uselessly, and the real draft stayed
-- exactly where it was. A third review appeared for the same reason.
--
-- THE FIX IS THE INDEX, not the screen. 'open' was the wrong definition of
-- "the review a coach is working on". A DRAFTED review is still the one she
-- is working on: she has written a draft and has not yet approved or
-- discarded it. Only 'approved' and 'discarded' are done.
--
-- So the index covers both live states, and lib/programs/review/data.ts's
-- reader is widened to match. A re-render now finds the review that already
-- exists, whatever state it is in, and can no longer create a second.
--
-- Nothing about the terminal states changes. A coach may open a fresh
-- review of the same program the moment the last one is approved or
-- discarded, which is exactly what she should be able to do.
-- ============================================================================

drop index if exists public.program_phase_reviews_one_open_idx;

create unique index program_phase_reviews_one_live_idx
  on public.program_phase_reviews (member_id, program_group_key)
  where status in ('open', 'drafted');

comment on index public.program_phase_reviews_one_live_idx is
  'One review per member per program that is not finished. Covers open AND drafted, because a drafted review is still the one the coach is working on, and because a re-render that finds no live review inserts a second one.';

-- ============================================================================
-- Assertions.
-- ============================================================================
do $$
declare
  v_indexdef text;
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'program_phase_reviews_one_open_idx'
  ) then
    raise exception 'The old open-only index is still there, so a drafted review can still be duplicated';
  end if;

  select indexdef into v_indexdef
  from pg_indexes
  where schemaname = 'public' and indexname = 'program_phase_reviews_one_live_idx';
  if v_indexdef is null then
    raise exception 'program_phase_reviews_one_live_idx was not created';
  end if;
  if v_indexdef not like '%drafted%' or v_indexdef not like '%open%' then
    raise exception 'The live-review index does not cover both open and drafted: %', v_indexdef;
  end if;
  if v_indexdef not like 'CREATE UNIQUE INDEX%' then
    raise exception 'The live-review index is not unique, so it enforces nothing';
  end if;

  -- Nothing in production can already violate it: the table is empty, and
  -- if it is not, this proves the widening is safe before it is relied on.
  if exists (
    select 1 from program_phase_reviews
    where status in ('open', 'drafted')
    group by member_id, program_group_key
    having count(*) > 1
  ) then
    raise exception 'A program already has more than one live review, so the index could not have been created';
  end if;
end $$;
