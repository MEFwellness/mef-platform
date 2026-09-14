-- ---------------------------------------------------------------------
-- DELETING AN ACCOUNT FROM THE SUPABASE DASHBOARD FAILED, AND FORTY-ONE
-- REFERENCES ARE WHY (found on production, 2026-09-14).
--
-- WHAT HAPPENED. Authentication > Users > Delete returned
-- "Failed to delete user: Database error deleting user" for most accounts.
-- That message is what GoTrue prints whenever `delete from auth.users`
-- trips anything in the public schema; it carries no detail at all.
--
-- WHY. 233 foreign keys point at auth.users. 166 of them already said
-- `on delete cascade` and 26 said `on delete set null`, so the great bulk
-- of a member's own data was always going to go quietly. The remaining 41
-- said `no action`, which means "refuse the delete", and fourteen of those
-- 41 actually held rows. Measured against production before writing a
-- line of this file, every account but five was undeletable, and the
-- reasons split cleanly in two:
--
--   * coach_client_assignments.client_id blocked every member who has
--     ever been assigned a coach. That is one row per member and it is
--     the whole reason the standing test accounts would not go.
--   * a dozen attribution columns (assigned_by, coach_id, changed_by,
--     approved_by, granted_by) blocked every coach and admin account,
--     because those accounts had signed their name to other people's rows.
--
-- THE RULE THIS FILE APPLIES, ONCE, EVERYWHERE.
--
--   A reference that says WHOSE ROW THIS IS cascades. The row has nothing
--   left to describe once the person is gone.
--
--   A reference that says WHO TOUCHED THIS ROW goes null. The row is
--   somebody else's and has to survive; only the signature is lost. Where
--   such a column was `not null`, the `not null` is dropped, because a
--   column that must always name somebody is a column that can always
--   refuse a deletion.
--
-- Only two references are of the first kind, and they are the two ends of
-- the same relationship. Everything else is a signature.
--
-- WHAT DELIBERATELY SURVIVES. Content history and other people's records:
-- the body systems, whole-body signal, coach-assign-copy and driver-probe
-- revision logs; every movement program and program version; coaches'
-- prescriptions, assigned workouts, phase reviews and exercise metadata;
-- the role grants themselves. All of these lose the name of the person who
-- made the change and keep the change.
--
-- WHAT DELIBERATELY GOES. A coach-client assignment, from either end. It
-- is the relationship between two accounts and it cannot outlive either of
-- them. Deleting a coach therefore unassigns that coach's clients, which
-- is the honest outcome rather than a dangling pointer to nobody.
--
-- STORAGE. storage.objects carries no foreign key to auth.users, so
-- uploaded photos never blocked a delete; they were silently orphaned
-- instead. They cannot be swept from SQL (section 6 says why) and are
-- swept through the Storage API by a script this migration points at.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 1. THE TWO SUBJECT REFERENCES. Both ends of a coach-client assignment.
-- ---------------------------------------------------------------------

alter table coach_client_assignments
  drop constraint coach_client_assignments_client_id_fkey,
  add  constraint coach_client_assignments_client_id_fkey
    foreign key (client_id) references auth.users(id) on delete cascade;

alter table coach_client_assignments
  drop constraint coach_client_assignments_coach_id_fkey,
  add  constraint coach_client_assignments_coach_id_fkey
    foreign key (coach_id) references auth.users(id) on delete cascade;

comment on column coach_client_assignments.client_id is
  'The member this assignment is about. Cascades with her account: an assignment is the relationship between two accounts and has nothing to say once either of them is gone.';
comment on column coach_client_assignments.coach_id is
  'The coach holding this assignment. Cascades with that account, which unassigns that coach''s clients. That is the honest outcome; the alternative is a row pointing at nobody.';


-- ---------------------------------------------------------------------
-- 2. A ROW THAT REMEMBERS AN ASSIGNMENT MUST NOT DIE WITH IT.
--
-- coach_client_assignments now cascades, which puts it in reach of a
-- delete for the first time. assessment_attempts rows belonging to OTHER
-- members point at it to record which assignment prompted the sitting, and
-- a `no action` reference from a row that is not being deleted is exactly
-- the refusal this whole file exists to remove. The attempt is the
-- member's and stays; it simply stops naming a coaching arrangement that
-- no longer exists.
-- ---------------------------------------------------------------------

