-- One program, one span.
--
-- Migration 172's backfill derived each assignment's start_date from its
-- OWN first scheduled workout. That is right for a one-off program and
-- wrong for a corrective one, which is delivered as two or three
-- assignments sharing a program_group_key: Session A's first Monday,
-- Session B's first Wednesday and Session C's first Friday are three
-- different dates, so the same program ended up claiming three different
-- four-week spans, and "Week 2 of 4" would have meant a different week
-- depending on which session was read.
--
-- The program's real start is the earliest of them, which is the date the
-- coach actually chose when approving. This normalizes every group to that
-- one date, recomputes end_date from it, and recomputes the week and the
-- status that follow. Nothing about the assigned content is touched, and a
-- one-assignment program is unaffected because its group is itself.
--
-- New approvals do not need this: approveCorrectiveDraftGroup now passes
-- the program's own start date and duration to every session it creates
-- (lib/corrective-engine/review.ts). This is here for the rows that were
-- already in the table.

with group_span as (
  select
    program_group_key,
    member_id,
    min(start_date) as program_start,
    max(duration_weeks) as program_weeks
  from coach_program_assignments
  where program_group_key is not null
  group by program_group_key, member_id
  having count(*) > 1
)
update coach_program_assignments a
set
  start_date = g.program_start,
  end_date = g.program_start + (g.program_weeks * 7 - 1) + a.paused_days,
  duration_weeks = g.program_weeks
from group_span g
where a.program_group_key = g.program_group_key
  and a.member_id = g.member_id
  and a.status <> 'cancelled';

-- Week and status follow from the dates, same rules the daily job applies
-- (lib/program-lifecycle/transitions.ts). Terminal statuses a coach set by
-- hand are left alone; only the date-driven three are recomputed.
update coach_program_assignments
set
  status = case
    when current_date < start_date then 'upcoming'
    when current_date > end_date then 'completed'
    else 'active'
  end,
  current_week = case
    when current_date < start_date then 1
    when current_date > end_date then duration_weeks
    else least(
      duration_weeks,
      greatest(1, floor((current_date - start_date - paused_days) / 7)::int + 1)
    )
  end
where status in ('upcoming', 'active', 'completed')
  and start_date is not null
  and end_date is not null;
