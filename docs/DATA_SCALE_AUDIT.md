# Data scale audit: silent truncation and oversized requests

Started 2026-09-17. This file was written from the inventory BEFORE any call
site was changed, then completed with what was done to each site.

## What was looked for

| trap | what happens | silent? |
| --- | --- | --- |
| Unpaged read | PostgREST returns at most `db-max-rows` rows (1,000 on production and locally) and reports success | yes |
| `.limit(n)` with n above 1,000 | capped at 1,000 exactly like an unpaged read | yes |
| Set-returning database function | its result set is capped the same way | yes |
| Long `.in()` list | the list travels in the URL; past a few thousand characters the gateway refuses it, and a caller that treats an error as "nothing" shows nothing | usually |
| Bulk insert / upsert of an unbounded array | one request body and one statement that must finish inside the 8 second statement timeout | no, but fails whole |
| `auth.admin.listUsers()` without paging | 50 users per page by default | yes |
| `storage.list()` without a limit | 100 objects by default | yes |

## Method

1. **Every request, from the syntax tree.** `tests/support/dataScaleScan.ts`
   walks the TypeScript syntax tree of every source file under `app/`,
   `lib/`, `components/`, `hooks/`, `middleware.ts` and `scripts/`
   (tests excluded; the gitignored `scripts/.sweep` and `scripts/.verify`
   scratch folders excluded). It follows a query chain across lines, a
   builder kept in a variable and extended later, and which paging helper a
   query sits inside.
2. **Production row counts** for all 282 public tables and views, the rows
   added in the last 30 days, the largest number of rows any one member owns,
   and every unique index.
3. **The most rows each flagged read could return TODAY.** For each flagged
   read the production table was grouped by that read's own equality filters
   and the largest group taken. A read cannot return more than that, so a
   value under 1,000 proves the read is not short today (other filters only
   make it smaller). A value over 1,000 was then checked by hand.

## Totals found

| | requests | already bounded | flagged |
| --- | ---: | ---: | ---: |
| App (member, coach, admin, API routes, scheduled jobs) | 1238 | 908 | 330 |
| Scripts (backfills, catalog tools, provisioning, verification harnesses) | 1540 | 1001 | 539 |

Flagged, by trap:

| trap | app | scripts |
| --- | ---: | ---: |
| auth-list-unpaged | 0 | 1 |
| limit-above-cap | 1 | 0 |
| set-rpc-unbounded | 3 | 3 |
| unbatched-bulk-write | 29 | 10 |
| unbatched-list | 75 | 118 |
| unpaged-read | 222 | 407 |

Already bounded, by how:

| bound | requests |
| --- | ---: |
| write | 871 |
| single row | 616 |
| head count | 121 |
| perPage | 62 |
| limit (caller-supplied) | 48 |
| returns one value | 39 |
| fixed enum table | 38 |
| limit 1 | 37 |
| unique key | 22 |
| paged by selectAllRows | 14 |
| range | 12 |
| paged by selectAllRowsInChunks | 4 |
| limit 14 | 3 |
| limit 10 | 3 |
| bounded | 3 |
| limit 400 | 2 |
| limit 95 | 2 |
| limit 50 | 2 |
| limit 5 | 2 |
| limit 30 | 1 |
| limit 200 | 1 |
| limit 300 | 1 |
| limit 20 | 1 |
| limit 60 | 1 |
| limit 15 | 1 |
| limit 3 | 1 |
| explicit limit | 1 |

## Already wrong on production today (category a)