alter table assessment_attempts
  drop constraint assessment_attempts_coach_assignment_id_fkey,
  add  constraint assessment_attempts_coach_assignment_id_fkey
    foreign key (coach_assignment_id) references coach_client_assignments(id) on delete set null;


-- ---------------------------------------------------------------------
-- 3. THE CHECK CONSTRAINT THAT WOULD HAVE REFUSED THE DELETE ANYWAY.
--
-- This is the same shape as the bug migration 209 fixed. The check says an
-- approved version must name both WHEN it was approved and WHO approved
-- it. Setting approved_by to null when that person's account goes leaves
-- approved_at where it is, which is precisely the half-and-half state the
-- check forbids, so the referential action and the constraint would have
-- contradicted each other and the loser would have been the delete.
--
-- The honest statement is the one about time: an approved version records
-- when it was approved. Whether the approver still holds an account here
-- is a separate fact and not one the version can guarantee. All 17
-- approved rows on production name an approver today and keep doing so.
-- ---------------------------------------------------------------------

alter table movement_program_versions
  drop constraint movement_program_versions_approval_check;

alter table movement_program_versions
  add constraint movement_program_versions_approval_check
    check (status <> 'approved' or approved_at is not null);

comment on constraint movement_program_versions_approval_check on movement_program_versions is
  'An approved version records when it was approved. It does not also have to name a living account: approved_by goes null if that person is deleted, and requiring it here would make the deletion fail instead.';


-- ---------------------------------------------------------------------
-- 4. THE SIGNATURES. Every one of these already allowed a null.
-- ---------------------------------------------------------------------

alter table ai_actions
  drop constraint ai_actions_approved_by_fkey,
  add  constraint ai_actions_approved_by_fkey
    foreign key (approved_by) references auth.users(id) on delete set null;

alter table ai_history
  drop constraint ai_history_actor_id_fkey,
  add  constraint ai_history_actor_id_fkey
    foreign key (actor_id) references auth.users(id) on delete set null;

alter table assessment_assignments
  drop constraint assessment_assignments_cancelled_by_fkey,
  add  constraint assessment_assignments_cancelled_by_fkey
    foreign key (cancelled_by) references auth.users(id) on delete set null;

alter table coach_client_assignments
  drop constraint coach_client_assignments_revoked_by_fkey,
  add  constraint coach_client_assignments_revoked_by_fkey
    foreign key (revoked_by) references auth.users(id) on delete set null;

alter table coach_program_assignments
  drop constraint coach_program_assignments_cancelled_by_fkey,
  add  constraint coach_program_assignments_cancelled_by_fkey
    foreign key (cancelled_by) references auth.users(id) on delete set null;

alter table habits
  drop constraint habits_assigned_by_fkey,
  add  constraint habits_assigned_by_fkey
    foreign key (assigned_by) references auth.users(id) on delete set null;

alter table mef_exercise_metadata
  drop constraint mef_exercise_metadata_created_by_fkey,
  add  constraint mef_exercise_metadata_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table mef_exercise_metadata
  drop constraint mef_exercise_metadata_updated_by_fkey,
  add  constraint mef_exercise_metadata_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table member_exercise_avoidance
  drop constraint member_exercise_avoidance_released_by_fkey,
  add  constraint member_exercise_avoidance_released_by_fkey
    foreign key (released_by) references auth.users(id) on delete set null;

alter table member_exercise_feedback
  drop constraint member_exercise_feedback_coach_reviewed_by_fkey,
  add  constraint member_exercise_feedback_coach_reviewed_by_fkey
    foreign key (coach_reviewed_by) references auth.users(id) on delete set null;

alter table member_exercise_feedback
  drop constraint member_exercise_feedback_coach_id_fkey,
  add  constraint member_exercise_feedback_coach_id_fkey
    foreign key (coach_id) references auth.users(id) on delete set null;

alter table movement_program_versions
  drop constraint movement_program_versions_created_by_fkey,
  add  constraint movement_program_versions_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table movement_program_versions
  drop constraint movement_program_versions_updated_by_fkey,
  add  constraint movement_program_versions_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table movement_program_versions
  drop constraint movement_program_versions_approved_by_fkey,
  add  constraint movement_program_versions_approved_by_fkey
    foreign key (approved_by) references auth.users(id) on delete set null;

