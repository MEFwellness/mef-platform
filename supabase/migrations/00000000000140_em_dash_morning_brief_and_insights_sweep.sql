-- Migration 139 swept four tables where the code composes prose once and
-- freezes it into a row that is never regenerated. It missed two more
-- tables with the exact same shape, which is why a member could still see
-- an em dash after 139 ran: coach_morning_briefs (migration 53) and
-- coaching_insights (migration 66). Both tables' own header comments
-- describe themselves as "idempotent per (member, local_date)... a
-- permanent snapshot... never recomputed retroactively" -- the same
-- freeze-at-write-time shape as the four tables 139 already fixed, just
-- not enumerated there.
--
-- Root cause of the reported bug: lib/coaching-engine/service.ts's
-- getOrCreateTodaysMorningBrief reads an existing coach_morning_briefs row
-- for (member, local_date) and returns it as-is if one already exists --
-- it never regenerates. A brief generated before the em dash template fix
-- (lib/brain/copy.ts's buildReasonText) deployed keeps showing the old
-- text for that entire local_date, and stays in the table forever after
-- that, since old dates are never revisited. MorningBriefCard.tsx renders
-- coach_morning_briefs.coaching_recommendation directly -- this is
-- precisely "the dashboard coaching recommendation."
--
-- Same function as migration 139, recreated and dropped again within this
-- migration for the same reason (not a permanent schema addition).
create or replace function public.fix_em_dash_temp(input text) returns text as $$
declare
  result text := input;
  idx int;
  before_part text;
  after_part text;
begin
  if input is null or position(chr(8212) in input) = 0 then
    return input;
  end if;
  loop
    idx := position(chr(8212) in result);
    exit when idx = 0;
    before_part := rtrim(substring(result from 1 for idx - 1));
    after_part := ltrim(substring(result from idx + 1));
    result := before_part || '. ' || upper(substring(after_part from 1 for 1)) || substring(after_part from 2);
  end loop;
  return result;
end;
$$ language plpgsql immutable;

-- coach_morning_briefs (migration 53/54) -- every text column here is
-- composed entirely by lib/coaching-engine/morningBrief.ts from already-
-- fixed templates; no column on this table is ever a member's or coach's
-- own typed words.
update coach_morning_briefs
set
  greeting_name = public.fix_em_dash_temp(greeting_name),
  focus_label = public.fix_em_dash_temp(focus_label),
  recovery_summary = public.fix_em_dash_temp(recovery_summary),
  sleep_summary = public.fix_em_dash_temp(sleep_summary),
  stress_summary = public.fix_em_dash_temp(stress_summary),
  habit_to_prioritize = public.fix_em_dash_temp(habit_to_prioritize),
  coaching_recommendation = public.fix_em_dash_temp(coaching_recommendation),
  encouraging_message = public.fix_em_dash_temp(encouraging_message),
  notable_pattern_title = public.fix_em_dash_temp(notable_pattern_title),
  notable_pattern_summary = public.fix_em_dash_temp(notable_pattern_summary),
  incomplete_recommendation = public.fix_em_dash_temp(incomplete_recommendation)
where greeting_name like '%' || chr(8212) || '%'
   or focus_label like '%' || chr(8212) || '%'
   or recovery_summary like '%' || chr(8212) || '%'
   or sleep_summary like '%' || chr(8212) || '%'
   or stress_summary like '%' || chr(8212) || '%'
   or habit_to_prioritize like '%' || chr(8212) || '%'
   or coaching_recommendation like '%' || chr(8212) || '%'
   or encouraging_message like '%' || chr(8212) || '%'
   or notable_pattern_title like '%' || chr(8212) || '%'
   or notable_pattern_summary like '%' || chr(8212) || '%'
   or incomplete_recommendation like '%' || chr(8212) || '%';

-- coaching_insights (migration 66) -- statement/explanation are both
-- composed entirely by lib/coaching-insights generators, never member or
-- coach input.
update coaching_insights
set
  statement = public.fix_em_dash_temp(statement),
  explanation = public.fix_em_dash_temp(explanation)
where statement like '%' || chr(8212) || '%'
   or explanation like '%' || chr(8212) || '%';

drop function public.fix_em_dash_temp(text);
