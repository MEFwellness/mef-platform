-- Reassessment Intelligence extension (Prompt 12, Part 7). Additive
-- drop/add-constraint, same technique migration 84 already used to extend
-- this exact column: reassessment_schedules.trigger_source gains two new
-- values for the two Part 7 triggers that don't fit any of the four
-- existing ones ('calendar', 'finding_change', 'checkin_signal',
-- 'coach_action') without overloading their meaning —
--   'experiment_outcome'      — a closed Lifestyle Experiment
--                                (didnt_work/partially_worked) whose
--                                domain still has an active finding.
--   'recommendation_sequence' — several completed member_recommendations
--                                in the same domain within a window.
-- The already-reserved 'coach_action' value (never written until now)
-- covers Part 7's coach-requested trigger with zero migration needed —
-- see lib/reassessment-intelligence/data.ts's new
-- insertCoachRequestedReassessmentSchedule().
alter table reassessment_schedules drop constraint reassessment_schedules_trigger_source_check;
alter table reassessment_schedules add constraint reassessment_schedules_trigger_source_check
  check (trigger_source in (
    'calendar', 'finding_change', 'checkin_signal', 'coach_action',
    'experiment_outcome', 'recommendation_sequence'
  ));