alter table movement_programs
  drop constraint movement_programs_created_by_fkey,
  add  constraint movement_programs_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table prescription_snapshots
  drop constraint prescription_snapshots_reviewed_by_fkey,
  add  constraint prescription_snapshots_reviewed_by_fkey
    foreign key (reviewed_by) references auth.users(id) on delete set null;

alter table program_enrollments
  drop constraint program_enrollments_coach_id_fkey,
  add  constraint program_enrollments_coach_id_fkey
    foreign key (coach_id) references auth.users(id) on delete set null;

alter table user_roles
  drop constraint user_roles_granted_by_fkey,
  add  constraint user_roles_granted_by_fkey
    foreign key (granted_by) references auth.users(id) on delete set null;

alter table user_roles
  drop constraint user_roles_revoked_by_fkey,
  add  constraint user_roles_revoked_by_fkey
    foreign key (revoked_by) references auth.users(id) on delete set null;


-- ---------------------------------------------------------------------
-- 5. THE SIGNATURES THAT WERE `not null`.
--
-- Each of these is somebody's name on a row that belongs to a member, to
-- the content library or to a coach's own work. The row survives; the name
-- becomes unknown. Nothing here is written as null by this application:
-- every insert path supplies a real, RLS-verified account id, so a null in
-- one of these columns means exactly one thing, that the account was
-- deleted afterwards.
-- ---------------------------------------------------------------------

alter table assessment_assignments alter column assigned_by drop not null;
alter table assessment_assignments
  drop constraint assessment_assignments_assigned_by_fkey,
  add  constraint assessment_assignments_assigned_by_fkey
    foreign key (assigned_by) references auth.users(id) on delete set null;

alter table assessment_report_exercises alter column added_by drop not null;
alter table assessment_report_exercises
  drop constraint assessment_report_exercises_added_by_fkey,
  add  constraint assessment_report_exercises_added_by_fkey
    foreign key (added_by) references auth.users(id) on delete set null;

alter table body_systems_content_revisions alter column changed_by drop not null;
alter table body_systems_content_revisions
  drop constraint body_systems_content_revisions_changed_by_fkey,
  add  constraint body_systems_content_revisions_changed_by_fkey
    foreign key (changed_by) references auth.users(id) on delete set null;

alter table coach_assign_copy_revisions alter column changed_by drop not null;
alter table coach_assign_copy_revisions
  drop constraint coach_assign_copy_revisions_changed_by_fkey,
  add  constraint coach_assign_copy_revisions_changed_by_fkey
    foreign key (changed_by) references auth.users(id) on delete set null;

alter table coach_assigned_workouts alter column coach_id drop not null;
alter table coach_assigned_workouts
  drop constraint coach_assigned_workouts_coach_id_fkey,
  add  constraint coach_assigned_workouts_coach_id_fkey
    foreign key (coach_id) references auth.users(id) on delete set null;

alter table coach_assigned_workout_sections alter column coach_id drop not null;
alter table coach_assigned_workout_sections
  drop constraint coach_assigned_workout_sections_coach_id_fkey,
  add  constraint coach_assigned_workout_sections_coach_id_fkey
    foreign key (coach_id) references auth.users(id) on delete set null;

alter table coach_assigned_workout_exercises alter column coach_id drop not null;
alter table coach_assigned_workout_exercises
  drop constraint coach_assigned_workout_exercises_coach_id_fkey,
  add  constraint coach_assigned_workout_exercises_coach_id_fkey
    foreign key (coach_id) references auth.users(id) on delete set null;

alter table coach_client_assignments alter column assigned_by drop not null;
alter table coach_client_assignments
  drop constraint coach_client_assignments_assigned_by_fkey,
  add  constraint coach_client_assignments_assigned_by_fkey
    foreign key (assigned_by) references auth.users(id) on delete set null;

alter table coach_program_assignments alter column coach_id drop not null;
alter table coach_program_assignments
  drop constraint coach_program_assignments_coach_id_fkey,
  add  constraint coach_program_assignments_coach_id_fkey
    foreign key (coach_id) references auth.users(id) on delete set null;

alter table driver_probe_question_revisions alter column changed_by drop not null;
alter table driver_probe_question_revisions
  drop constraint driver_probe_question_revisions_changed_by_fkey,
  add  constraint driver_probe_question_revisions_changed_by_fkey
    foreign key (changed_by) references auth.users(id) on delete set null;