| site | what it reads | production today | what was short |
| --- | --- | --- | --- |
| `lib/analytics-service/timeline.ts:189` (admin analytics, one member's activity timeline) | `product_analytics_events` for one member over the chosen range, `.limit(2001)` | the test member has 3,233 events in the last 90 days | the read asked for 2,001 so that it could report "truncated" past 2,000; PostgREST handed back 1,000, so the timeline silently dropped every day older than her newest 1,000 events and never said it was truncated |
| `scripts/verify-whole-body-patterns-live.mjs:290` (verification harness) | every row of `cross_system_relationship_components`, then filters for its own | 2,511 rows | a re-run would see 1,000 of 2,511 components and report its own pattern's components missing |

Every other flagged read returns under 1,000 rows on production today. The
closest are listed first in the table below.

## Tables with a flagged request

Growth: **members and time** (a member's own history), **members** (one or a
few rows per member), **authored content** (coaches and admins create rows
in the app), **migration content** (reference rows shipped by migrations,
which is how the lexicon crossed the cap), **fixed enum**.

| table | production rows | added last 30 days | largest per member | grows with | flagged sites |
| --- | ---: | ---: | ---: | --- | ---: |
| `member_wellness_events` | 4507 | 2767 | 3287 | members and time | 9 |
| `product_analytics_events` | 4287 | n/a | 3233 | members and time (view) | 1 |
| `cross_system_relationship_components` | 2511 | 2511 | n/a | authored content | 3 |
| `cross_system_relationship_considerations` | 1435 | 1435 | n/a | authored content | 1 |
| `exercise_catalog` | 861 | 0 | n/a | authored content | 15 |
| `mef_exercise_metadata` | 853 | 0 | n/a | authored content | 4 |
| `wellness_insights` | 776 | 375 | 453 | members and time | 1 |
| `member_daily_probe_selections` | 591 | 325 | 205 | members and time | 6 |
| `cross_system_relationship_strength_levels` | 480 | 480 | n/a | authored content | 1 |
| `program_blueprint_slots` | 415 | 389 | n/a | authored content | 12 |
| `member_coaching_messages` | 415 | 320 | 263 | members and time | 1 |
| `member_feature_visibility` | 401 | 246 | 62 | members and time | 6 |
| `wellness_assessment_answers` | 392 | n/a | n/a | authored content | 2 |
| `coach_assigned_workout_exercises` | 386 | 188 | 306 | members and time | 19 |
| `member_driver_states` | 385 | n/a | 35 | members | 1 |
| `member_pattern_states` | 305 | 146 | 51 | members and time | 3 |
| `cross_system_relationships` | 240 | 240 | n/a | authored content | 8 |
| `cross_system_relationship_versions` | 240 | 240 | n/a | authored content | 5 |
| `unified_assessment_answers` | 227 | n/a | n/a | authored content | 3 |
| `coach_assigned_workout_sections` | 220 | 110 | 170 | members and time | 2 |
| `cross_system_signal_names` | 211 | 211 | n/a | authored content | 1 |
| `investigation_router_decisions` | 209 | 2 | 114 | members and time | 2 |
| `onboarding_questions` | 169 | n/a | n/a | migration content | 9 |
| `wellness_profile_dimensions` | 165 | 75 | 15 | members and time | 1 |
| `intelligence_coach_alerts` | 145 | 40 | 108 | members and time | 5 |
| `member_correlation_findings` | 144 | n/a | 18 | members | 1 |
| `registry_entries` | 138 | 69 | 57 | members and time | 12 |
| `daily_checkins` | 136 | 32 | 46 | members and time | 11 |
| `daily_checkin_probe_answers` | 134 | 70 | 68 | members and time | 6 |
| `onboarding_answers` | 134 | n/a | n/a | migration content | 5 |
| `cross_system_signals` | 125 | 125 | 118 | members and time | 9 |
| `safety_audit_log` | 125 | 41 | 54 | members and time | 2 |
| `unified_assessment_questions` | 120 | 24 | n/a | migration content | 4 |
| `public_entry_answers` | 117 | n/a | n/a | authored content | 2 |
| `body_systems_questions` | 111 | 111 | n/a | migration content | 1 |
| `public_entry_events` | 110 | n/a | n/a | authored content | 2 |
| `whole_body_signal_copy` | 106 | 106 | n/a | migration content | 2 |
| `coach_program_template_exercises` | 105 | 51 | 105 | authored content | 3 |
| `safety_classifications` | 98 | 41 | 40 | members and time | 2 |
| `whole_body_signal_questions` | 96 | 96 | n/a | migration content | 3 |
| `driver_goal_weights` | 92 | n/a | n/a | migration content | 1 |
| `lead_messages` | 92 | 6 | n/a | authored content | 1 |
| `daily_checkins_current` | 91 | 27 | 45 | members and time (view) | 14 |
| `driver_probe_questions` | 88 | 0 | n/a | authored content | 3 |
| `member_root_popup_dismissals` | 88 | 64 | 29 | members and time | 25 |
| `member_coaching_decisions` | 77 | 61 | 31 | members and time | 9 |
| `body_systems_copy` | 76 | 76 | n/a | migration content | 2 |
| `narrative_items` | 75 | 41 | 20 | members and time | 2 |
| `member_daily_priorities` | 68 | 56 | 26 | members and time | 1 |
| `member_recommendations` | 68 | 35 | 24 | members and time | 2 |
| `movement_session_template_slots` | 64 | 0 | n/a | migration content | 2 |
| `coach_program_template_sections` | 60 | 30 | 60 | authored content | 3 |
| `food_lens_macro_estimates` | 55 | 15 | n/a | authored content | 1 |
| `assessment_attempts` | 53 | 30 | 18 | members and time | 14 |
| `whole_body_signal_coaching_questions` | 53 | 53 | n/a | migration content | 1 |
| `food_lens_meal_quality_ratings` | 52 | 15 | n/a | authored content | 2 |
| `food_lens_detected_items` | 51 | 18 | n/a | authored content | 2 |
| `conversation_messages` | 50 | 0 | 24 | members and time | 1 |
| `assessment_status_by_member` | 45 | n/a | 14 | members (view) | 2 |
| `coach_assigned_workouts` | 44 | 22 | 34 | members and time | 19 |
| `consent_records` | 40 | n/a | 4 | members | 6 |
| `member_food_log` | 40 | 10 | 37 | members and time | 10 |
| `food_lens_scans` | 40 | 14 | 26 | members and time | 3 |
| `energy_forecasts` | 39 | 1 | 36 | members and time | 2 |
| `root_energy_forecasts` | 39 | 2 | 36 | members and time | 2 |
| `body_systems_associations` | 38 | 38 | n/a | migration content | 2 |
| `drivers` | 35 | n/a | n/a | migration content | 1 |
| `acquisition_report_rows` | 32 | n/a | 20 | members and time (view) | 2 |
| `coaching_insights` | 32 | 18 | 11 | members and time | 1 |
| `cvs_experiment_daily_logs` | 30 | 13 | 13 | members and time | 3 |
| `unified_assessment_sections` | 29 | 4 | n/a | migration content | 2 |
| `wellness_identity_observations` | 29 | 18 | 13 | members and time | 1 |
| `movement_sessions` | 28 | 0 | 10 | members and time | 2 |
| `safety_review_queue` | 27 | 0 | 27 | members and time | 2 |
| `wellness_assessment_category_scores` | 26 | n/a | n/a | authored content | 3 |
| `member_coaching_grades` | 26 | 20 | 10 | members and time | 2 |
| `assessment_definitions` | 26 | 14 | n/a | migration content | 1 |
| `public_entry_sources` | 23 | 23 | n/a | authored content | 4 |
| `member_coaching_threads` | 23 | 17 | 8 | members and time | 6 |
| `member_movement_session_runs` | 22 | 6 | 12 | members and time | 1 |
| `public_entry_funnel` | 22 | n/a | 20 | members and time (view) | 2 |
| `public_entry_sessions` | 22 | 22 | n/a | authored content | 9 |
| `public_entry_attribution` | 21 | n/a | n/a | authored content | 1 |
| `food_lens_captures` | 20 | 6 | n/a | authored content | 1 |
| `assessment_assignments` | 19 | 12 | 11 | members and time | 43 |
| `unified_assessment_sessions` | 19 | 10 | 6 | members and time | 29 |
| `food_analysis_results` | 19 | 7 | n/a | authored content | 1 |
| `correlation_candidate_pairs` | 18 | 0 | n/a | migration content | 1 |
| `movement_program_versions` | 18 | 17 | n/a | authored content | 10 |
| `food_products` | 17 | 4 | n/a | authored content | 4 |
| `product_nutrients` | 17 | 4 | n/a | authored content | 2 |
| `movement_programs` | 17 | 16 | n/a | authored content | 5 |
| `user_roles` | 15 | n/a | 3 | members | 13 |
| `lifestyle_experiments` | 15 | 8 | 5 | members and time | 35 |
| `member_return_greetings` | 14 | n/a | 6 | members | 2 |
| `profiles` | 12 | 5 | n/a | authored content | 31 |
| `member_assignment_deliveries` | 12 | 12 | 10 | members and time | 3 |
| `coach_program_assignments` | 12 | 6 | 9 | members and time | 51 |
| `coach_program_templates` | 12 | 6 | 12 | authored content | 10 |
| `member_subscriptions` | 12 | 5 | 1 | members and time | 5 |
| `member_exercise_recent_views` | 11 | n/a | 5 | members | 1 |
| `body_assessment_findings` | 10 | 0 | 10 | members and time | 3 |
| `member_goal_selections` | 10 | 5 | 1 | members and time | 1 |
| `onboarding_submissions` | 10 | n/a | 1 | members and time | 5 |
| `wellness_assessments` | 9 | 2 | 3 | members and time | 4 |
| `unified_assessment_definitions` | 5 | 1 | n/a | migration content | 1 |
| `member_stress_load_sessions` | 5 | 5 | 4 | members and time | 4 |
| `member_goal_progress_checkins` | 4 | 0 | 2 | members and time | 1 |
| `member_reset_plan_versions` | 4 | n/a | 4 | members | 1 |
| `member_push_subscriptions` | 3 | 3 | 1 | members and time | 8 |
| `member_reset_plan_daily_logs` | 3 | 0 | 3 | members and time | 2 |
| `reassessment_schedules` | 3 | 1 | 1 | members and time | 3 |
| `body_assessments` | 3 | 0 | 2 | members and time | 1 |
| `member_trial_arc_deliveries` | 3 | 3 | 1 | members and time | 7 |
| `coach_client_assignments` | 2 | 0 | 2 | members and time | 13 |
| `food_lens_item_macro_estimates` | 2 | 2 | n/a | authored content | 2 |
| `fuel_pattern_results` | 2 | 2 | 2 | members and time | 4 |
| `fuel_meal_slot_state` | 2 | n/a | 2 | members | 1 |
| `member_body_systems_sessions` | 2 | 2 | 2 | members and time | 16 |
| `captured_leads` | 2 | 1 | n/a | authored content | 2 |
| `public_entry_signup_refs` | 2 | n/a | n/a | authored content | 3 |
| `member_breathing_check_in_sessions` | 2 | 2 | 2 | members and time | 1 |
| `member_public_entry_origin` | 2 | n/a | 1 | members | 1 |
| `wearable_connections` | 1 | 0 | 1 | members and time | 2 |
| `body_assessment_captures` | 1 | 0 | 1 | members and time | 1 |
| `member_discovery_moments` | 1 | n/a | 1 | members | 1 |
| `fuel_experiments` | 1 | 1 | 1 | members and time | 2 |
| `member_health_intake_sessions` | 1 | 1 | 1 | members and time | 1 |
| `public_entry_links` | 0 | 0 | n/a | authored content | 3 |
| `habits` | 0 | n/a | 0 | members | 3 |
| `habit_logs` | 0 | n/a | 0 | members and time | 3 |
| `coach_notes` | 0 | 0 | 0 | members and time | 1 |
| `member_program_lifecycle` | 0 | 0 | 0 | members and time (view) | 3 |
| `safety_acknowledgments` | 0 | 0 | 0 | members and time | 3 |
| `body_landmark_sets` | 0 | 0 | 0 | members and time | 1 |
| `body_assessment_comparisons` | 0 | 0 | 0 | members and time | 1 |
| `body_assessment_coach_reviews` | 0 | 0 | 0 | members and time | 1 |
| `body_assessment_annotations` | 0 | 0 | 0 | members and time | 1 |
| `assessment_ai_observations` | 0 | 0 | 0 | members and time | 2 |
| `assessment_report_exercises` | 0 | 0 | 0 | members and time | 1 |
| `conversation_memory` | 0 | 0 | 0 | members and time | 1 |
| `conversation_handoffs` | 0 | 0 | 0 | members and time | 2 |
| `cross_system_complaint_classifications` | 0 | 0 | n/a | authored content | 4 |
| `cross_system_pattern_matches` | 0 | 0 | 0 | members and time | 8 |
| `cross_system_pattern_match_signals` | 0 | 0 | n/a | authored content | 2 |
| `cross_system_root_findings` | 0 | 0 | 0 | members and time | 7 |
| `cross_system_root_finding_triggers` | 0 | 0 | n/a | authored content | 1 |
| `cross_system_root_finding_areas` | 0 | 0 | n/a | authored content | 1 |
| `cross_system_root_finding_signals` | 0 | 0 | n/a | authored content | 1 |
| `driver_probe_question_revisions` | 0 | n/a | n/a | authored content | 1 |
| `member_exercise_favorites` | 0 | 0 | 0 | members and time | 3 |
| `member_exercise_cues` | 0 | n/a | n/a | migration content (view) | 1 |
| `mef_content_items` | 0 | 0 | n/a | migration content | 2 |
| `product_allergens` | 0 | 0 | n/a | authored content | 3 |
| `saved_meal_items` | 0 | 0 | n/a | authored content | 2 |
| `saved_meals` | 0 | 0 | 0 | members and time | 1 |
| `member_food_favorites` | 0 | 0 | 0 | members and time | 1 |
| `fuel_experiment_checks` | 0 | 0 | 0 | members and time | 3 |
| `fuel_meal_exclusions` | 0 | 0 | 0 | members and time | 1 |
| `fuel_meal_rejections` | 0 | 0 | 0 | members and time | 1 |
| `fuel_meal_saves` | 0 | 0 | 0 | members and time | 1 |
| `guest_wellness_check_answers` | 0 | n/a | n/a | authored content | 3 |
| `member_recommendation_events` | 0 | 0 | 0 | members and time | 1 |
| `movement_profile_review_items` | 0 | 0 | 0 | members and time | 1 |
| `pantry_items` | 0 | n/a | 0 | members | 3 |
| `member_exercise_feedback` | 0 | 0 | 0 | members and time | 7 |
| `member_exercise_avoidance` | 0 | 0 | 0 | members and time | 7 |
| `program_phase_reviews` | 0 | 0 | 0 | members and time | 3 |
| `wearable_daily_metrics` | 0 | 0 | 0 | members and time | 2 |
| `member_whole_body_signal_focus` | 0 | n/a | 0 | members | 3 |
| `member_whole_body_signal_question_actions` | 0 | n/a | 0 | members | 7 |
| `exercise_extracted_posters` | 0 | 0 | n/a | authored content | 5 |
| `member_whole_body_signal_sessions` | 0 | 0 | 0 | members and time | 4 |
| `cross_system_complaint_reports` | 0 | 0 | 0 | members and time | 3 |
| `member_trial_arc_recaps` | 0 | 0 | 0 | members and time | 3 |
| `member_trial_arc_closes` | 0 | 0 | 0 | members and time | 2 |
| `admin_list_member_access` | n/a | n/a | n/a | not a public table | 1 |
| `lead_acquisition_for_email` | n/a | n/a | n/a | not a public table | 1 |
| `list_own_wellness_recommendation_feedback` | n/a | n/a | n/a | not a public table | 1 |
| `<ANSWERS_TABLE>` | n/a | n/a | n/a | decided at runtime | 1 |
| `<TABLE>` | n/a | n/a | n/a | decided at runtime | 27 |
| `<TARGETS_TABLE>` | n/a | n/a | n/a | decided at runtime | 1 |
| `exercise_open_license_images` | n/a | n/a | n/a | not a public table | 2 |
| `<table>` | n/a | n/a | n/a | decided at runtime | 8 |
| `analytics_member_scope` | n/a | n/a | n/a | not a public table | 3 |
| `auth.users` | n/a | n/a | n/a | not a public table | 1 |

## Every flagged site

`max today` is the most rows the read could return on production today
(see Method, step 3). `class` is provisional here: **a** proven short
today, **b?** pending the per-site review. The review's outcome for each
site is recorded in the resolution section below.

| site | area | request | trap | max today | class |
| --- | --- | --- | --- | ---: | --- |
| `app/actions/acquisitionLinks.ts:166` | member / shared | `public_entry_links` select | unpaged-read | 0 | b? |
| `app/actions/admin.ts:43` | admin | `profiles` select | unpaged-read | 12 | b? |
| `app/actions/admin.ts:101` | admin | `user_roles` select | unpaged-read | 11 | b? |
| `app/actions/admin.ts:129` | admin | `coach_client_assignments` select | unpaged-read | 2 | b? |
| `app/actions/admin.ts:140` | admin | `profiles` select | unpaged-read | 10 | b? |
| `app/actions/assessmentAssignments.ts:106` | member / shared | `assessment_assignments` select | unpaged-read | 11 | b? |
| `app/actions/checkin.ts:647` | member / shared | `habits` select | unpaged-read | 0 | b? |
| `app/actions/checkin.ts:691` | member / shared | `habit_logs` select | unpaged-read | 0 | b? |
| `app/actions/coach.ts:41` | coach | `coach_client_assignments` select | unpaged-read | 2 | b? |
| `app/actions/coach.ts:63` | coach | `profiles` select | unbatched-list | 12 | b? |
| `app/actions/coach.ts:97` | coach | `habits` select | unpaged-read | 0 | b? |
| `app/actions/coach.ts:116` | coach | `habit_logs` select | unpaged-read | 0 | b? |
| `app/actions/coach.ts:142` | coach | `coach_notes` select | unpaged-read | 0 | b? |
| `app/actions/consent.ts:28` | member / shared | `consent_records` insert | unbatched-bulk-write |  | b? |
| `app/actions/consent.ts:36` | member / shared | `consent_records` select | unpaged-read | 4 | b? |
| `app/actions/coreValuesSnapshot.ts:426` | member / shared | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `app/actions/coreValuesSnapshotAdmin.ts:55` | admin | `profiles` select | unpaged-read | 12 | b? |
| `app/actions/coreValuesSnapshotAdmin.ts:215` | admin | `cvs_experiment_daily_logs` insert | unbatched-bulk-write |  | b? |
| `app/actions/exercise-feedback.ts:133` | member / shared | `member_program_lifecycle` select | unpaged-read | 0 | b? |
| `app/actions/food-products.ts:330` | member / shared | `food_products` select | unbatched-list | 17 | b? |
| `app/actions/lifeSignalCheck.ts:466` | member / shared | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `app/actions/memberAccess.ts:136` | member / shared | `admin_list_member_access` rpc | set-rpc-unbounded |  | b? |
| `app/actions/onboarding.ts:54` | member / shared | `onboarding_questions` select | unpaged-read | 144 | b? |
| `app/actions/onboarding.ts:85` | member / shared | `onboarding_questions` select | unpaged-read | 169 | b? |
| `app/actions/onboarding.ts:132` | member / shared | `onboarding_questions` select | unpaged-read | 144 | b? |
| `app/actions/onboarding.ts:158` | member / shared | `onboarding_questions` select | unpaged-read | 169 | b? |
| `app/actions/pantry.ts:63` | member / shared | `food_products` select | unbatched-list | 17 | b? |
| `app/actions/protein-ledger.ts:117` | member / shared | `member_food_log` select | unpaged-read | 37 | b? |
| `app/actions/protein-ledger.ts:152` | member / shared | `food_products` select | unbatched-list | 17 | b? |
| `app/actions/protein-ledger.ts:155` | member / shared | `product_nutrients` select | unbatched-list | 17 | b? |
| `app/actions/protein-ledger.ts:158` | member / shared | `food_lens_macro_estimates` select | unbatched-list | 55 | b? |
| `app/actions/pushNotificationsAdmin.ts:91` | admin | `profiles` select | unbatched-list | 12 | b? |
| `app/actions/pushNotificationsAdmin.ts:95` | admin | `member_push_subscriptions` select | unbatched-list | 3 | b? |
| `app/actions/questionnaireCatalog.ts:176` | member / shared | `assessment_attempts` select | unbatched-list | 6 | b? |
| `app/actions/readinessPulse.ts:587` | member / shared | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `app/actions/resetPlanAdmin.ts:42` | admin | `profiles` select | unpaged-read | 12 | b? |
| `app/actions/resetPlanAdmin.ts:179` | admin | `member_reset_plan_daily_logs` insert | unbatched-bulk-write |  | b? |
| `app/actions/safety.ts:129` | member / shared | `safety_acknowledgments` select | unpaged-read | 0 | b? |
| `app/actions/wbsa.ts:190` | member / shared | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `app/admin/acquisition/links/page.tsx:46` | admin | `public_entry_sources` select | unpaged-read | 23 | b? |
| `app/admin/acquisition/page.tsx:114` | admin | `public_entry_sources` select | unpaged-read | 23 | b? |
| `app/api/cron/correlation-engine/route.ts:47` | scheduled job | `user_roles` select | unpaged-read | 11 | b? |
| `app/api/cron/daily-coaching-scan/route.ts:94` | scheduled job | `user_roles` select | unpaged-read | 11 | b? |
| `app/api/cron/daily-coaching-scan/route.ts:108` | scheduled job | `profiles` select | unbatched-list | 12 | b? |
| `app/api/cron/driver-state-engine/route.ts:38` | scheduled job | `user_roles` select | unpaged-read | 11 | b? |
| `app/api/cron/forecast-grading/route.ts:45` | scheduled job | `user_roles` select | unpaged-read | 11 | b? |
| `app/api/cron/wearable-daily/route.ts:53` | scheduled job | `wearable_connections` select | unpaged-read | 1 | b? |
| `app/coach/clients/[id]/body-assessments/[assessmentId]/page.tsx:140` | coach | `profiles` select | unbatched-list | 12 | b? |
| `app/coach/review-queue/page.tsx:40` | coach | `profiles` select | unbatched-list | 12 | b? |
| `lib/acquisition/data.ts:411` | member / shared | `lead_acquisition_for_email` rpc | set-rpc-unbounded |  | b? |
| `lib/acquisition/reportData.ts:123` | member / shared | `acquisition_report_rows` select | unpaged-read | 32 | b? |
| `lib/acquisition/reportData.ts:186` | member / shared | `public_entry_sources` select | unpaged-read | 23 | b? |
| `lib/acquisition/reportData.ts:192` | member / shared | `public_entry_links` select | unpaged-read | 0 | b? |
| `lib/analytics-service/timeline.ts:189` | member / shared | `product_analytics_events` select | limit-above-cap | 3233 | a |
| `lib/assessment-foundation/repository.ts:63` | member / shared | `unified_assessment_sections` select | unpaged-read | 16 | b? |
| `lib/assessment-foundation/repository.ts:89` | member / shared | `unified_assessment_questions` select | unpaged-read | 64 | b? |
| `lib/assessment-registry/facts.ts:73` | member / shared | `assessment_status_by_member` select | unpaged-read | 14 | b? |
| `lib/assessment-registry/facts.ts:79` | member / shared | `assessment_assignments` select | unpaged-read | 10 | b? |
| `lib/assessment-registry/facts.ts:84` | member / shared | `reassessment_schedules` select | unpaged-read | 1 | b? |
| `lib/assessment-runtime/data.ts:54` | member / shared | `unified_assessment_answers` select | unpaged-read | 24 | b? |
| `lib/assessments/store.ts:87` | member / shared | `wellness_assessment_answers` select | unpaged-read | 91 | b? |
| `lib/assessments/store.ts:316` | member / shared | `wellness_assessment_category_scores` upsert | unbatched-bulk-write |  | b? |
| `lib/assessments/store.ts:364` | member / shared | `wellness_assessment_category_scores` select | unpaged-read | 7 | b? |
| `lib/assessments/store.ts:389` | member / shared | `wellness_assessments` select | unpaged-read | 2 | b? |
| `lib/assessments/store.ts:442` | member / shared | `wellness_assessment_category_scores` select | unbatched-list | 3 | b? |
| `lib/assignments/data.ts:97` | member / shared | `member_assignment_deliveries` select | unbatched-list | 10 | b? |
| `lib/body-assessment/data.ts:314` | member / shared | `body_assessment_captures` select | unpaged-read | 1 | b? |
| `lib/body-assessment/data.ts:411` | member / shared | `body_landmark_sets` select | unpaged-read | 0 | b? |
| `lib/body-assessment/data.ts:505` | member / shared | `body_assessment_findings` select | unpaged-read | 9 | b? |
| `lib/body-assessment/data.ts:536` | member / shared | `body_assessment_findings` select | unpaged-read | 2 | b? |
| `lib/body-assessment/data.ts:652` | member / shared | `body_assessment_comparisons` select | unpaged-read | 0 | b? |
| `lib/body-assessment/data.ts:720` | member / shared | `body_assessment_coach_reviews` select | unpaged-read | 0 | b? |
| `lib/body-assessment/data.ts:801` | member / shared | `body_assessment_annotations` select | unpaged-read | 0 | b? |
| `lib/body-systems/contentData.ts:145` | member / shared | `body_systems_questions` select | unpaged-read | 111 | b? |
| `lib/body-systems/contentData.ts:242` | member / shared | `body_systems_copy` select | unpaged-read | 47 | b? |
| `lib/body-systems/contentData.ts:274` | member / shared | `body_systems_associations` select | unpaged-read | 38 | b? |
| `lib/body-systems/contentData.ts:318` | member / shared | `body_systems_associations` select | unpaged-read | 38 | b? |
| `lib/case-view/data.ts:17` | member / shared | `member_goal_progress_checkins` select | unpaged-read | 2 | b? |
| `lib/coach-assign/data.ts:56` | coach | `profiles` select | unbatched-list | 12 | b? |
| `lib/coach-intelligence/data.ts:164` | coach | `assessment_ai_observations` insert | unbatched-bulk-write |  | b? |
| `lib/coach-intelligence/data.ts:179` | coach | `assessment_ai_observations` select | unpaged-read | 0 | b? |
| `lib/coach-intelligence/data.ts:257` | coach | `assessment_report_exercises` select | unpaged-read | 0 | b? |
| `lib/coach-member-entries/data.ts:114` | coach | `daily_checkins_current` select | unpaged-read | 45 | b? |
| `lib/coach-member-entries/data.ts:133` | coach | `daily_checkin_probe_answers` select | unpaged-read | 68 | b? |
| `lib/coach-member-entries/data.ts:146` | coach | `driver_probe_questions` select | unbatched-list | 88 | b? |
| `lib/coach-member-entries/data.ts:251` | coach | `member_goal_selections` select | unpaged-read | 1 | b? |
| `lib/coach-member-entries/data.ts:293` | coach | `onboarding_submissions` select | unpaged-read | 1 | b? |
| `lib/coach-member-entries/data.ts:317` | coach | `unified_assessment_sessions` select | unpaged-read | 6 | b? |
| `lib/coach-member-entries/data.ts:375` | coach | `conversation_messages` select | unbatched-list | 50 | b? |
| `lib/coach-program-builder/assignments.ts:251` | coach | `coach_assigned_workout_exercises` insert | unbatched-bulk-write |  | b? |
| `lib/coach-program-builder/assignments.ts:417` | coach | `coach_program_assignments` select | unpaged-read | 3 | b? |
| `lib/coach-program-builder/assignments.ts:434` | coach | `coach_program_assignments` select | unpaged-read | 12 | b? |
| `lib/coach-program-builder/assignments.ts:597` | coach | `coach_program_assignments` select | unpaged-read | 9 | b? |
| `lib/coach-program-builder/assignments.ts:613` | coach | `coach_program_assignments` update | unbatched-list |  | b? |
| `lib/coach-program-builder/assignments.ts:639` | coach | `member_program_lifecycle` select | unpaged-read | 0 | b? |
| `lib/coach-program-builder/assignments.ts:669` | coach | `coach_program_assignments` update | unbatched-list |  | b? |
| `lib/coach-program-builder/assignments.ts:684` | coach | `coach_program_assignments` select | unpaged-read | 9 | b? |
| `lib/coach-program-builder/assignments.ts:704` | coach | `coach_assigned_workouts` select | unbatched-list | 44 | b? |
| `lib/coach-program-builder/assignments.ts:771` | coach | `coach_assigned_workouts` select | unpaged-read | 34 | b? |
| `lib/coach-program-builder/assignments.ts:799` | coach | `coach_assigned_workout_sections` select | unpaged-read | 5 | b? |
| `lib/coach-program-builder/assignments.ts:804` | coach | `coach_assigned_workout_exercises` select | unpaged-read | 9 | b? |
| `lib/coach-program-builder/templates.ts:126` | coach | `coach_program_templates` select | unpaged-read | 6 | b? |
| `lib/coach-program-builder/templates.ts:174` | coach | `coach_program_template_sections` select | unpaged-read | 5 | b? |
| `lib/coach-program-builder/templates.ts:190` | coach | `coach_program_template_exercises` select | unpaged-read | 9 | b? |
| `lib/coach-program-builder/templates.ts:297` | coach | `coach_program_template_sections` insert | unbatched-bulk-write |  | b? |
| `lib/coach-program-builder/templates.ts:319` | coach | `coach_program_template_sections` select | unpaged-read | 5 | b? |
| `lib/coach-program-builder/templates.ts:374` | coach | `coach_program_template_exercises` insert | unbatched-bulk-write |  | b? |
| `lib/coaching-direction/data.ts:86` | coach | `member_coaching_threads` select | unpaged-read | 8 | b? |
| `lib/coaching-direction/data.ts:218` | coach | `member_coaching_threads` select | unpaged-read | 8 | b? |
| `lib/coaching-direction/data.ts:432` | coach | `member_coaching_decisions` select | unpaged-read | 11 | b? |
| `lib/coaching-direction/data.ts:463` | coach | `member_coaching_decisions` select | unpaged-read | 31 | b? |
| `lib/coaching-direction/escalationData.ts:55` | coach | `member_coaching_threads` select | unpaged-read | 8 | b? |
| `lib/coaching-direction/escalationData.ts:137` | coach | `member_coaching_threads` select | unpaged-read | 8 | b? |
| `lib/coaching-direction/escalationData.ts:178` | coach | `member_coaching_decisions` select | unbatched-list | 31 | b? |
| `lib/coaching-direction/frictionData.ts:45` | coach | `member_coaching_decisions` select | unpaged-read | 31 | b? |
| `lib/coaching-direction/gradesData.ts:87` | coach | `member_coaching_decisions` select | unpaged-read | 31 | b? |
| `lib/coaching-direction/gradesData.ts:223` | coach | `member_coaching_grades` select | unpaged-read | 10 | b? |
| `lib/coaching-direction/gradesData.ts:273` | coach | `member_coaching_grades` upsert | unbatched-bulk-write |  | b? |
| `lib/coaching-direction/signals.ts:90` | coach | `safety_acknowledgments` select | unbatched-list | 0 | b? |
| `lib/coaching-engine/data.ts:106` | coach | `habits` select | unpaged-read | 0 | b? |
| `lib/coaching-engine/data.ts:125` | coach | `habit_logs` select | unpaged-read | 0 | b? |
| `lib/coaching-insights/data.ts:19` | coach | `coaching_insights` select | unpaged-read | 3 | b? |
| `lib/coaching-insights/sources/checkinSource.ts:62` | coach | `daily_checkins_current` select | unpaged-read | 45 | b? |
| `lib/coaching-insights/sources/progressSource.ts:66` | coach | `daily_checkins_current` select | unpaged-read | 45 | b? |
| `lib/conversation-coach/data.ts:338` | coach | `conversation_memory` select | unpaged-read | 0 | b? |
| `lib/conversation-coach/data.ts:411` | coach | `conversation_handoffs` select | unpaged-read | 0 | b? |
| `lib/conversation-coach/data.ts:428` | coach | `conversation_handoffs` select | unpaged-read | 0 | b? |
| `lib/conversation-coach/nutritionActivity.ts:89` | coach | `member_food_log` select | unpaged-read | 37 | b? |
| `lib/core-values-snapshot/dailyLogsData.ts:29` | member / shared | `cvs_experiment_daily_logs` select | unpaged-read | 7 | b? |
| `lib/corrective-engine/findings.ts:40` | member / shared | `body_assessment_findings` select | unpaged-read | 9 | b? |
| `lib/correlation-engine/data.ts:35` | member / shared | `correlation_candidate_pairs` select | unpaged-read | 18 | b? |
| `lib/correlation-engine/data.ts:125` | member / shared | `member_correlation_findings` select | unpaged-read | 18 | b? |
| `lib/cross-system-complaints/data.ts:103` | member / shared | `cross_system_complaint_classifications` upsert | unbatched-bulk-write |  | b? |
| `lib/cross-system-complaints/data.ts:260` | member / shared | `cross_system_signals` select | unbatched-list | 118 | b? |
| `lib/cross-system-complaints/data.ts:361` | member / shared | `cross_system_complaint_classifications` select | unbatched-list | 0 | b? |
| `lib/cross-system-patterns/data.ts:78` | member / shared | `cross_system_pattern_matches` select | unpaged-read | 0 | b? |
| `lib/cross-system-patterns/data.ts:90` | member / shared | `cross_system_pattern_match_signals` select | unbatched-list | 0 | b? |
| `lib/cross-system-patterns/data.ts:155` | member / shared | `cross_system_pattern_matches` delete | unbatched-list |  | b? |
| `lib/cross-system-patterns/data.ts:168` | member / shared | `cross_system_pattern_matches` insert | unbatched-bulk-write |  | b? |
| `lib/cross-system-patterns/evaluate.ts:139` | member / shared | `cross_system_pattern_matches` select | unpaged-read | 0 | b? |
| `lib/cross-system-relationships/data.ts:385` | member / shared | `cross_system_relationship_components` insert | unbatched-bulk-write |  | b? |
| `lib/cross-system-relationships/data.ts:410` | member / shared | `cross_system_relationship_strength_levels` insert | unbatched-bulk-write |  | b? |
| `lib/cross-system-relationships/data.ts:428` | member / shared | `cross_system_relationship_considerations` insert | unbatched-bulk-write |  | b? |
| `lib/cross-system-root/data.ts:144` | member / shared | `cross_system_root_findings` select | unpaged-read | 0 | b? |
| `lib/cross-system-root/data.ts:245` | member / shared | `cross_system_root_findings` insert | unbatched-bulk-write |  | b? |
| `lib/cross-system-root/data.ts:294` | member / shared | `cross_system_root_finding_triggers` insert | unbatched-bulk-write |  | b? |
| `lib/cross-system-root/data.ts:305` | member / shared | `cross_system_root_finding_areas` insert | unbatched-bulk-write |  | b? |
| `lib/cross-system-root/data.ts:338` | member / shared | `cross_system_root_finding_signals` insert | unbatched-bulk-write |  | b? |
| `lib/cross-system-signals/data.ts:230` | member / shared | `cross_system_signals` upsert | unbatched-bulk-write |  | b? |
| `lib/daily-checkin-adaptive/data.ts:58` | member / shared | `driver_probe_questions` select | unpaged-read | 87 | b? |
| `lib/daily-checkin-adaptive/data.ts:72` | member / shared | `member_daily_probe_selections` select | unpaged-read | 205 | b? |
| `lib/daily-checkin-adaptive/data.ts:99` | member / shared | `member_daily_probe_selections` select | unpaged-read | 10 | b? |
| `lib/daily-checkin-adaptive/data.ts:124` | member / shared | `member_daily_probe_selections` upsert | unbatched-bulk-write |  | b? |
| `lib/daily-checkin-adaptive/data.ts:161` | member / shared | `daily_checkin_probe_answers` select | unpaged-read | 5 | b? |
| `lib/discovery-moments/data.ts:16` | member / shared | `member_discovery_moments` select | unpaged-read | 1 | b? |
| `lib/driver-library/data.ts:64` | member / shared | `drivers` select | unpaged-read | 35 | b? |
| `lib/driver-library/data.ts:77` | member / shared | `driver_goal_weights` select | unpaged-read | 92 | b? |
| `lib/driver-library/data.ts:121` | member / shared | `member_driver_states` select | unpaged-read | 35 | b? |
| `lib/driver-probe-admin/data.ts:65` | admin | `driver_probe_questions` select | unpaged-read | 88 | b? |
| `lib/driver-probe-admin/data.ts:74` | admin | `member_daily_probe_selections` select | unpaged-read | 414 | b? |
| `lib/driver-probe-admin/data.ts:90` | admin | `daily_checkin_probe_answers` select | unpaged-read | 134 | b? |
| `lib/driver-probe-admin/data.ts:104` | admin | `daily_checkins` select | unpaged-read | 136 | b? |
| `lib/driver-probe-admin/data.ts:199` | admin | `driver_probe_question_revisions` select | unpaged-read | 0 | b? |
| `lib/driver-probe-admin/data.ts:231` | admin | `profiles` select | unbatched-list | 12 | b? |
| `lib/energy-forecast/data.ts:290` | member / shared | `energy_forecasts` select | unpaged-read | 21 | b? |
| `lib/energy-forecast/data.ts:309` | member / shared | `root_energy_forecasts` select | unpaged-read | 21 | b? |
| `lib/events/service.ts:74` | member / shared | `member_wellness_events` select | unpaged-read | 390 | b? |
| `lib/exercise-library/favorites.ts:16` | member / shared | `member_exercise_favorites` select | unpaged-read | 0 | b? |
| `lib/exercise-library/favorites.ts:34` | member / shared | `member_exercise_favorites` select | unpaged-read | 0 | b? |
| `lib/exercise-library/metadata.ts:52` | member / shared | `mef_exercise_metadata` select | unbatched-list | 853 | b? |
| `lib/exercise-library/metadata.ts:80` | member / shared | `member_exercise_cues` select | unbatched-list | 0 | b? |
| `lib/feed/data.ts:26` | member / shared | `mef_content_items` select | unpaged-read | 0 | b? |
| `lib/feed/data.ts:80` | member / shared | `mef_content_items` select | unbatched-list | 0 | b? |
| `lib/food-lens/data.ts:181` | member / shared | `food_lens_captures` select | unpaged-read | 1 | b? |
| `lib/food-lens/data.ts:300` | member / shared | `food_lens_detected_items` select | unpaged-read | 6 | b? |
| `lib/food-lens/data.ts:487` | member / shared | `food_lens_item_macro_estimates` select | unpaged-read | 1 | b? |
| `lib/food-lens/weeklyReportData.ts:115` | member / shared | `member_food_log` select | unpaged-read | 37 | b? |
| `lib/food-lens/weeklyReportData.ts:138` | member / shared | `food_analysis_results` select | unbatched-list | 19 | b? |
| `lib/food-lens/weeklyReportData.ts:184` | member / shared | `food_lens_scans` select | unpaged-read | 26 | b? |
| `lib/food-lens/weeklyReportData.ts:204` | member / shared | `food_lens_meal_quality_ratings` select | unbatched-list | 52 | b? |
| `lib/food-lens/weeklyReportData.ts:262` | member / shared | `food_lens_scans` select | unpaged-read | 26 | b? |
| `lib/food-lens/weeklyReportData.ts:282` | member / shared | `food_lens_detected_items` select | unbatched-list | 29 | b? |
| `lib/food-lens/weeklyReportData.ts:313` | member / shared | `movement_sessions` select | unpaged-read | 10 | b? |
| `lib/food-lens/weeklyReportData.ts:339` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | b? |
| `lib/food-products/data.ts:73` | member / shared | `product_allergens` select | unpaged-read | 0 | b? |
| `lib/food-products/data.ts:170` | member / shared | `product_allergens` insert | unbatched-bulk-write |  | b? |
| `lib/food-products/data.ts:306` | member / shared | `product_allergens` insert | unbatched-bulk-write |  | b? |
| `lib/food-products/data.ts:611` | member / shared | `member_food_log` select | unpaged-read | 37 | b? |
| `lib/food-products/savedMeals.ts:44` | member / shared | `saved_meal_items` insert | unbatched-bulk-write |  | b? |
| `lib/food-products/savedMeals.ts:105` | member / shared | `saved_meals` select | unpaged-read | 0 | b? |
| `lib/food-products/savedMeals.ts:123` | member / shared | `saved_meal_items` select | unpaged-read | 0 | b? |
| `lib/food-products/savedMeals.ts:156` | member / shared | `member_food_favorites` select | unpaged-read | 0 | b? |
| `lib/food-products/search.ts:87` | member / shared | `member_food_log` select | unpaged-read | 37 | b? |
| `lib/food-products/search.ts:111` | member / shared | `food_products` select | unbatched-list | 17 | b? |
| `lib/fuel-pattern/data.ts:125` | member / shared | `fuel_pattern_results` select | unpaged-read | 2 | b? |
| `lib/fuel-pattern/experiment/data.ts:128` | member / shared | `fuel_experiments` select | unpaged-read | 1 | b? |
| `lib/fuel-pattern/experiment/data.ts:147` | member / shared | `fuel_experiment_checks` select | unpaged-read | 0 | b? |
| `lib/fuel-pattern/experiment/data.ts:168` | member / shared | `fuel_experiment_checks` select | unbatched-list | 0 | b? |
| `lib/fuel-pattern/meals/data.ts:68` | member / shared | `fuel_meal_exclusions` select | unpaged-read | 0 | b? |
| `lib/fuel-pattern/meals/data.ts:91` | member / shared | `fuel_meal_rejections` select | unpaged-read | 0 | b? |
| `lib/fuel-pattern/meals/data.ts:115` | member / shared | `fuel_meal_saves` select | unpaged-read | 0 | b? |
| `lib/fuel-pattern/meals/data.ts:135` | member / shared | `fuel_meal_slot_state` select | unpaged-read | 2 | b? |
| `lib/guest-preview/data.ts:142` | member / shared | `guest_wellness_check_answers` upsert | unbatched-bulk-write |  | b? |
| `lib/guest-preview/data.ts:152` | member / shared | `guest_wellness_check_answers` select | unpaged-read | 0 | b? |
| `lib/intelligence-core/data.ts:170` | member / shared | `wellness_identity_observations` select | unbatched-list | 13 | b? |
| `lib/intelligence-core/data.ts:233` | member / shared | `wellness_profile_dimensions` select | unpaged-read | 15 | b? |
| `lib/intelligence-core/data.ts:321` | member / shared | `list_own_wellness_recommendation_feedback` rpc | set-rpc-unbounded |  | b? |
| `lib/intelligence-engine/data.ts:225` | member / shared | `intelligence_coach_alerts` select | unpaged-read | 108 | b? |
| `lib/intelligence-engine/data.ts:247` | member / shared | `intelligence_coach_alerts` update | unbatched-list |  | b? |
| `lib/intelligence-engine/data.ts:265` | member / shared | `intelligence_coach_alerts` select | unbatched-list | 108 | b? |
| `lib/intelligence/data.ts:202` | member / shared | `wellness_insights` select | unbatched-list | 453 | b? |
| `lib/lead-capture/data.ts:194` | member / shared | `lead_messages` select | unpaged-read | 13 | b? |
| `lib/lead-capture/notify.ts:21` | member / shared | `user_roles` select | unpaged-read | 11 | b? |
| `lib/lifestyle-experiments/data.ts:135` | member / shared | `lifestyle_experiments` select | unpaged-read | 4 | b? |
| `lib/lifestyle-experiments/data.ts:213` | member / shared | `lifestyle_experiments` select | unpaged-read | 4 | b? |
| `lib/lifestyle-experiments/data.ts:228` | member / shared | `lifestyle_experiments` update | unbatched-list |  | b? |
| `lib/lifestyle-experiments/data.ts:243` | member / shared | `lifestyle_experiments` select | unpaged-read | 4 | b? |
| `lib/lifestyle-experiments/data.ts:270` | member / shared | `lifestyle_experiments` select | unpaged-read | 5 | b? |
| `lib/longitudinal-intelligence/data.ts:101` | member / shared | `member_pattern_states` select | unpaged-read | 51 | b? |
| `lib/longitudinal-intelligence/data.ts:189` | member / shared | `member_recommendation_events` select | unpaged-read | 0 | b? |
| `lib/member-counts/checkinCounts.ts:110` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | b? |
| `lib/member-interpretation/service.ts:66` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | b? |
| `lib/membership/relationship.ts:144` | member / shared | `coach_client_assignments` select | unpaged-read | 1 | b? |
| `lib/movement-profile/reviewItems.ts:91` | member / shared | `movement_profile_review_items` select | unpaged-read | 0 | b? |
| `lib/movement-sessions/data.ts:81` | member / shared | `movement_session_template_slots` select | unpaged-read | 14 | b? |
| `lib/movement-sessions/data.ts:286` | member / shared | `member_movement_session_runs` select | unpaged-read | 12 | b? |
| `lib/narrative/data.ts:141` | member / shared | `narrative_items` select | unpaged-read | 10 | b? |
| `lib/narrative/data.ts:183` | member / shared | `narrative_items` select | unbatched-list | 20 | b? |
| `lib/onboarding/baseline.ts:164` | member / shared | `onboarding_answers` select | unpaged-read | 14 | b? |
| `lib/onboarding/baseline.ts:165` | member / shared | `onboarding_questions` select | unpaged-read | 169 | b? |
| `lib/onboarding/reassessment.ts:33` | member / shared | `onboarding_submissions` select | unpaged-read | 1 | b? |
| `lib/onboarding/reassessment.ts:54` | member / shared | `onboarding_answers` select | unpaged-read | 14 | b? |
| `lib/onboarding/reassessment.ts:55` | member / shared | `onboarding_questions` select | unpaged-read | 169 | b? |
| `lib/pantry/data.ts:80` | member / shared | `pantry_items` select | unpaged-read | 0 | b? |
| `lib/pantry/data.ts:110` | member / shared | `pantry_items` select | unpaged-read | 0 | b? |
| `lib/pantry/data.ts:129` | member / shared | `pantry_items` select | unpaged-read | 0 | b? |
| `lib/primal-pattern/store.ts:73` | member / shared | `<ANSWERS_TABLE>` select | unpaged-read |  | b? |
| `lib/primal-pattern/store.ts:314` | member / shared | `<TABLE>` select | unpaged-read |  | b? |
| `lib/priority/data.ts:72` | member / shared | `member_daily_priorities` select | unbatched-list | 26 | b? |
| `lib/program-lifecycle/coachAttention.ts:88` | coach | `coach_program_assignments` select | unbatched-list | 12 | b? |
| `lib/program-lifecycle/opened.ts:32` | member / shared | `member_wellness_events` select | unbatched-list | 2924 | b? |
| `lib/program-lifecycle/service.ts:79` | member / shared | `profiles` select | unbatched-list | 12 | b? |
| `lib/programs/blueprints/assign.ts:218` | member / shared | `coach_program_assignments` select | unbatched-list | 12 | b? |
| `lib/programs/blueprints/assign.ts:234` | member / shared | `coach_program_assignments` delete | unbatched-list |  | b? |
| `lib/programs/blueprints/assign.ts:256` | member / shared | `coach_program_templates` select | unbatched-list | 12 | b? |
| `lib/programs/blueprints/assign.ts:265` | member / shared | `coach_program_templates` delete | unbatched-list |  | b? |
| `lib/programs/blueprints/candidates.ts:93` | member / shared | `exercise_catalog` select | unbatched-list | 824 | b? |
| `lib/programs/blueprints/data.ts:71` | member / shared | `program_blueprint_slots` select | unpaged-read | 27 | b? |
| `lib/programs/blueprints/data.ts:86` | member / shared | `movement_programs` select | unpaged-read | 17 | b? |
| `lib/programs/blueprints/data.ts:101` | member / shared | `movement_program_versions` select | unpaged-read | 2 | b? |
| `lib/programs/blueprints/saveAsTemplate.ts:168` | member / shared | `program_blueprint_slots` insert | unbatched-bulk-write |  | b? |
| `lib/programs/blueprints/versioning.ts:71` | member / shared | `program_blueprint_slots` insert | unbatched-bulk-write |  | b? |
| `lib/programs/blueprints/versioning.ts:257` | member / shared | `movement_programs` select | unpaged-read | 17 | b? |
| `lib/programs/feedback/attention.ts:60` | member / shared | `member_exercise_feedback` select | unbatched-list | 0 | b? |
| `lib/programs/feedback/candidates.ts:112` | member / shared | `exercise_catalog` select | unbatched-list | 861 | b? |
| `lib/programs/feedback/candidates.ts:164` | member / shared | `member_exercise_avoidance` select | unpaged-read | 0 | b? |
| `lib/programs/feedback/data.ts:240` | member / shared | `coach_assigned_workouts` select | unbatched-list | 34 | b? |
| `lib/programs/feedback/data.ts:253` | member / shared | `coach_assigned_workout_exercises` select | unbatched-list | 26 | b? |
| `lib/programs/feedback/data.ts:296` | member / shared | `coach_assigned_workout_exercises` update | unbatched-list |  | b? |
| `lib/programs/materialize.ts:68` | member / shared | `coach_program_templates` delete | unbatched-list |  | b? |
| `lib/programs/review/data.ts:82` | member / shared | `program_phase_reviews` select | unpaged-read | 0 | b? |
| `lib/programs/review/drafts.ts:321` | member / shared | `member_exercise_avoidance` select | unpaged-read | 0 | b? |
| `lib/programs/review/drafts.ts:353` | member / shared | `movement_session_template_slots` select | unpaged-read | 14 | b? |
| `lib/programs/review/drafts.ts:364` | member / shared | `exercise_catalog` select | unbatched-list | 861 | b? |
| `lib/programs/signals/data.ts:60` | member / shared | `coach_program_assignments` select | unpaged-read | 3 | b? |
| `lib/programs/signals/data.ts:99` | member / shared | `coach_assigned_workouts` select | unbatched-list | 34 | b? |
| `lib/programs/signals/data.ts:115` | member / shared | `coach_assigned_workout_sections` select | unbatched-list | 220 | b? |
| `lib/programs/signals/data.ts:121` | member / shared | `coach_assigned_workout_exercises` select | unbatched-list | 386 | b? |
| `lib/programs/signals/data.ts:129` | member / shared | `member_exercise_feedback` select | unpaged-read | 0 | b? |
| `lib/programs/signals/data.ts:143` | member / shared | `member_exercise_avoidance` select | unpaged-read | 0 | b? |
| `lib/protein/store.ts:185` | member / shared | `<TARGETS_TABLE>` select | unpaged-read |  | b? |
| `lib/protein/store.ts:199` | member / shared | `profiles` select | unbatched-list | 12 | b? |
| `lib/public-entry/data.ts:218` | member / shared | `public_entry_answers` upsert | unbatched-bulk-write |  | b? |
| `lib/public-entry/data.ts:228` | member / shared | `public_entry_answers` select | unpaged-read | 9 | b? |
| `lib/public-entry/funnel.ts:62` | member / shared | `public_entry_funnel` select | unpaged-read | 13 | b? |
| `lib/public-entry/funnel.ts:99` | member / shared | `public_entry_events` select | unpaged-read | 46 | b? |
| `lib/push-decision/data.ts:97` | member / shared | `member_push_subscriptions` select | unpaged-read | 3 | b? |
| `lib/push-decision/data.ts:113` | member / shared | `profiles` select | unbatched-list | 9 | b? |
| `lib/push/data.ts:192` | member / shared | `member_push_subscriptions` select | unpaged-read | 1 | b? |
| `lib/push/data.ts:221` | member / shared | `member_push_subscriptions` select | unpaged-read | 3 | b? |
| `lib/reassessment-intelligence/data.ts:24` | member / shared | `reassessment_schedules` select | unpaged-read | 1 | b? |
| `lib/reassessment-intelligence/data.ts:68` | member / shared | `reassessment_schedules` select | unpaged-read | 1 | b? |
| `lib/reassessment-intelligence/data.ts:210` | member / shared | `assessment_status_by_member` select | unpaged-read | 14 | b? |
| `lib/recommendation-engine/data.ts:222` | member / shared | `member_recommendations` update | unbatched-list |  | b? |
| `lib/recommendation-engine/data.ts:243` | member / shared | `member_recommendations` select | unbatched-list | 24 | b? |
| `lib/registry/adapters/onboarding.ts:80` | member / shared | `onboarding_answers` select | unpaged-read | 14 | b? |
| `lib/registry/adapters/onboarding.ts:81` | member / shared | `onboarding_questions` select | unpaged-read | 169 | b? |
| `lib/registry/data.ts:146` | member / shared | `registry_entries` select | unbatched-list | 57 | b? |
| `lib/registry/data.ts:187` | member / shared | `registry_entries` select | unbatched-list | 57 | b? |
| `lib/reset-plan/data.ts:257` | member / shared | `member_reset_plan_versions` select | unpaged-read | 4 | b? |
| `lib/reset-plan/data.ts:301` | member / shared | `member_reset_plan_daily_logs` select | unpaged-read | 3 | b? |
| `lib/root-coaching-engine/data.ts:51` | coach | `member_coaching_messages` select | unpaged-read | 263 | b? |
| `lib/root-map/coverage.ts:142` | member / shared | `daily_checkin_probe_answers` select | unbatched-list | 68 | b? |
| `lib/root-map/coverage.ts:166` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | b? |
| `lib/root-popup-messages/data.ts:343` | member / shared | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `lib/root-popup-messages/oneKnock.ts:140` | member / shared | `unified_assessment_sessions` select | unbatched-list | 6 | b? |
| `lib/safety/data.ts:261` | member / shared | `safety_review_queue` select | unbatched-list | 27 | b? |
| `lib/safety/data.ts:340` | member / shared | `safety_audit_log` select | unpaged-read | 98 | b? |
| `lib/scoring/fetchInputs.ts:36` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | b? |
| `lib/scoring/fetchInputs.ts:82` | member / shared | `food_lens_meal_quality_ratings` select | unbatched-list | 52 | b? |
| `lib/scoring/fetchInputs.ts:120` | member / shared | `movement_sessions` select | unpaged-read | 10 | b? |
| `lib/scoring/fetchInputs.ts:142` | member / shared | `body_assessments` select | unpaged-read | 2 | b? |
| `lib/scoring/fetchInputs.ts:171` | member / shared | `registry_entries` select | unpaged-read | 40 | b? |
| `lib/scoring/service.ts:110` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | b? |
| `lib/staff/testAccounts.ts:119` | member / shared | `coach_client_assignments` select | unpaged-read | 2 | b? |
| `lib/staff/testAccounts.ts:155` | member / shared | `profiles` select | unpaged-read | 10 | b? |
| `lib/stress-load/data.ts:240` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | b? |
| `lib/trial-arc/data.ts:59` | member / shared | `member_trial_arc_deliveries` select | unpaged-read | 1 | b? |
| `lib/trial-arc/data.ts:199` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | b? |
| `lib/trial-arc/data.ts:234` | member / shared | `cvs_experiment_daily_logs` select | unpaged-read | 13 | b? |
| `lib/visibility/context.ts:62` | member / shared | `onboarding_answers` select | unpaged-read | 14 | b? |
| `lib/visibility/context.ts:66` | member / shared | `onboarding_questions` select | unpaged-read | 169 | b? |
| `lib/visibility/data.ts:47` | member / shared | `member_feature_visibility` select | unpaged-read | 62 | b? |
| `lib/visibility/data.ts:101` | member / shared | `member_feature_visibility` upsert | unbatched-bulk-write |  | b? |
| `lib/visibility/data.ts:116` | member / shared | `member_feature_visibility` update | unbatched-list |  | b? |
| `lib/wearables/data.ts:19` | member / shared | `wearable_connections` select | unpaged-read | 1 | b? |
| `lib/wearables/data.ts:144` | member / shared | `wearable_daily_metrics` upsert | unbatched-bulk-write |  | b? |
| `lib/wearables/data.ts:179` | member / shared | `wearable_daily_metrics` select | unpaged-read | 0 | b? |
| `lib/weekly-reflection/data.ts:191` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | b? |
| `lib/whole-body-signal/contentData.ts:147` | member / shared | `whole_body_signal_questions` select | unpaged-read | 96 | b? |
| `lib/whole-body-signal/contentData.ts:237` | member / shared | `whole_body_signal_copy` select | unpaged-read | 60 | b? |
| `lib/whole-body-signal/contentData.ts:335` | member / shared | `whole_body_signal_coaching_questions` select | unpaged-read | 53 | b? |
| `lib/whole-body-signal/data.ts:354` | member / shared | `member_whole_body_signal_focus` select | unpaged-read | 0 | b? |
| `lib/whole-body-signal/data.ts:418` | member / shared | `member_whole_body_signal_question_actions` select | unbatched-list | 0 | b? |
| `lib/your-move/catalog.ts:69` | member / shared | `exercise_catalog` select | unbatched-list | 861 | b? |
| `lib/your-move/catalog.ts:156` | member / shared | `exercise_catalog` select | unpaged-read | 861 | b? |
| `lib/your-move/generation.ts:137` | member / shared | `exercise_catalog` select | unpaged-read | 861 | b? |
| `lib/your-move/posters.ts:40` | member / shared | `exercise_extracted_posters` select | unbatched-list | 0 | b? |
| `lib/your-move/posters.ts:92` | member / shared | `exercise_extracted_posters` select | unpaged-read | 0 | b? |
| `lib/your-move/posters.ts:99` | member / shared | `exercise_extracted_posters` delete | unbatched-list |  | b? |
| `scripts/_tmp-state.mjs:12` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b? |
| `scripts/approve-program-library-live.mjs:85` | script (standing tool) | `movement_programs` select | unpaged-read | 17 | b? |
| `scripts/approve-program-library-live.mjs:91` | script (standing tool) | `movement_program_versions` select | unpaged-read | 2 | b? |
| `scripts/approve-program-library-live.mjs:118` | script (standing tool) | `user_roles` select | unpaged-read | 3 | b? |
| `scripts/exercise-media/cleanup-exercise-api-media.ts:32` | script (standing tool) | `exercise_open_license_images` select | unpaged-read |  | b? |
| `scripts/exercise-media/cleanup-exercise-api-media.ts:42` | script (standing tool) | `exercise_open_license_images` delete | unbatched-list |  | b? |
| `scripts/exercise-media/cleanup-exercise-api-media.ts:53` | script (standing tool) | `exercise_extracted_posters` select | unpaged-read | 0 | b? |
| `scripts/exercise-media/cleanup-exercise-api-media.ts:66` | script (standing tool) | `exercise_extracted_posters` delete | unbatched-list |  | b? |
| `scripts/exercise-media/dedupe-exercise-catalog.ts:292` | script (standing tool) | `exercise_catalog` select | unpaged-read | 861 | b? |
| `scripts/exercise-media/dedupe-exercise-catalog.ts:296` | script (standing tool) | `mef_exercise_metadata` select | unpaged-read | 853 | b? |
| `scripts/exercise-media/extract-posters.ts:57` | script (standing tool) | `exercise_catalog` select | unpaged-read | 824 | b? |
| `scripts/exercise-media/fetch-your-move-catalog.ts:83` | script (standing tool) | `exercise_catalog` upsert | unbatched-bulk-write |  | b? |
| `scripts/exercise-media/migrate-legacy-exercise-references.ts:108` | script (standing tool) | `mef_exercise_metadata` select | unpaged-read | 825 | b? |
| `scripts/exercise-media/migrate-legacy-exercise-references.ts:183` | script (standing tool) | `member_exercise_favorites` select | unpaged-read | 0 | b? |
| `scripts/exercise-media/migrate-legacy-exercise-references.ts:238` | script (standing tool) | `<table>` select | unpaged-read |  | b? |
| `scripts/exercise-media/migrate-legacy-exercise-references.ts:268` | script (standing tool) | `member_exercise_recent_views` select | unpaged-read | 8 | b? |
| `scripts/measure-login-journey-live.mjs:152` | script (verification harness) | `consent_records` select | unpaged-read | 4 | b? |
| `scripts/measure-login-journey-live.mjs:187` | script (verification harness) | `consent_records` select | unpaged-read | 4 | b? |
| `scripts/measure-login-journey-live.mjs:204` | script (verification harness) | `consent_records` select | unpaged-read | 4 | b? |
| `scripts/provision-admin-account.mjs:242` | script (standing tool) | `user_roles` select | unpaged-read | 1 | b? |
| `scripts/provision-admin-account.mjs:283` | script (standing tool) | `analytics_member_scope` rpc | set-rpc-unbounded |  | b? |
| `scripts/provision-admin-account.mjs:291` | script (standing tool) | `coach_client_assignments` select | unpaged-read | 1 | b? |
| `scripts/screenshots/verify-role-based-home-routing-live.mjs:173` | script (verification harness) | `user_roles` select | unpaged-read | 14 | b? |
| `scripts/screenshots/verify-signout-dialog-live.mjs:198` | script (verification harness) | `user_roles` select | unpaged-read | 14 | b? |
| `scripts/screenshots/verify-skipped-meals.mjs:110` | script (verification harness) | `member_daily_probe_selections` insert | unbatched-bulk-write |  | b? |
| `scripts/screenshots/verify-skipped-meals.mjs:352` | script (verification harness) | `daily_checkin_probe_answers` select | unpaged-read | 9 | b? |
| `scripts/screenshots/verify-staff-chrome-and-signout-live.mjs:173` | script (verification harness) | `user_roles` select | unpaged-read | 14 | b? |
| `scripts/seed-production-test-accounts.mjs:287` | script (standing tool) | `daily_checkins` insert | unbatched-bulk-write |  | b? |
| `scripts/seed-production-test-accounts.mjs:357` | script (standing tool) | `energy_forecasts` insert | unbatched-bulk-write |  | b? |
| `scripts/seed-production-test-accounts.mjs:361` | script (standing tool) | `root_energy_forecasts` insert | unbatched-bulk-write |  | b? |
| `scripts/trial-arc-rig.mjs:166` | script (verification harness) | `member_trial_arc_deliveries` select | unpaged-read | 1 | b? |
| `scripts/trial-arc-rig.mjs:305` | script (verification harness) | `daily_checkins` insert | unbatched-bulk-write |  | b? |
| `scripts/trial-arc-rig.mjs:345` | script (verification harness) | `member_return_greetings` select | unpaged-read | 6 | b? |
| `scripts/trial-arc-rig.mjs:375` | script (verification harness) | `coach_client_assignments` select | unpaged-read | 1 | b? |
| `scripts/verify-acquisition-attribution-live.mjs:195` | script (verification harness) | `public_entry_links` select | unpaged-read | 0 | b? |
| `scripts/verify-acquisition-attribution-live.mjs:355` | script (verification harness) | `public_entry_attribution` select | unpaged-read | 1 | b? |
| `scripts/verify-acquisition-attribution-live.mjs:571` | script (verification harness) | `daily_checkins` select | unpaged-read | 46 | b? |
| `scripts/verify-acquisition-attribution-live.mjs:572` | script (verification harness) | `onboarding_submissions` select | unpaged-read | 1 | b? |
| `scripts/verify-acquisition-attribution-live.mjs:628` | script (verification harness) | `captured_leads` select | unpaged-read | 1 | b? |
| `scripts/verify-acquisition-attribution-live.mjs:640` | script (verification harness) | `public_entry_sessions` select | unpaged-read | 12 | b? |
| `scripts/verify-acquisition-attribution-live.mjs:652` | script (verification harness) | `public_entry_sessions` select | unbatched-list | 22 | b? |
| `scripts/verify-acquisition-report-live.mjs:136` | script (verification harness) | `captured_leads` select | unpaged-read | 1 | b? |
| `scripts/verify-acquisition-report-live.mjs:193` | script (verification harness) | `public_entry_funnel` select | unpaged-read | 22 | b? |
| `scripts/verify-acquisition-report-live.mjs:226` | script (verification harness) | `public_entry_sources` select | unpaged-read | 23 | b? |
| `scripts/verify-acquisition-report-live.mjs:530` | script (verification harness) | `public_entry_sessions` select | unbatched-list | 22 | b? |
| `scripts/verify-acquisition-report-live.mjs:545` | script (verification harness) | `acquisition_report_rows` select | unpaged-read | 32 | b? |
| `scripts/verify-admin-hidden-counts-live.mjs:48` | script (verification harness) | `profiles` select | unpaged-read | 12 | b? |
| `scripts/verify-analytics-live.mjs:125` | script (verification harness) | `profiles` select | unpaged-read | 12 | b? |
| `scripts/verify-analytics-live.mjs:130` | script (verification harness) | `user_roles` select | unpaged-read | 15 | b? |
| `scripts/verify-arrival-greeting-live.mts:94` | script (verification harness) | `consent_records` insert | unbatched-bulk-write |  | b? |
| `scripts/verify-arrival-greeting-live.mts:361` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-arrival-greeting-live.mts:404` | script (verification harness) | `public_entry_signup_refs` select | unpaged-read | 2 | b? |
| `scripts/verify-assessment-status-block-live.mjs:215` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b? |
| `scripts/verify-assessment-status-block-live.mjs:220` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-assessment-status-block-live.mjs:482` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b? |
| `scripts/verify-assessment-status-block-live.mjs:537` | script (verification harness) | `member_assignment_deliveries` delete | unbatched-list |  | b? |
| `scripts/verify-assessment-status-block-live.mjs:541` | script (verification harness) | `assessment_assignments` delete | unbatched-list |  | b? |
| `scripts/verify-assessment-status-block-live.mjs:546` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-assessment-status-block-live.mjs:552` | script (verification harness) | `member_root_popup_dismissals` delete | unbatched-list |  | b? |
| `scripts/verify-assign-again-prod.mjs:113` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-assign-again-prod.mjs:123` | script (verification harness) | `member_breathing_check_in_sessions` select | unpaged-read | 2 | b? |
| `scripts/verify-assign-flow-live.mjs:167` | script (verification harness) | `movement_program_versions` select | unpaged-read | 2 | b? |
| `scripts/verify-assign-flow-live.mjs:180` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 27 | b? |
| `scripts/verify-assign-flow-live.mjs:186` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 27 | b? |
| `scripts/verify-assign-flow-live.mjs:193` | script (verification harness) | `exercise_catalog` select | unbatched-list | 861 | b? |
| `scripts/verify-assign-flow-live.mjs:249` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b? |
| `scripts/verify-assign-flow-live.mjs:340` | script (verification harness) | `movement_program_versions` select | unpaged-read | 2 | b? |
| `scripts/verify-assign-flow-live.mjs:347` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 27 | b? |
| `scripts/verify-assign-flow-live.mjs:685` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b? |
| `scripts/verify-assign-flow-live.mjs:693` | script (verification harness) | `coach_assigned_workouts` select | unbatched-list | 44 | b? |
| `scripts/verify-assign-flow-live.mjs:701` | script (verification harness) | `coach_assigned_workout_exercises` select | unbatched-list | 29 | b? |
| `scripts/verify-assign-flow-live.mjs:710` | script (verification harness) | `coach_assigned_workout_exercises` select | unbatched-list | 29 | b? |
| `scripts/verify-assign-flow-live.mjs:720` | script (verification harness) | `coach_assigned_workouts` select | unbatched-list | 44 | b? |
| `scripts/verify-assign-flow-live.mjs:736` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b? |
| `scripts/verify-assign-flow-live.mjs:744` | script (verification harness) | `coach_program_assignments` delete | unbatched-list |  | b? |
| `scripts/verify-assign-flow-live.mjs:749` | script (verification harness) | `coach_program_templates` delete | unbatched-list |  | b? |
| `scripts/verify-assign-flow-live.mjs:755` | script (verification harness) | `movement_program_versions` select | unpaged-read | 2 | b? |
| `scripts/verify-assign-flow-live.mjs:765` | script (verification harness) | `movement_program_versions` select | unpaged-read | 2 | b? |
| `scripts/verify-assign-flow-live.mjs:778` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b? |
| `scripts/verify-assign-flow-live.mjs:784` | script (verification harness) | `movement_programs` select | unpaged-read | 17 | b? |
| `scripts/verify-assign-flow-live.mjs:794` | script (verification harness) | `movement_program_versions` select | unpaged-read | 2 | b? |
| `scripts/verify-assignment-receipts-live.mjs:101` | script (verification harness) | `assessment_assignments` select | unpaged-read | 3 | b? |
| `scripts/verify-being-seen-live.mjs:293` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b? |
| `scripts/verify-being-seen-live.mjs:306` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-being-seen-live.mjs:368` | script (verification harness) | `assessment_assignments` select | unpaged-read | 3 | b? |
| `scripts/verify-being-seen-live.mjs:676` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-being-seen-live.mjs:877` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-being-seen-live.mjs:925` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b? |
| `scripts/verify-being-seen-live.mjs:1137` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-being-seen-live.mjs:1148` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b? |
| `scripts/verify-being-seen-live.mjs:1155` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 5 | b? |
| `scripts/verify-being-seen-live.mjs:1162` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 5 | b? |
| `scripts/verify-being-seen-live.mjs:1172` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-blueprints-live.mjs:170` | script (verification harness) | `movement_program_versions` select | unpaged-read | 2 | b? |
| `scripts/verify-blueprints-live.mjs:180` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 27 | b? |
| `scripts/verify-blueprints-live.mjs:190` | script (verification harness) | `exercise_catalog` select | unbatched-list | 861 | b? |
| `scripts/verify-blueprints-live.mjs:226` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b? |
| `scripts/verify-blueprints-live.mjs:333` | script (verification harness) | `coach_program_template_exercises` insert | unbatched-bulk-write |  | b? |
| `scripts/verify-blueprints-live.mjs:430` | script (verification harness) | `coach_assigned_workout_exercises` insert | unbatched-bulk-write |  | b? |
| `scripts/verify-blueprints-live.mjs:491` | script (verification harness) | `coach_assigned_workouts` select | unpaged-read | 4 | b? |
| `scripts/verify-blueprints-live.mjs:501` | script (verification harness) | `coach_assigned_workout_exercises` select | unpaged-read | 1 | b? |
| `scripts/verify-blueprints-live.mjs:538` | script (verification harness) | `coach_program_assignments` delete | unbatched-list |  | b? |
| `scripts/verify-blueprints-live.mjs:541` | script (verification harness) | `coach_program_templates` delete | unbatched-list |  | b? |
| `scripts/verify-blueprints-live.mjs:544` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b? |
| `scripts/verify-blueprints-live.mjs:548` | script (verification harness) | `coach_program_templates` select | unbatched-list | 12 | b? |
| `scripts/verify-blueprints-live.mjs:552` | script (verification harness) | `coach_program_templates` select | unpaged-read | 6 | b? |
| `scripts/verify-body-systems-branch-labels.mjs:363` | script (verification harness) | `body_systems_copy` select | unpaged-read | 76 | b? |
| `scripts/verify-body-systems-experience-live.mjs:70` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b? |
| `scripts/verify-body-systems-experience-live.mjs:156` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b? |
| `scripts/verify-body-systems-experience-live.mjs:453` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b? |
| `scripts/verify-body-systems-experience-live.mjs:454` | script (verification harness) | `assessment_assignments` select | unpaged-read | 3 | b? |
| `scripts/verify-body-systems-live.mjs:666` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b? |
| `scripts/verify-body-systems-live.mjs:681` | script (verification harness) | `assessment_attempts` select | unpaged-read | 4 | b? |
| `scripts/verify-body-systems-live.mjs:696` | script (verification harness) | `registry_entries` select | unpaged-read | 22 | b? |
| `scripts/verify-body-systems-live.mjs:898` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b? |
| `scripts/verify-body-systems-live.mjs:899` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-body-systems-live.mjs:904` | script (verification harness) | `registry_entries` select | unpaged-read | 22 | b? |
| `scripts/verify-coach-assessment-search-live.mjs:162` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b? |
| `scripts/verify-coach-assessment-search-live.mjs:348` | script (verification harness) | `assessment_assignments` select | unpaged-read | 10 | b? |
| `scripts/verify-coach-assessment-search-live.mjs:407` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b? |
| `scripts/verify-coach-assessment-search-live.mjs:413` | script (verification harness) | `member_assignment_deliveries` delete | unbatched-list |  | b? |
| `scripts/verify-coach-assessment-search-live.mjs:414` | script (verification harness) | `assessment_assignments` delete | unbatched-list |  | b? |
| `scripts/verify-coach-assign-only-shelf-prod.mjs:166` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-coach-assign-only-shelf-prod.mjs:183` | script (verification harness) | `<table>` select | unpaged-read |  | b? |
| `scripts/verify-coach-member-view-live.mjs:64` | script (verification harness) | `coach_client_assignments` select | unpaged-read | 2 | b? |
| `scripts/verify-coach-member-view-live.mjs:70` | script (verification harness) | `profiles` select | unbatched-list | 12 | b? |
| `scripts/verify-coach-member-view-live.mjs:75` | script (verification harness) | `daily_checkins` select | unbatched-list | 136 | b? |
| `scripts/verify-coach-member-view-live.mjs:81` | script (verification harness) | `daily_checkin_probe_answers` select | unbatched-list | 40 | b? |
| `scripts/verify-coach-member-view-live.mjs:87` | script (verification harness) | `intelligence_coach_alerts` select | unbatched-list | 145 | b? |
| `scripts/verify-coach-reassignment-live.mjs:75` | script (verification harness) | `member_whole_body_signal_sessions` select | unpaged-read | 0 | b? |
| `scripts/verify-coach-reassignment-live.mjs:81` | script (verification harness) | `member_whole_body_signal_question_actions` delete | unbatched-list |  | b? |
| `scripts/verify-coach-reassignment-live.mjs:82` | script (verification harness) | `member_whole_body_signal_focus` delete | unbatched-list |  | b? |
| `scripts/verify-coach-reassignment-live.mjs:201` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-coach-reassignment-live.mjs:396` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-coach-reassignment-live.mjs:806` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-coach-reassignment-live.mjs:814` | script (verification harness) | `member_root_popup_dismissals` delete | unbatched-list |  | b? |
| `scripts/verify-coach-reassignment-live.mjs:832` | script (verification harness) | `member_whole_body_signal_sessions` select | unpaged-read | 0 | b? |
| `scripts/verify-coach-reassignment-live.mjs:833` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b? |
| `scripts/verify-coach-reassignment-live.mjs:838` | script (verification harness) | `assessment_attempts` select | unpaged-read | 18 | b? |
| `scripts/verify-coach-reassignment-live.mjs:843` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 6 | b? |
| `scripts/verify-coach-sees-test-member-live.mjs:59` | script (verification harness) | `profiles` select | unpaged-read | 12 | b? |
| `scripts/verify-coach-sees-test-member-live.mjs:65` | script (verification harness) | `coach_client_assignments` select | unpaged-read | 1 | b? |
| `scripts/verify-coach-sees-test-member-live.mjs:216` | script (verification harness) | `analytics_member_scope` rpc | set-rpc-unbounded |  | b? |
| `scripts/verify-coach-sees-test-member-live.mjs:219` | script (verification harness) | `analytics_member_scope` rpc | set-rpc-unbounded |  | b? |
| `scripts/verify-coaching-brain-live.mjs:167` | script (verification harness) | `coach_assigned_workouts` select | unpaged-read | 44 | b? |
| `scripts/verify-coaching-brain-live.mjs:182` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b? |
| `scripts/verify-coaching-brain-live.mjs:195` | script (verification harness) | `coach_assigned_workouts` select | unbatched-list | 44 | b? |
| `scripts/verify-coaching-brain-live.mjs:202` | script (verification harness) | `coach_assigned_workout_exercises` select | unbatched-list | 386 | b? |
| `scripts/verify-coaching-brain-live.mjs:532` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b? |
| `scripts/verify-coaching-brain-live.mjs:586` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b? |
| `scripts/verify-coaching-brain-live.mjs:631` | script (verification harness) | `coach_assigned_workouts` select | unbatched-list | 44 | b? |
| `scripts/verify-coaching-brain-live.mjs:635` | script (verification harness) | `coach_assigned_workout_exercises` select | unbatched-list | 29 | b? |
| `scripts/verify-coaching-brain-live.mjs:651` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b? |
| `scripts/verify-coaching-brain-live.mjs:666` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b? |
| `scripts/verify-coaching-brain-live.mjs:680` | script (verification harness) | `member_exercise_avoidance` select | unpaged-read | 0 | b? |
| `scripts/verify-coaching-brain-live.mjs:709` | script (verification harness) | `member_exercise_avoidance` select | unpaged-read | 0 | b? |
| `scripts/verify-coaching-brain-live.mjs:723` | script (verification harness) | `member_exercise_feedback` select | unpaged-read | 0 | b? |
| `scripts/verify-coaching-brain-live.mjs:851` | script (verification harness) | `coach_program_assignments` delete | unbatched-list |  | b? |
| `scripts/verify-coaching-brain-live.mjs:854` | script (verification harness) | `coach_program_templates` delete | unbatched-list |  | b? |
| `scripts/verify-coaching-brain-live.mjs:857` | script (verification harness) | `program_phase_reviews` delete | unbatched-list |  | b? |
| `scripts/verify-coaching-brain-live.mjs:861` | script (verification harness) | `member_exercise_avoidance` delete | unbatched-list |  | b? |
| `scripts/verify-coaching-brain-live.mjs:864` | script (verification harness) | `member_exercise_feedback` delete | unbatched-list |  | b? |
| `scripts/verify-coaching-brain-live.mjs:929` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b? |
| `scripts/verify-completed-experiences-live.mjs:54` | script (verification harness) | `unified_assessment_definitions` select | unpaged-read | 5 | b? |
| `scripts/verify-completed-experiences-live.mjs:59` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-daily-notification-decision-live.mjs:101` | script (verification harness) | `member_push_subscriptions` select | unpaged-read | 1 | b? |
| `scripts/verify-daily-notification-decision-live.mjs:492` | script (verification harness) | `member_push_subscriptions` delete | unbatched-list |  | b? |
| `scripts/verify-duplicate-experiment-offers-live.mjs:100` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 5 | b? |
| `scripts/verify-duplicate-experiment-offers-live.mjs:181` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 4 | b? |
| `scripts/verify-duplicate-experiment-offers-live.mjs:243` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 4 | b? |
| `scripts/verify-duplicate-experiment-offers-live.mjs:261` | script (verification harness) | `lifestyle_experiments` delete | unbatched-list |  | b? |
| `scripts/verify-explanations-live.mjs:179` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 12 | b? |
| `scripts/verify-explanations-live.mjs:185` | script (verification harness) | `coach_assigned_workout_exercises` select | unpaged-read | 386 | b? |
| `scripts/verify-explanations-live.mjs:194` | script (verification harness) | `exercise_catalog` select | unpaged-read | 861 | b? |
| `scripts/verify-explanations-live.mjs:201` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 415 | b? |
| `scripts/verify-explanations-live.mjs:204` | script (verification harness) | `exercise_catalog` select | unpaged-read | 861 | b? |
| `scripts/verify-explanations-live.mjs:227` | script (verification harness) | `coach_assigned_workout_exercises` select | unpaged-read | 29 | b? |
| `scripts/verify-explanations-live.mjs:239` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b? |
| `scripts/verify-explanations-live.mjs:254` | script (verification harness) | `movement_program_versions` select | unpaged-read | 2 | b? |
| `scripts/verify-explanations-live.mjs:383` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 27 | b? |
| `scripts/verify-explanations-live.mjs:614` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b? |
| `scripts/verify-explanations-live.mjs:622` | script (verification harness) | `coach_assigned_workouts` select | unbatched-list | 44 | b? |
| `scripts/verify-explanations-live.mjs:626` | script (verification harness) | `coach_assigned_workout_exercises` select | unbatched-list | 386 | b? |
| `scripts/verify-explanations-live.mjs:639` | script (verification harness) | `coach_assigned_workouts` select | unbatched-list | 44 | b? |
| `scripts/verify-explanations-live.mjs:645` | script (verification harness) | `member_program_lifecycle` select | unbatched-list | 0 | b? |
| `scripts/verify-explanations-live.mjs:681` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b? |
| `scripts/verify-explanations-live.mjs:707` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b? |
| `scripts/verify-explanations-live.mjs:727` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b? |
| `scripts/verify-explanations-live.mjs:735` | script (verification harness) | `coach_program_assignments` delete | unbatched-list |  | b? |
| `scripts/verify-explanations-live.mjs:739` | script (verification harness) | `coach_program_templates` delete | unbatched-list |  | b? |
| `scripts/verify-explanations-live.mjs:742` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b? |
| `scripts/verify-food-lens-macro-grams-live.mjs:116` | script (verification harness) | `member_food_log` select | unpaged-read | 37 | b? |
| `scripts/verify-food-lens-macro-grams-live.mjs:128` | script (verification harness) | `product_nutrients` select | unbatched-list | 17 | b? |
| `scripts/verify-food-lens-macro-grams-live.mjs:188` | script (verification harness) | `food_lens_item_macro_estimates` select | unpaged-read | 1 | b? |
| `scripts/verify-food-lens-macro-grams-live.mjs:285` | script (verification harness) | `member_food_log` select | unpaged-read | 4 | b? |
| `scripts/verify-food-lens-macro-grams-live.mjs:353` | script (verification harness) | `member_food_log` select | unpaged-read | 4 | b? |
| `scripts/verify-food-lens-macro-grams-live.mjs:374` | script (verification harness) | `member_food_log` delete | unbatched-list |  | b? |
| `scripts/verify-food-lens-macro-grams-live.mjs:377` | script (verification harness) | `member_food_log` delete | unbatched-list |  | b? |
| `scripts/verify-food-lens-macro-grams-live.mjs:378` | script (verification harness) | `food_lens_scans` delete | unbatched-list |  | b? |
| `scripts/verify-friction-armed-live.mjs:45` | script (verification harness) | `auth.users` listUsers | auth-list-unpaged |  | b? |
| `scripts/verify-friction-armed-live.mjs:52` | script (verification harness) | `registry_entries` select | unpaged-read | 136 | b? |
| `scripts/verify-friction-armed-live.mjs:64` | script (verification harness) | `profiles` select | unpaged-read | 12 | b? |
| `scripts/verify-friction-armed-live.mjs:186` | script (verification harness) | `member_coaching_decisions` select | unpaged-read | 31 | b? |
| `scripts/verify-friction-armed-live.mjs:202` | script (verification harness) | `member_coaching_decisions` select | unpaged-read | 31 | b? |
| `scripts/verify-friction-armed-live.mjs:258` | script (verification harness) | `member_coaching_threads` select | unpaged-read | 8 | b? |
| `scripts/verify-friction-armed-live.mjs:274` | script (verification harness) | `member_coaching_decisions` select | unpaged-read | 31 | b? |
| `scripts/verify-friction-question-live.mjs:169` | script (verification harness) | `member_coaching_decisions` select | unpaged-read | 31 | b? |
| `scripts/verify-friction-question-live.mjs:221` | script (verification harness) | `member_coaching_threads` select | unpaged-read | 8 | b? |
| `scripts/verify-fuel-pattern-experiment-live.mjs:580` | script (verification harness) | `fuel_experiment_checks` select | unpaged-read | 0 | b? |
| `scripts/verify-fuel-pattern-experiment-live.mjs:707` | script (verification harness) | `fuel_experiments` select | unpaged-read | 1 | b? |
| `scripts/verify-fuel-pattern-experiment-live.mjs:948` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-fuel-pattern-experiment-live.mjs:978` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-fuel-pattern-live.mjs:106` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-fuel-pattern-live.mjs:433` | script (verification harness) | `fuel_pattern_results` select | unpaged-read | 2 | b? |
| `scripts/verify-fuel-pattern-live.mjs:469` | script (verification harness) | `fuel_pattern_results` select | unpaged-read | 2 | b? |
| `scripts/verify-fuel-pattern-live.mjs:497` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 6 | b? |
| `scripts/verify-fuel-pattern-live.mjs:519` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-fuel-pattern-meals-live.mjs:709` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-fuel-pattern-meals-live.mjs:737` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-fuel-pattern-results-live.mjs:448` | script (verification harness) | `fuel_pattern_results` select | unpaged-read | 2 | b? |
| `scripts/verify-fuel-pattern-results-live.mjs:645` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-fuel-pattern-results-live.mjs:661` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-guest-wellness-check-fence-live.mjs:343` | script (verification harness) | `guest_wellness_check_answers` select | unpaged-read | 0 | b? |
| `scripts/verify-guest-wellness-check-fence-live.mjs:425` | script (verification harness) | `daily_checkins` select | unpaged-read | 46 | b? |
| `scripts/verify-health-intake-live.mjs:113` | script (verification harness) | `safety_classifications` select | unpaged-read | 27 | b? |
| `scripts/verify-health-intake-live.mjs:120` | script (verification harness) | `safety_audit_log` delete | unbatched-list |  | b? |
| `scripts/verify-health-intake-live.mjs:121` | script (verification harness) | `safety_review_queue` delete | unbatched-list |  | b? |
| `scripts/verify-health-intake-live.mjs:122` | script (verification harness) | `safety_acknowledgments` delete | unbatched-list |  | b? |
| `scripts/verify-health-intake-live.mjs:123` | script (verification harness) | `safety_classifications` delete | unbatched-list |  | b? |
| `scripts/verify-health-intake-live.mjs:928` | script (verification harness) | `member_health_intake_sessions` select | unpaged-read | 1 | b? |
| `scripts/verify-hydration-focus-live.mjs:199` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-hydration-focus-live.mjs:210` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-hydration-focus-live.mjs:290` | script (verification harness) | `member_daily_probe_selections` select | unpaged-read | 10 | b? |
| `scripts/verify-intake-profiles-live.mjs:70` | script (verification harness) | `member_feature_visibility` select | unpaged-read | 62 | b? |
| `scripts/verify-intake-profiles-live.mjs:89` | script (verification harness) | `onboarding_answers` select | unpaged-read | 14 | b? |
| `scripts/verify-intake-profiles-live.mjs:93` | script (verification harness) | `onboarding_questions` select | unpaged-read | 169 | b? |
| `scripts/verify-language-pass-live.mjs:251` | script (verification harness) | `member_feature_visibility` select | unpaged-read | 62 | b? |
| `scripts/verify-load-rules-live.mjs:215` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b? |
| `scripts/verify-load-rules-live.mjs:229` | script (verification harness) | `coach_assigned_workouts` select | unbatched-list | 44 | b? |
| `scripts/verify-load-rules-live.mjs:236` | script (verification harness) | `coach_assigned_workout_exercises` select | unbatched-list | 386 | b? |
| `scripts/verify-load-rules-live.mjs:282` | script (verification harness) | `coach_assigned_workouts` update | unbatched-list |  | b? |
| `scripts/verify-load-rules-live.mjs:605` | script (verification harness) | `program_phase_reviews` delete | unbatched-list |  | b? |
| `scripts/verify-load-rules-live.mjs:611` | script (verification harness) | `member_exercise_feedback` delete | unbatched-list |  | b? |
| `scripts/verify-member-program-presentation-live.mjs:162` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b? |
| `scripts/verify-member-program-presentation-live.mjs:188` | script (verification harness) | `coach_program_assignments` update | unbatched-list |  | b? |
| `scripts/verify-member-program-presentation-live.mjs:356` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b? |
| `scripts/verify-member-voice-live.mjs:165` | script (verification harness) | `exercise_catalog` select | unpaged-read | 1 | b? |
| `scripts/verify-member-voice-live.mjs:178` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 415 | b? |
| `scripts/verify-member-voice-live.mjs:181` | script (verification harness) | `exercise_catalog` select | unpaged-read | 861 | b? |
| `scripts/verify-member-voice-live.mjs:193` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b? |
| `scripts/verify-member-voice-live.mjs:201` | script (verification harness) | `coach_assigned_workouts` select | unbatched-list | 44 | b? |
| `scripts/verify-member-voice-live.mjs:208` | script (verification harness) | `coach_assigned_workout_exercises` select | unbatched-list | 306 | b? |
| `scripts/verify-member-voice-live.mjs:402` | script (verification harness) | `coach_assigned_workout_exercises` update | unbatched-list |  | b? |
| `scripts/verify-member-voice-live.mjs:429` | script (verification harness) | `coach_assigned_workout_exercises` select | unbatched-list | 386 | b? |
| `scripts/verify-member-voice-live.mjs:481` | script (verification harness) | `coach_assigned_workout_exercises` update | unbatched-list |  | b? |
| `scripts/verify-member-voice-live.mjs:503` | script (verification harness) | `mef_exercise_metadata` select | unpaged-read | 853 | b? |
| `scripts/verify-member-voice-live.mjs:621` | script (verification harness) | `member_exercise_feedback` select | unpaged-read | 0 | b? |
| `scripts/verify-member-voice-live.mjs:644` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 335 | b? |
| `scripts/verify-member-voice-live.mjs:732` | script (verification harness) | `member_exercise_feedback` delete | unbatched-list |  | b? |
| `scripts/verify-member-voice-live.mjs:735` | script (verification harness) | `member_exercise_avoidance` delete | unbatched-list |  | b? |
| `scripts/verify-membership-access-live.mjs:320` | script (verification harness) | `member_wellness_events` select | unpaged-read | 2443 | b? |
| `scripts/verify-membership-access-live.mjs:331` | script (verification harness) | `member_wellness_events` select | unpaged-read | 2443 | b? |
| `scripts/verify-naming-migration-live.mjs:148` | script (verification harness) | `unified_assessment_sections` select | unpaged-read | 16 | b? |
| `scripts/verify-naming-migration-live.mjs:175` | script (verification harness) | `unified_assessment_questions` select | unbatched-list | 120 | b? |
| `scripts/verify-naming-migration-live.mjs:188` | script (verification harness) | `registry_entries` select | unpaged-read | 136 | b? |
| `scripts/verify-naming-migration-live.mjs:259` | script (verification harness) | `registry_entries` select | unpaged-read | 138 | b? |
| `scripts/verify-owning-your-value-live.mjs:253` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-owning-your-value-live.mjs:381` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-owning-your-value-live.mjs:478` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-owning-your-value-live.mjs:533` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b? |
| `scripts/verify-popup-chain-and-events-live.mjs:52` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-popup-chain-drain-live.mjs:45` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-post-launch-fix-1-live.mts:569` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-post-launch-fix-1-live.mts:680` | script (verification harness) | `member_trial_arc_deliveries` select | unpaged-read | 1 | b? |
| `scripts/verify-post-launch-fix-1-live.mts:698` | script (verification harness) | `member_trial_arc_deliveries` select | unbatched-list | 3 | b? |
| `scripts/verify-post-launch-fix-3-live.mjs:226` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-program-hero-live.mjs:163` | script (verification harness) | `coach_program_assignments` update | unbatched-list |  | b? |
| `scripts/verify-program-hero-live.mjs:175` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b? |
| `scripts/verify-program-hero-live.mjs:179` | script (verification harness) | `coach_assigned_workouts` select | unpaged-read | 34 | b? |
| `scripts/verify-program-hero-live.mjs:183` | script (verification harness) | `member_wellness_events` select | unpaged-read | 2443 | b? |
| `scripts/verify-program-hero-live.mjs:338` | script (verification harness) | `member_wellness_events` select | unbatched-list | 2443 | b? |
| `scripts/verify-program-hero-live.mjs:362` | script (verification harness) | `member_wellness_events` select | unbatched-list | 2443 | b? |
| `scripts/verify-program-hero-live.mjs:468` | script (verification harness) | `member_wellness_events` delete | unbatched-list |  | b? |
| `scripts/verify-program-hero-live.mjs:474` | script (verification harness) | `coach_assigned_workouts` delete | unbatched-list |  | b? |
| `scripts/verify-program-hero-live.mjs:477` | script (verification harness) | `coach_program_assignments` delete | unbatched-list |  | b? |
| `scripts/verify-program-hero-live.mjs:480` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b? |
| `scripts/verify-program-hero-live.mjs:484` | script (verification harness) | `coach_assigned_workouts` select | unpaged-read | 34 | b? |
| `scripts/verify-program-hero-live.mjs:488` | script (verification harness) | `member_wellness_events` select | unpaged-read | 2443 | b? |
| `scripts/verify-program-library-live.mjs:157` | script (verification harness) | `movement_programs` select | unpaged-read | 17 | b? |
| `scripts/verify-program-library-live.mjs:158` | script (verification harness) | `movement_program_versions` select | unpaged-read | 18 | b? |
| `scripts/verify-program-library-live.mjs:218` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 27 | b? |
| `scripts/verify-program-lifecycle-live.mjs:117` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b? |
| `scripts/verify-program-lifecycle-live.mjs:161` | script (verification harness) | `coach_program_assignments` update | unbatched-list |  | b? |
| `scripts/verify-program-lifecycle-live.mjs:240` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b? |
| `scripts/verify-program-lifecycle-live.mjs:293` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b? |
| `scripts/verify-program-lifecycle-live.mjs:301` | script (verification harness) | `coach_program_assignments` update | unbatched-list |  | b? |
| `scripts/verify-program-lifecycle-live.mjs:315` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b? |
| `scripts/verify-program-lifecycle-live.mjs:320` | script (verification harness) | `coach_program_assignments` update | unbatched-list |  | b? |
| `scripts/verify-program-lifecycle-live.mjs:325` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b? |
| `scripts/verify-program-lifecycle-live.mjs:443` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b? |
| `scripts/verify-public-entry-continuation-live.mjs:174` | script (verification harness) | `daily_checkins` select | unpaged-read | 46 | b? |
| `scripts/verify-public-entry-continuation-live.mjs:178` | script (verification harness) | `onboarding_submissions` select | unpaged-read | 1 | b? |
| `scripts/verify-push-notifications-live.mjs:105` | script (verification harness) | `member_push_subscriptions` select | unpaged-read | 1 | b? |
| `scripts/verify-push-notifications-live.mjs:493` | script (verification harness) | `member_push_subscriptions` delete | unbatched-list |  | b? |
| `scripts/verify-questionnaire-experience-live.mjs:101` | script (verification harness) | `wellness_assessments` select | unpaged-read | 2 | b? |
| `scripts/verify-questionnaire-experience-live.mjs:122` | script (verification harness) | `investigation_router_decisions` select | unpaged-read | 114 | b? |
| `scripts/verify-questionnaire-experience-live.mjs:130` | script (verification harness) | `investigation_router_decisions` select | unpaged-read | 114 | b? |
| `scripts/verify-questionnaire-experience-live.mjs:188` | script (verification harness) | `wellness_assessments` select | unpaged-read | 2 | b? |
| `scripts/verify-questionnaire-experience-live.mjs:194` | script (verification harness) | `wellness_assessment_answers` select | unbatched-list | 392 | b? |
| `scripts/verify-questionnaire-experience-live.mjs:540` | script (verification harness) | `wellness_assessments` select | unpaged-read | 2 | b? |
| `scripts/verify-questionnaire-polish-live.mjs:104` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b? |
| `scripts/verify-questionnaire-polish-live.mjs:105` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b? |
| `scripts/verify-questionnaire-polish-live.mjs:106` | script (verification harness) | `registry_entries` select | unpaged-read | 22 | b? |
| `scripts/verify-questionnaire-polish-live.mjs:111` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-questionnaire-polish-live.mjs:137` | script (verification harness) | `member_body_systems_sessions` delete | unbatched-list |  | b? |
| `scripts/verify-questionnaire-polish-live.mjs:138` | script (verification harness) | `registry_entries` delete | unbatched-list |  | b? |
| `scripts/verify-questionnaire-polish-live.mjs:140` | script (verification harness) | `assessment_attempts` delete | unbatched-list |  | b? |
| `scripts/verify-questionnaire-polish-live.mjs:141` | script (verification harness) | `assessment_assignments` delete | unbatched-list |  | b? |
| `scripts/verify-questionnaire-root-live.ts:411` | script (verification harness) | `cross_system_root_findings` select | unpaged-read | 0 | b? |
| `scripts/verify-questionnaire-root-live.ts:526` | script (verification harness) | `cross_system_signals` select | unpaged-read | 2 | b? |
| `scripts/verify-questionnaire-root-live.ts:566` | script (verification harness) | `cross_system_signals` select | unpaged-read | 5 | b? |
| `scripts/verify-quiz-signup-link-live.mts:312` | script (verification harness) | `public_entry_signup_refs` select | unpaged-read | 1 | b? |
| `scripts/verify-quiz-signup-link-live.mts:560` | script (verification harness) | `public_entry_sessions` select | unpaged-read | 22 | b? |
| `scripts/verify-quiz-signup-link-live.mts:578` | script (verification harness) | `public_entry_sessions` select | unpaged-read | 22 | b? |
| `scripts/verify-quiz-signup-link-live.mts:594` | script (verification harness) | `public_entry_signup_refs` select | unpaged-read | 2 | b? |
| `scripts/verify-recovery-running-behind-coach-card.mjs:78` | script (verification harness) | `member_stress_load_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-recovery-running-behind-live.mjs:98` | script (verification harness) | `member_stress_load_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-recovery-running-behind-live.mjs:129` | script (verification harness) | `coach_client_assignments` select | unpaged-read | 1 | b? |
| `scripts/verify-recovery-running-behind-live.mjs:182` | script (verification harness) | `assessment_assignments` select | unpaged-read | 3 | b? |
| `scripts/verify-recovery-running-behind-live.mjs:265` | script (verification harness) | `member_stress_load_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-recovery-running-behind-live.mjs:330` | script (verification harness) | `registry_entries` select | unpaged-read | 22 | b? |
| `scripts/verify-relationship-library-live.mjs:124` | script (verification harness) | `cross_system_relationships` select | unpaged-read | 240 | b? |
| `scripts/verify-relationship-library-live.mjs:135` | script (verification harness) | `cross_system_relationship_versions` select | unpaged-read | 1 | b? |
| `scripts/verify-relationship-library-live.mjs:150` | script (verification harness) | `cross_system_signal_names` select | unpaged-read | 211 | b? |
| `scripts/verify-relationship-library-live.mjs:243` | script (verification harness) | `cross_system_relationships` select | unpaged-read | 239 | b? |
| `scripts/verify-relationship-library-live.mjs:263` | script (verification harness) | `cross_system_relationship_components` select | unpaged-read | 13 | b? |
| `scripts/verify-relationship-library-live.mjs:292` | script (verification harness) | `cross_system_relationship_versions` select | unpaged-read | 1 | b? |
| `scripts/verify-relationship-library-live.mjs:372` | script (verification harness) | `cross_system_relationships` select | unpaged-read | 240 | b? |
| `scripts/verify-relationship-library-live.mjs:373` | script (verification harness) | `cross_system_relationship_versions` select | unpaged-read | 1 | b? |
| `scripts/verify-render-writes-prefetch-live.mjs:57` | script (verification harness) | `member_pattern_states` select | unpaged-read | 51 | b? |
| `scripts/verify-root-expansion-live.mjs:414` | script (verification harness) | `cross_system_complaint_classifications` select | unpaged-read | 0 | b? |
| `scripts/verify-root-expansion-live.mjs:423` | script (verification harness) | `cross_system_signals` select | unpaged-read | 117 | b? |
| `scripts/verify-root-expansion-live.mjs:432` | script (verification harness) | `cross_system_root_findings` select | unpaged-read | 0 | b? |
| `scripts/verify-root-expansion-live.mjs:471` | script (verification harness) | `cross_system_relationships` select | unpaged-read | 239 | b? |
| `scripts/verify-root-expansion-live.mjs:481` | script (verification harness) | `cross_system_relationship_versions` select | unbatched-list | 240 | b? |
| `scripts/verify-root-expansion-live.mjs:517` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b? |
| `scripts/verify-root-expansion-live.mjs:548` | script (verification harness) | `daily_checkins` select | unpaged-read | 25 | b? |
| `scripts/verify-root-expansion-live.mjs:562` | script (verification harness) | `cross_system_complaint_reports` select | unpaged-read | 0 | b? |
| `scripts/verify-root-expansion-live.mjs:795` | script (verification harness) | `cross_system_root_findings` select | unbatched-list | 0 | b? |
| `scripts/verify-root-expansion-live.mjs:878` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b? |
| `scripts/verify-root-expansion-live.mjs:1088` | script (verification harness) | `cross_system_root_findings` select | unbatched-list | 0 | b? |
| `scripts/verify-root-expansion-live.mjs:1143` | script (verification harness) | `cross_system_complaint_reports` select | unpaged-read | 0 | b? |
| `scripts/verify-root-expansion-live.mjs:1156` | script (verification harness) | `daily_checkins` select | unpaged-read | 25 | b? |
| `scripts/verify-root-noticed-live.mjs:287` | script (verification harness) | `cross_system_relationships` select | unpaged-read | 239 | b? |
| `scripts/verify-root-noticed-live.mjs:297` | script (verification harness) | `cross_system_relationship_versions` select | unbatched-list | 240 | b? |
| `scripts/verify-root-noticed-live.mjs:329` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b? |
| `scripts/verify-root-noticed-live.mjs:414` | script (verification harness) | `cross_system_complaint_classifications` select | unpaged-read | 0 | b? |
| `scripts/verify-root-noticed-live.mjs:443` | script (verification harness) | `cross_system_signals` select | unpaged-read | 108 | b? |
| `scripts/verify-root-noticed-live.mjs:465` | script (verification harness) | `cross_system_root_findings` select | unpaged-read | 0 | b? |
| `scripts/verify-root-noticed-live.mjs:477` | script (verification harness) | `cross_system_relationships` select | unbatched-list | 240 | b? |
| `scripts/verify-root-noticed-live.mjs:785` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b? |
| `scripts/verify-root-noticed-live.mjs:840` | script (verification harness) | `cross_system_complaint_reports` delete | unbatched-list |  | b? |
| `scripts/verify-root-noticed-live.mjs:845` | script (verification harness) | `cross_system_signals` delete | unbatched-list |  | b? |
| `scripts/verify-staff-assign-roundtrip.mjs:72` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b? |
| `scripts/verify-staff-assign-roundtrip.mjs:97` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b? |
| `scripts/verify-stress-load-live.mjs:159` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-stress-load-live.mjs:314` | script (verification harness) | `member_stress_load_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-stress-load-live.mjs:327` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-stress-load-live.mjs:353` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b? |
| `scripts/verify-stress-load-live.mjs:383` | script (verification harness) | `registry_entries` select | unpaged-read | 22 | b? |
| `scripts/verify-the-giving-ledger-live.mjs:205` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 4 | b? |
| `scripts/verify-the-giving-ledger-live.mjs:339` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-the-giving-ledger-live.mjs:471` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-the-giving-ledger-live.mjs:570` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-the-giving-ledger-live.mjs:627` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b? |
| `scripts/verify-the-life-youre-building-live.mjs:291` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b? |
| `scripts/verify-the-life-youre-building-live.mjs:304` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-the-life-youre-building-live.mjs:628` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-the-life-youre-building-live.mjs:869` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-the-life-youre-building-live.mjs:940` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b? |
| `scripts/verify-the-life-youre-building-live.mjs:1038` | script (verification harness) | `assessment_assignments` select | unpaged-read | 3 | b? |
| `scripts/verify-the-life-youre-building-live.mjs:1211` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-the-life-youre-building-live.mjs:1223` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b? |
| `scripts/verify-the-life-youre-building-live.mjs:1344` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 5 | b? |
| `scripts/verify-the-life-youre-building-live.mjs:1354` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-the-life-youre-building-live.mjs:1456` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-the-life-youre-building-live.mjs:1467` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-the-life-youre-building-live.mjs:1477` | script (verification harness) | `assessment_attempts` select | unpaged-read | 4 | b? |
| `scripts/verify-the-life-youre-building-live.mjs:1487` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-the-life-youre-building-live.mjs:1498` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 5 | b? |
| `scripts/verify-the-weight-of-yes-live.mjs:178` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-the-weight-of-yes-live.mjs:240` | script (verification harness) | `assessment_assignments` select | unpaged-read | 3 | b? |
| `scripts/verify-the-weight-of-yes-live.mjs:290` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-the-weight-of-yes-live.mjs:488` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-the-weight-of-yes-live.mjs:586` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-the-weight-of-yes-live.mjs:631` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b? |
| `scripts/verify-the-weight-of-yes-live.mjs:688` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b? |
| `scripts/verify-the-weight-of-yes-live.mjs:856` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-the-weight-of-yes-live.mjs:902` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-the-weight-of-yes-live.mjs:910` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b? |
| `scripts/verify-the-weight-of-yes-live.mjs:917` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 5 | b? |
| `scripts/verify-the-weight-of-yes-live.mjs:924` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 4 | b? |
| `scripts/verify-the-weight-of-yes-live.mjs:935` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-this-week-band-live.mjs:129` | script (verification harness) | `<table>` select | unpaged-read |  | b? |
| `scripts/verify-this-week-band-live.mjs:172` | script (verification harness) | `daily_checkins_current` select | unpaged-read | 45 | b? |
| `scripts/verify-this-week-band-live.mjs:182` | script (verification harness) | `coach_assigned_workouts` select | unpaged-read | 34 | b? |
| `scripts/verify-this-week-band-live.mjs:293` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b? |
| `scripts/verify-this-week-band-live.mjs:320` | script (verification harness) | `intelligence_coach_alerts` select | unpaged-read | 108 | b? |
| `scripts/verify-this-week-band-live.mjs:367` | script (verification harness) | `daily_checkins` select | unpaged-read | 25 | b? |
| `scripts/verify-this-week-band-live.mjs:421` | script (verification harness) | `daily_checkins_current` select | unpaged-read | 45 | b? |
| `scripts/verify-trial-arc-day6-live.mts:319` | script (verification harness) | `unified_assessment_questions` select | unpaged-read | 64 | b? |
| `scripts/verify-trial-arc-day6-live.mts:327` | script (verification harness) | `unified_assessment_answers` select | unpaged-read | 24 | b? |
| `scripts/verify-trial-arc-day6-live.mts:443` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-trial-arc-day6-live.mts:465` | script (verification harness) | `unified_assessment_sessions` delete | unbatched-list |  | b? |
| `scripts/verify-trial-arc-day6-live.mts:488` | script (verification harness) | `unified_assessment_sessions` update | unbatched-list |  | b? |
| `scripts/verify-trial-arc-day6-live.mts:695` | script (verification harness) | `member_pattern_states` select | unpaged-read | 51 | b? |
| `scripts/verify-trial-arc-day6-live.mts:964` | script (verification harness) | `profiles` select | unpaged-read | 12 | b? |
| `scripts/verify-trial-arc-day6-live.mts:981` | script (verification harness) | `member_trial_arc_recaps` select | unpaged-read | 0 | b? |
| `scripts/verify-trial-arc-day7-live.mts:320` | script (verification harness) | `unified_assessment_questions` select | unpaged-read | 64 | b? |
| `scripts/verify-trial-arc-day7-live.mts:328` | script (verification harness) | `unified_assessment_answers` select | unpaged-read | 24 | b? |
| `scripts/verify-trial-arc-day7-live.mts:439` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-trial-arc-day7-live.mts:453` | script (verification harness) | `unified_assessment_sessions` update | unbatched-list |  | b? |
| `scripts/verify-trial-arc-day7-live.mts:1135` | script (verification harness) | `profiles` select | unpaged-read | 12 | b? |
| `scripts/verify-trial-arc-day7-live.mts:1152` | script (verification harness) | `member_trial_arc_closes` select | unpaged-read | 0 | b? |
| `scripts/verify-trial-arc-day7-live.mts:1156` | script (verification harness) | `member_trial_arc_recaps` select | unpaged-read | 0 | b? |
| `scripts/verify-trial-arc-drive-live.mts:427` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-trial-arc-drive-live.mts:450` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-trial-arc-drive-live.mts:489` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 4 | b? |
| `scripts/verify-trial-arc-drive-live.mts:553` | script (verification harness) | `assessment_attempts` select | unpaged-read | 4 | b? |
| `scripts/verify-trial-arc-drive-live.mts:573` | script (verification harness) | `assessment_attempts` update | unbatched-list |  | b? |
| `scripts/verify-trial-arc-drive-live.mts:578` | script (verification harness) | `unified_assessment_sessions` update | unbatched-list |  | b? |
| `scripts/verify-trial-arc-drive-live.mts:592` | script (verification harness) | `unified_assessment_sessions` update | unbatched-list |  | b? |
| `scripts/verify-trial-arc-drive-live.mts:634` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-trial-arc-drive-live.mts:712` | script (verification harness) | `member_return_greetings` select | unpaged-read | 6 | b? |
| `scripts/verify-trial-arc-drive-live.mts:754` | script (verification harness) | `profiles` select | unpaged-read | 12 | b? |
| `scripts/verify-trial-arc-drive-live.mts:763` | script (verification harness) | `coach_client_assignments` select | unpaged-read | 1 | b? |
| `scripts/verify-trial-arc-drive-live.mts:814` | script (verification harness) | `member_trial_arc_deliveries` select | unpaged-read | 1 | b? |
| `scripts/verify-trial-arc-drive-live.mts:856` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b? |
| `scripts/verify-trial-arc-drive-live.mts:864` | script (verification harness) | `assessment_attempts` select | unpaged-read | 4 | b? |
| `scripts/verify-trial-arc-drive-live.mts:874` | script (verification harness) | `unified_assessment_sessions` update | unbatched-list |  | b? |
| `scripts/verify-trial-arc-drive-live.mts:877` | script (verification harness) | `assessment_attempts` update | unbatched-list |  | b? |
| `scripts/verify-trial-arc-drive-live.mts:893` | script (verification harness) | `unified_assessment_sessions` update | unbatched-list |  | b? |
| `scripts/verify-trial-arc-drive-live.mts:1032` | script (verification harness) | `profiles` select | unpaged-read | 12 | b? |
| `scripts/verify-trial-arc-launch-live.mts:69` | script (verification harness) | `profiles` select | unpaged-read | 12 | b? |
| `scripts/verify-trial-arc-launched-live.mts:236` | script (verification harness) | `member_trial_arc_deliveries` select | unpaged-read | 1 | b? |
| `scripts/verify-trial-arc-launched-live.mts:944` | script (verification harness) | `member_subscriptions` select | unpaged-read | 12 | b? |
| `scripts/verify-trial-arc-launched-live.mts:1200` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-trial-arc-launched-live.mts:1212` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-trial-arc-launched-live.mts:1234` | script (verification harness) | `profiles` select | unpaged-read | 12 | b? |
| `scripts/verify-trial-arc-launched-live.mts:1258` | script (verification harness) | `<table>` select | unpaged-read |  | b? |
| `scripts/verify-trial-arc-launched-live.mts:1264` | script (verification harness) | `member_subscriptions` select | unpaged-read | 12 | b? |
| `scripts/verify-trial-arc-launched-live.mts:1345` | script (verification harness) | `profiles` select | unpaged-read | 12 | b? |
| `scripts/verify-trial-arc-live.mts:45` | script (verification harness) | `profiles` select | unpaged-read | 12 | b? |
| `scripts/verify-trial-arc-pacing-live.mts:60` | script (verification harness) | `profiles` select | unpaged-read | 12 | b? |
| `scripts/verify-trial-arc-pacing-live.mts:106` | script (verification harness) | `member_subscriptions` select | unpaged-read | 12 | b? |
| `scripts/verify-trial-ended-day8-live.mts:146` | script (verification harness) | `public_entry_events` select | unpaged-read | 46 | b? |
| `scripts/verify-trial-ended-day8-live.mts:574` | script (verification harness) | `public_entry_sessions` select | unpaged-read | 22 | b? |
| `scripts/verify-trial-ended-day8-live.mts:589` | script (verification harness) | `member_public_entry_origin` select | unpaged-read | 2 | b? |
| `scripts/verify-trial-ended-day8-live.mts:688` | script (verification harness) | `coach_client_assignments` select | unpaged-read | 1 | b? |
| `scripts/verify-trial-ended-day8-live.mts:1122` | script (verification harness) | `coach_client_assignments` select | unpaged-read | 1 | b? |
| `scripts/verify-trial-ended-day8-live.mts:1129` | script (verification harness) | `user_roles` select | unpaged-read | 3 | b? |
| `scripts/verify-trial-ended-day8-live.mts:1199` | script (verification harness) | `coach_client_assignments` select | unpaged-read | 1 | b? |
| `scripts/verify-trial-ended-day8-live.mts:1302` | script (verification harness) | `member_trial_arc_deliveries` select | unpaged-read | 3 | b? |
| `scripts/verify-trial-ended-day8-live.mts:1308` | script (verification harness) | `member_trial_arc_recaps` select | unpaged-read | 0 | b? |
| `scripts/verify-trial-ended-day8-live.mts:1309` | script (verification harness) | `member_trial_arc_closes` select | unpaged-read | 0 | b? |
| `scripts/verify-trial-ended-day8-live.mts:1331` | script (verification harness) | `public_entry_sessions` delete | unbatched-list |  | b? |
| `scripts/verify-trial-ended-day8-live.mts:1333` | script (verification harness) | `public_entry_sessions` select | unpaged-read | 22 | b? |
| `scripts/verify-trial-ended-day8-live.mts:1338` | script (verification harness) | `public_entry_sessions` delete | unbatched-list |  | b? |
| `scripts/verify-trial-lock-screen-live.mjs:43` | script (verification harness) | `member_subscriptions` select | unpaged-read | 12 | b? |
| `scripts/verify-trial-seven-days-live.mjs:63` | script (verification harness) | `member_subscriptions` select | unpaged-read | 12 | b? |
| `scripts/verify-visibility-migrations-live.mjs:83` | script (verification harness) | `member_feature_visibility` select | unpaged-read | 401 | b? |
| `scripts/verify-visibility-migrations-live.mjs:145` | script (verification harness) | `daily_checkins` select | unpaged-read | 136 | b? |
| `scripts/verify-visibility-migrations-live.mjs:146` | script (verification harness) | `assessment_attempts` select | unpaged-read | 53 | b? |
| `scripts/verify-visibility-migrations-live.mjs:147` | script (verification harness) | `onboarding_submissions` select | unpaged-read | 10 | b? |
| `scripts/verify-visibility-migrations-live.mjs:173` | script (verification harness) | `profiles` select | unpaged-read | 12 | b? |
| `scripts/verify-visibility-migrations-live.mjs:207` | script (verification harness) | `assessment_attempts` select | unpaged-read | 53 | b? |
| `scripts/verify-visibility-migrations-live.mjs:210` | script (verification harness) | `assessment_definitions` select | unpaged-read | 26 | b? |
| `scripts/verify-visibility-migrations-live.mjs:250` | script (verification harness) | `profiles` select | unpaged-read | 12 | b? |
| `scripts/verify-weekly-reflection-assign-live.mjs:131` | script (verification harness) | `<table>` select | unpaged-read |  | b? |
| `scripts/verify-weekly-reflection-assign-live.mjs:246` | script (verification harness) | `<table>` insert | unbatched-bulk-write |  | b? |
| `scripts/verify-what-you-put-down-live.mjs:178` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b? |
| `scripts/verify-what-you-put-down-live.mjs:191` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-what-you-put-down-live.mjs:413` | script (verification harness) | `assessment_assignments` select | unpaged-read | 3 | b? |
| `scripts/verify-what-you-put-down-live.mjs:671` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-what-you-put-down-live.mjs:893` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-what-you-put-down-live.mjs:961` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b? |
| `scripts/verify-what-you-put-down-live.mjs:1214` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-what-you-put-down-live.mjs:1225` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-what-you-put-down-live.mjs:1232` | script (verification harness) | `assessment_attempts` select | unpaged-read | 4 | b? |
| `scripts/verify-what-you-put-down-live.mjs:1239` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b? |
| `scripts/verify-what-you-put-down-live.mjs:1246` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-where-your-joy-lives-live.mjs:272` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-where-your-joy-lives-live.mjs:401` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-where-your-joy-lives-live.mjs:506` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-where-your-joy-lives-live.mjs:557` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b? |
| `scripts/verify-whole-body-patterns-live.mjs:195` | script (verification harness) | `cross_system_signals` select | unpaged-read | 118 | b? |
| `scripts/verify-whole-body-patterns-live.mjs:201` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b? |
| `scripts/verify-whole-body-patterns-live.mjs:212` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b? |
| `scripts/verify-whole-body-patterns-live.mjs:233` | script (verification harness) | `cross_system_pattern_matches` select | unpaged-read | 0 | b? |
| `scripts/verify-whole-body-patterns-live.mjs:277` | script (verification harness) | `cross_system_relationships` select | unpaged-read | 240 | b? |
| `scripts/verify-whole-body-patterns-live.mjs:290` | script (verification harness) | `cross_system_relationship_components` select | unpaged-read | 2511 | a |
| `scripts/verify-whole-body-patterns-live.mjs:498` | script (verification harness) | `cross_system_pattern_matches` select | unpaged-read | 0 | b? |
| `scripts/verify-whole-body-patterns-live.mjs:514` | script (verification harness) | `cross_system_pattern_match_signals` select | unpaged-read | 0 | b? |
| `scripts/verify-whole-body-patterns-live.mjs:548` | script (verification harness) | `cross_system_pattern_matches` select | unpaged-read | 0 | b? |
| `scripts/verify-whole-body-patterns-live.mjs:575` | script (verification harness) | `<table>` select | unpaged-read |  | b? |
| `scripts/verify-whole-body-patterns-live.mjs:576` | script (verification harness) | `<table>` select | unpaged-read |  | b? |
| `scripts/verify-whole-body-patterns-live.mjs:660` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b? |
| `scripts/verify-whole-body-patterns-live.mjs:698` | script (verification harness) | `cross_system_relationships` select | unpaged-read | 240 | b? |
| `scripts/verify-whole-body-patterns-live.mjs:701` | script (verification harness) | `cross_system_signals` select | unpaged-read | 118 | b? |
| `scripts/verify-whole-body-patterns-live.mjs:706` | script (verification harness) | `cross_system_pattern_matches` select | unpaged-read | 0 | b? |
| `scripts/verify-whole-body-patterns-live.mjs:726` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b? |
| `scripts/verify-whole-body-signal-live.mjs:80` | script (verification harness) | `member_whole_body_signal_sessions` select | unpaged-read | 0 | b? |
| `scripts/verify-whole-body-signal-live.mjs:86` | script (verification harness) | `member_whole_body_signal_question_actions` delete | unbatched-list |  | b? |
| `scripts/verify-whole-body-signal-live.mjs:87` | script (verification harness) | `member_whole_body_signal_focus` delete | unbatched-list |  | b? |
| `scripts/verify-whole-body-signal-live.mjs:150` | script (verification harness) | `whole_body_signal_copy` select | unpaged-read | 60 | b? |
| `scripts/verify-whole-body-signal-live.mjs:167` | script (verification harness) | `whole_body_signal_questions` select | unpaged-read | 96 | b? |
| `scripts/verify-whole-body-signal-live.mjs:433` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-whole-body-signal-live.mjs:890` | script (verification harness) | `whole_body_signal_questions` select | unpaged-read | 12 | b? |
| `scripts/verify-whole-body-signal-live.mjs:1082` | script (verification harness) | `member_whole_body_signal_question_actions` select | unpaged-read | 0 | b? |
| `scripts/verify-whole-body-signal-live.mjs:1096` | script (verification harness) | `member_whole_body_signal_question_actions` select | unpaged-read | 0 | b? |
| `scripts/verify-whole-body-signal-live.mjs:1106` | script (verification harness) | `member_whole_body_signal_question_actions` select | unpaged-read | 0 | b? |
| `scripts/verify-whole-body-signal-live.mjs:1119` | script (verification harness) | `member_whole_body_signal_question_actions` select | unpaged-read | 0 | b? |
| `scripts/verify-whole-body-signal-live.mjs:1311` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
| `scripts/verify-whole-body-signal-live.mjs:1319` | script (verification harness) | `member_root_popup_dismissals` delete | unbatched-list |  | b? |
| `scripts/verify-whole-body-signal-live.mjs:1337` | script (verification harness) | `member_whole_body_signal_sessions` select | unpaged-read | 0 | b? |
| `scripts/verify-whole-body-signal-live.mjs:1338` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-whole-body-signal-live.mjs:1343` | script (verification harness) | `assessment_attempts` select | unpaged-read | 4 | b? |
| `scripts/verify-your-own-company-live.mjs:212` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b? |
| `scripts/verify-your-own-company-live.mjs:225` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-your-own-company-live.mjs:404` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 5 | b? |
| `scripts/verify-your-own-company-live.mjs:465` | script (verification harness) | `assessment_assignments` select | unpaged-read | 3 | b? |
| `scripts/verify-your-own-company-live.mjs:717` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-your-own-company-live.mjs:979` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-your-own-company-live.mjs:1044` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b? |
| `scripts/verify-your-own-company-live.mjs:1308` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b? |
| `scripts/verify-your-own-company-live.mjs:1319` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b? |
| `scripts/verify-your-own-company-live.mjs:1326` | script (verification harness) | `assessment_attempts` select | unpaged-read | 4 | b? |
| `scripts/verify-your-own-company-live.mjs:1333` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 5 | b? |
| `scripts/verify-your-own-company-live.mjs:1343` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b? |