alter table member_reset_plan_versions alter column changed_by drop not null;
alter table member_reset_plan_versions
  drop constraint member_reset_plan_versions_changed_by_fkey,
  add  constraint member_reset_plan_versions_changed_by_fkey
    foreign key (changed_by) references auth.users(id) on delete set null;

alter table member_whole_body_signal_focus alter column chosen_by drop not null;
alter table member_whole_body_signal_focus
  drop constraint member_whole_body_signal_focus_chosen_by_fkey,
  add  constraint member_whole_body_signal_focus_chosen_by_fkey
    foreign key (chosen_by) references auth.users(id) on delete set null;

alter table member_whole_body_signal_question_actions alter column updated_by drop not null;
alter table member_whole_body_signal_question_actions
  drop constraint member_whole_body_signal_question_actions_updated_by_fkey,
  add  constraint member_whole_body_signal_question_actions_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table prescription_blocks alter column coach_id drop not null;
alter table prescription_blocks
  drop constraint prescription_blocks_coach_id_fkey,
  add  constraint prescription_blocks_coach_id_fkey
    foreign key (coach_id) references auth.users(id) on delete set null;

alter table prescription_block_exercises alter column coach_id drop not null;
alter table prescription_block_exercises
  drop constraint prescription_block_exercises_coach_id_fkey,
  add  constraint prescription_block_exercises_coach_id_fkey
    foreign key (coach_id) references auth.users(id) on delete set null;

alter table prescription_constraints alter column coach_id drop not null;
alter table prescription_constraints
  drop constraint prescription_constraints_coach_id_fkey,
  add  constraint prescription_constraints_coach_id_fkey
    foreign key (coach_id) references auth.users(id) on delete set null;

alter table prescription_snapshots alter column coach_id drop not null;
alter table prescription_snapshots
  drop constraint prescription_snapshots_coach_id_fkey,
  add  constraint prescription_snapshots_coach_id_fkey
    foreign key (coach_id) references auth.users(id) on delete set null;

alter table prescription_snapshots alter column requested_by drop not null;
alter table prescription_snapshots
  drop constraint prescription_snapshots_requested_by_fkey,
  add  constraint prescription_snapshots_requested_by_fkey
    foreign key (requested_by) references auth.users(id) on delete set null;

alter table program_phase_reviews alter column coach_id drop not null;
alter table program_phase_reviews
  drop constraint program_phase_reviews_coach_id_fkey,
  add  constraint program_phase_reviews_coach_id_fkey
    foreign key (coach_id) references auth.users(id) on delete set null;

alter table whole_body_signal_content_revisions alter column changed_by drop not null;
alter table whole_body_signal_content_revisions
  drop constraint whole_body_signal_content_revisions_changed_by_fkey,
  add  constraint whole_body_signal_content_revisions_changed_by_fkey
    foreign key (changed_by) references auth.users(id) on delete set null;


-- ---------------------------------------------------------------------
-- 6. THE UPLOADED PHOTOS, AND WHY NOTHING HERE TOUCHES THEM.
--
-- storage.objects carries no foreign key to auth.users, so a member's
-- posture captures and food photos never blocked her deletion. They were
-- left behind instead, in two private buckets, under a first path segment
-- that is her own account id.
--
-- The obvious fix, a trigger on auth.users that clears those rows, was
-- written and then deleted, because it cannot work and must not be made
-- to. storage.objects carries a BEFORE DELETE trigger of its own,
-- `protect_objects_delete`, on production and locally alike, which refuses
-- any direct delete unless a session variable is set:
--
--     Direct deletion from storage tables is not allowed.
--     Use the Storage API instead.
--
-- That guard exists for a good reason. The row is an index; the bytes live
-- in the storage backend. Deleting the row leaves the file behind with
-- nothing left that can name it, which is a worse orphan than the one we
-- started with. Setting the escape hatch from a trigger would buy tidy
-- rows at the cost of permanently unreachable files.
--
-- So the photos are swept through the Storage API, which removes the row
-- and the bytes together:
--
--     node apps/consumer-web-app/scripts/sweep-orphaned-storage-objects.mjs
--
-- It is idempotent and it decides from the data, not from a list: any
-- object in the two private buckets whose leading path segment is not the
-- id of a live account is an orphan. Run it after deleting accounts. A
-- deletion never waits on it and is never blocked by it.
-- ---------------------------------------------------------------------
