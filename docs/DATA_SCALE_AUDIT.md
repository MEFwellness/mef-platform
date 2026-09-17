# Data scale audit: silent truncation and oversized requests

2026-09-17. The inventory below was written and committed BEFORE any call
site was changed (commit 93c9d48); the summary, the resolution and the
per-site outcomes were added after the fix.

## Summary

| | requests scanned | flagged | (a) wrong on production today | (b) future trap, now fixed | (c) provably bounded, exempt with a reason |
| --- | ---: | ---: | ---: | ---: | ---: |
| App (member, coach, admin, API routes, scheduled jobs) | 1,238 | 333 | 1 | 281 | 51 |
| Scripts (backfills, catalog tools, provisioning, verification harnesses) | 1,540 | 586 | 1 | 538 | 47 |
| **Total** | **2,778** | **919** | **2** | **819** | **98** |

A further 1,909 requests were already bounded when the sweep began (a single
row, a head count, a small literal limit, a unique key, a fixed enum table,
or an earlier paged read) and needed nothing.

**Wrong on production today (a):**

1. **Admin analytics, one member's activity timeline.** The read asked for
   2,001 rows so it could say "truncated" past 2,000. PostgREST handed back
   1,000. For the test member (3,233 analytics events in the last 90 days) the screen
   silently showed only her newest 1,000 events and dropped every older day,
   and never showed the truncation notice. Fixed with
   `selectAllRows(build, { limit: 2001 })`.
2. **`scripts/verify-whole-body-patterns-live.mjs`**, a verification harness,
   read all 2,511 map components in one request and would have reported its
   own pattern's components missing on a re-run. Paged.

Every other flagged read returned under 1,000 rows on production on
2026-09-17 (measured per site, see Method step 3); the closest were the
exercise catalog reads at 861 of 1,000.

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

Every other flagged read returns under 1,000 rows on production today.

## Found during the fix

These were not in the inventory above, because the first scanner did not
recognise them. Each is now a rule in the guard.

| site | what | class | resolution |
| --- | --- | --- | --- |
| `lib/cross-system-patterns/data.ts` `membersHoldingAny` | `.limit(limit * 40)` with the default pass of 200 members asks for 8,000 signal rows and receives 1,000 (125 rows on production today) | b | `selectAllRows(build, { limit: limit * 40 })` |
| `lib/cross-system-patterns/data.ts` `replaceMatches` | contributions insert grows with matches times signals, in one request; missed because the payload is not named like a list | b | `writeInChunks`; the scanner now recognises any variable declared as an array |
| `lib/programs/signals/data.ts` | an id list written into an `.or()` filter string | c | exempt: the phases of one program group |
| `scripts/verify-member-program-presentation-live.mjs` | an id list in `.not('id', 'in', ...)` | c | exempt: the phases of one program group; NOT IN cannot be split |
| 46 script sites | `auth.admin.listUsers({ page: 1, perPage: 200 or 1000 })` read one page of accounts and searched it | b | `listAllAuthUsers` in `lib/data/pagedSelect.ts` walks every page; one fixed page is now a guard violation |

## Resolution of the 869 inventoried sites

| resolution | sites |
| --- | ---: |
| paged (selectAllRows) | 602 |
| exempt with a reason | 96 |
| chunked read (selectAllRowsInChunks) | 93 |
| chunked write (writeInChunks) | 74 |
| chunked by hand in ID_CHUNK_SIZE steps | 3 |
| paged storage listing | 1 |

## What the fix is

- **One shared helper**, `lib/data/pagedSelect.ts`: `selectAllRows` (with an
  optional `limit` for "up to N" reads), `selectAllRowsInChunks` (id lists of
  100, repeats removed first so no row returns twice), `writeInChunks`
  (chunked update, delete, insert, upsert), `listAllAuthUsers`. A read that
  walks 200,000 rows is refused with an error rather than returned short.
  Scripts import the same file (`.mjs` scripts import the `.ts` directly).
- **Same data out.** Filters, selected columns and every existing order are
  unchanged; a unique tiebreaker (`id`, or the table's unique key) is
  appended so pages cannot overlap. Where a read had no order and a list is
  displayed (habits, the rotating check-in probes, the content library,
  device labels, frequent foods), the order added is creation order, which
  is what those lists showed in practice. Four independent reviews of the
  diff found no dropped filter, column or changed outcome.
- **Atomicity kept where it matters.** A chunked write is all-or-nothing per
  chunk only, so a write whose list is structurally small stays one request
  with a `scale-exempt` reason (the exercise swap, the sections of one
  template). The poster purge now reports the rows that really were deleted
  when a later chunk fails, so their files are still removed.

## Guards

1. **`tests/data-scale-guard.test.ts`** scans every request in `app/`,
   `lib/`, `components/`, `hooks/`, `middleware.ts` and `scripts/` from the
   syntax tree and fails on: an unpaged read; a `.limit` or `.range` wider
   than 1,000; a variable list in `.in()`, in `.not/.filter(col, 'in', ...)`
   or in an `.or()` string; a bulk insert or upsert of an array; a
   set-returning rpc without a bound; an rpc it does not know; one fixed page
   of `listUsers`; `storage.list` without a limit. An exemption is
   `// scale-exempt: <what bounds it>` directly above the statement, with a
   real reason. Non-vacuous tests prove each rule fires.
2. **`tests/support/dataScaleRegistry.ts`**: unique keys (from production's
   indexes), the fixed enum tables with their reasons, and every rpc with
   whether it returns rows. Adding to any of them is a deliberate, reviewable
   act.
3. **`tests/data-scale-past-the-cap.test.ts`** seeds past 1,000 rows against
   local Supabase (`max_rows = 1000`, as production) and proves the consumer
   sees them all: events for one member-day (1,150), the analytics timeline
   (1,500), a member's signals (1,100), the whole lexicon (1,728), every map
   component including the deepest entry (2,511), exercise catalog filter
   values and an id lookup (1,153), and check-in history (1,100). Run against
   the pre-fix code, the same tests report 1,000 of 1,150, 1,000 of 1,500,
   0 of 1,153 (the id lookup's URL was refused) and 1,000 of 1,100.
4. **CLAUDE.md** carries the rules for future sessions.

## Known limits, stated plainly

- **Deliberate display windows are not truncation.** The member's Progress
  History shows her latest 30 check-ins and her Health Timeline her latest
  200 events, by design. The analytics member timeline shows at most 2,000
  actions and says so when it stops.
- **Platform-wide counts are now complete but walk every row.** The coach
  question bank's asked and answered counts (`lib/driver-probe-admin/data.ts`)
  and the driver-state cron's member list page through whole tables. They are
  correct today and will refuse loudly at 200,000 rows; they belong in SQL
  aggregates before then.
- **The staff test-account exclusion** (`lib/staff/testAccounts.ts`) puts the
  test accounts' ids in a `not in` filter on staff reads. It is bounded by
  hand-made fixture accounts (12 accounts on production in total today); a
  URL holds roughly 200 of them.

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

`site` is the file and line when the inventory was taken. `max today` is the
most rows the read could return on production on 2026-09-17. `class`: **a**
short on production today, **b** a future trap now fixed, **c** provably
bounded and exempted in code with the reason shown.

| site | area | request | trap | max today | class | resolution |
| --- | --- | --- | --- | ---: | --- | --- |
| `app/actions/acquisitionLinks.ts:166` | member / shared | `public_entry_links` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `app/actions/admin.ts:43` | admin | `profiles` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `app/actions/admin.ts:101` | admin | `user_roles` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `app/actions/admin.ts:129` | admin | `coach_client_assignments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `app/actions/admin.ts:140` | admin | `profiles` select | unpaged-read | 10 | b | paged (selectAllRows) |
| `app/actions/assessmentAssignments.ts:106` | member / shared | `assessment_assignments` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `app/actions/checkin.ts:647` | member / shared | `habits` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `app/actions/checkin.ts:691` | member / shared | `habit_logs` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `app/actions/coach.ts:41` | coach | `coach_client_assignments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `app/actions/coach.ts:63` | coach | `profiles` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `app/actions/coach.ts:97` | coach | `habits` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `app/actions/coach.ts:116` | coach | `habit_logs` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `app/actions/coach.ts:142` | coach | `coach_notes` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `app/actions/consent.ts:28` | member / shared | `consent_records` insert | unbatched-bulk-write |  | c | exempt: one row per entry of the literal CONSENT_ITEMS constant (four consent types) |
| `app/actions/consent.ts:36` | member / shared | `consent_records` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `app/actions/coreValuesSnapshot.ts:426` | member / shared | `unified_assessment_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `app/actions/coreValuesSnapshotAdmin.ts:55` | admin | `profiles` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `app/actions/coreValuesSnapshotAdmin.ts:215` | admin | `cvs_experiment_daily_logs` insert | unbatched-bulk-write |  | c | exempt: at most 7 rows, built from the 7-element literal dailyPattern above |
| `app/actions/exercise-feedback.ts:133` | member / shared | `member_program_lifecycle` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `app/actions/food-products.ts:330` | member / shared | `food_products` select | unbatched-list | 17 | b | chunked read (selectAllRowsInChunks) |
| `app/actions/lifeSignalCheck.ts:466` | member / shared | `unified_assessment_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `app/actions/memberAccess.ts:136` | member / shared | `admin_list_member_access` rpc | set-rpc-unbounded |  | b | paged (selectAllRows) |
| `app/actions/onboarding.ts:54` | member / shared | `onboarding_questions` select | unpaged-read | 144 | b | paged (selectAllRows) |
| `app/actions/onboarding.ts:85` | member / shared | `onboarding_questions` select | unpaged-read | 169 | b | paged (selectAllRows) |
| `app/actions/onboarding.ts:132` | member / shared | `onboarding_questions` select | unpaged-read | 144 | b | paged (selectAllRows) |
| `app/actions/onboarding.ts:158` | member / shared | `onboarding_questions` select | unpaged-read | 169 | b | paged (selectAllRows) |
| `app/actions/pantry.ts:63` | member / shared | `food_products` select | unbatched-list | 17 | b | chunked read (selectAllRowsInChunks) |
| `app/actions/protein-ledger.ts:117` | member / shared | `member_food_log` select | unpaged-read | 37 | b | paged (selectAllRows) |
| `app/actions/protein-ledger.ts:152` | member / shared | `food_products` select | unbatched-list | 17 | b | chunked read (selectAllRowsInChunks) |
| `app/actions/protein-ledger.ts:155` | member / shared | `product_nutrients` select | unbatched-list | 17 | b | chunked read (selectAllRowsInChunks) |
| `app/actions/protein-ledger.ts:158` | member / shared | `food_lens_macro_estimates` select | unbatched-list | 55 | b | chunked read (selectAllRowsInChunks) |
| `app/actions/pushNotificationsAdmin.ts:91` | admin | `profiles` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `app/actions/pushNotificationsAdmin.ts:95` | admin | `member_push_subscriptions` select | unbatched-list | 3 | b | chunked read (selectAllRowsInChunks) |
| `app/actions/questionnaireCatalog.ts:176` | member / shared | `assessment_attempts` select | unbatched-list | 6 | b | chunked read (selectAllRowsInChunks) |
| `app/actions/readinessPulse.ts:587` | member / shared | `unified_assessment_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `app/actions/resetPlanAdmin.ts:42` | admin | `profiles` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `app/actions/resetPlanAdmin.ts:179` | admin | `member_reset_plan_daily_logs` insert | unbatched-bulk-write |  | c | exempt: at most 7 rows, built from one of the 7-element literal dailyPattern arrays above |
| `app/actions/safety.ts:129` | member / shared | `safety_acknowledgments` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `app/actions/wbsa.ts:190` | member / shared | `unified_assessment_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `app/admin/acquisition/links/page.tsx:46` | admin | `public_entry_sources` select | unpaged-read | 23 | b | paged (selectAllRows) |
| `app/admin/acquisition/page.tsx:114` | admin | `public_entry_sources` select | unpaged-read | 23 | b | paged (selectAllRows) |
| `app/api/cron/correlation-engine/route.ts:47` | scheduled job | `user_roles` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `app/api/cron/daily-coaching-scan/route.ts:94` | scheduled job | `user_roles` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `app/api/cron/daily-coaching-scan/route.ts:108` | scheduled job | `profiles` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `app/api/cron/driver-state-engine/route.ts:38` | scheduled job | `user_roles` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `app/api/cron/forecast-grading/route.ts:45` | scheduled job | `user_roles` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `app/api/cron/wearable-daily/route.ts:53` | scheduled job | `wearable_connections` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `app/coach/clients/[id]/body-assessments/[assessmentId]/page.tsx:140` | coach | `profiles` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `app/coach/review-queue/page.tsx:40` | coach | `profiles` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `lib/acquisition/data.ts:411` | member / shared | `lead_acquisition_for_email` rpc | set-rpc-unbounded |  | c | exempt: lead_acquisition_for_email ends in `limit 1` (migration 201), so it returns at most one row |
| `lib/acquisition/reportData.ts:123` | member / shared | `acquisition_report_rows` select | unpaged-read | 32 | b | paged (selectAllRows) |
| `lib/acquisition/reportData.ts:186` | member / shared | `public_entry_sources` select | unpaged-read | 23 | b | paged (selectAllRows) |
| `lib/acquisition/reportData.ts:192` | member / shared | `public_entry_links` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/analytics-service/timeline.ts:189` | member / shared | `product_analytics_events` select | limit-above-cap | 3233 | a | paged (selectAllRows) |
| `lib/assessment-foundation/repository.ts:63` | member / shared | `unified_assessment_sections` select | unpaged-read | 16 | b | paged (selectAllRows) |
| `lib/assessment-foundation/repository.ts:89` | member / shared | `unified_assessment_questions` select | unpaged-read | 64 | b | paged (selectAllRows) |
| `lib/assessment-registry/facts.ts:73` | member / shared | `assessment_status_by_member` select | unpaged-read | 14 | b | paged (selectAllRows) |
| `lib/assessment-registry/facts.ts:79` | member / shared | `assessment_assignments` select | unpaged-read | 10 | b | paged (selectAllRows) |
| `lib/assessment-registry/facts.ts:84` | member / shared | `reassessment_schedules` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `lib/assessment-runtime/data.ts:54` | member / shared | `unified_assessment_answers` select | unpaged-read | 24 | b | paged (selectAllRows) |
| `lib/assessments/store.ts:87` | member / shared | `wellness_assessment_answers` select | unpaged-read | 91 | c | exempt: unique (assessment_id, category_id, question_number), and every questionnaire is a static JSON file of at most 91 questions |
| `lib/assessments/store.ts:316` | member / shared | `wellness_assessment_category_scores` upsert | unbatched-bulk-write |  | c | exempt: one row per category of one static questionnaire (at most 9 categories), and the scores must land all-or-nothing |
| `lib/assessments/store.ts:364` | member / shared | `wellness_assessment_category_scores` select | unpaged-read | 7 | c | exempt: unique (assessment_id, category_id), one row per category of one static questionnaire (at most 9 categories) |
| `lib/assessments/store.ts:389` | member / shared | `wellness_assessments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `lib/assessments/store.ts:442` | member / shared | `wellness_assessment_category_scores` select | unbatched-list | 3 | b | chunked read (selectAllRowsInChunks) |
| `lib/assignments/data.ts:97` | member / shared | `member_assignment_deliveries` select | unbatched-list | 10 | b | chunked read (selectAllRowsInChunks) |
| `lib/body-assessment/data.ts:314` | member / shared | `body_assessment_captures` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `lib/body-assessment/data.ts:411` | member / shared | `body_landmark_sets` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/body-assessment/data.ts:505` | member / shared | `body_assessment_findings` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `lib/body-assessment/data.ts:536` | member / shared | `body_assessment_findings` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `lib/body-assessment/data.ts:652` | member / shared | `body_assessment_comparisons` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/body-assessment/data.ts:720` | member / shared | `body_assessment_coach_reviews` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/body-assessment/data.ts:801` | member / shared | `body_assessment_annotations` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/body-systems/contentData.ts:145` | member / shared | `body_systems_questions` select | unpaged-read | 111 | b | paged (selectAllRows) |
| `lib/body-systems/contentData.ts:242` | member / shared | `body_systems_copy` select | unpaged-read | 47 | b | paged (selectAllRows) |
| `lib/body-systems/contentData.ts:274` | member / shared | `body_systems_associations` select | unpaged-read | 38 | b | paged (selectAllRows) |
| `lib/body-systems/contentData.ts:318` | member / shared | `body_systems_associations` select | unpaged-read | 38 | b | paged (selectAllRows) |
| `lib/case-view/data.ts:17` | member / shared | `member_goal_progress_checkins` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `lib/coach-assign/data.ts:56` | coach | `profiles` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `lib/coach-intelligence/data.ts:164` | coach | `assessment_ai_observations` insert | unbatched-bulk-write |  | b | chunked write (writeInChunks) |
| `lib/coach-intelligence/data.ts:179` | coach | `assessment_ai_observations` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/coach-intelligence/data.ts:257` | coach | `assessment_report_exercises` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/coach-member-entries/data.ts:114` | coach | `daily_checkins_current` select | unpaged-read | 45 | b | paged (selectAllRows) |
| `lib/coach-member-entries/data.ts:133` | coach | `daily_checkin_probe_answers` select | unpaged-read | 68 | b | paged (selectAllRows) |
| `lib/coach-member-entries/data.ts:146` | coach | `driver_probe_questions` select | unbatched-list | 88 | b | chunked read (selectAllRowsInChunks) |
| `lib/coach-member-entries/data.ts:251` | coach | `member_goal_selections` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `lib/coach-member-entries/data.ts:293` | coach | `onboarding_submissions` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `lib/coach-member-entries/data.ts:317` | coach | `unified_assessment_sessions` select | unpaged-read | 6 | b | paged (selectAllRows) |
| `lib/coach-member-entries/data.ts:375` | coach | `conversation_messages` select | unbatched-list | 50 | b | chunked read (selectAllRowsInChunks) |
| `lib/coach-program-builder/assignments.ts:251` | coach | `coach_assigned_workout_exercises` insert | unbatched-bulk-write |  | c | exempt: the exercises of one section of one coach-authored template, written whole so a section is never half-frozen |
| `lib/coach-program-builder/assignments.ts:417` | coach | `coach_program_assignments` select | unpaged-read | 3 | b | paged (selectAllRows) |
| `lib/coach-program-builder/assignments.ts:434` | coach | `coach_program_assignments` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `lib/coach-program-builder/assignments.ts:597` | coach | `coach_program_assignments` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `lib/coach-program-builder/assignments.ts:613` | coach | `coach_program_assignments` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `lib/coach-program-builder/assignments.ts:639` | coach | `member_program_lifecycle` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/coach-program-builder/assignments.ts:669` | coach | `coach_program_assignments` update | unbatched-list |  | c | exempt: the ids are the assignments of one program group (one member's program_group_key, two or three weekly assignments), and one statement keeps the text identical across the group |
| `lib/coach-program-builder/assignments.ts:684` | coach | `coach_program_assignments` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `lib/coach-program-builder/assignments.ts:704` | coach | `coach_assigned_workouts` select | unbatched-list | 44 | b | chunked read (selectAllRowsInChunks) |
| `lib/coach-program-builder/assignments.ts:771` | coach | `coach_assigned_workouts` select | unpaged-read | 34 | b | paged (selectAllRows) |
| `lib/coach-program-builder/assignments.ts:799` | coach | `coach_assigned_workout_sections` select | unpaged-read | 5 | b | paged (selectAllRows) |
| `lib/coach-program-builder/assignments.ts:804` | coach | `coach_assigned_workout_exercises` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `lib/coach-program-builder/templates.ts:126` | coach | `coach_program_templates` select | unpaged-read | 6 | b | paged (selectAllRows) |
| `lib/coach-program-builder/templates.ts:174` | coach | `coach_program_template_sections` select | unpaged-read | 5 | b | paged (selectAllRows) |
| `lib/coach-program-builder/templates.ts:190` | coach | `coach_program_template_exercises` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `lib/coach-program-builder/templates.ts:297` | coach | `coach_program_template_sections` insert | unbatched-bulk-write |  | c | exempt: the sections of one coach-authored template, inserted whole as one atomic replace (see this file's header) |
| `lib/coach-program-builder/templates.ts:319` | coach | `coach_program_template_sections` select | unpaged-read | 5 | b | paged (selectAllRows) |
| `lib/coach-program-builder/templates.ts:374` | coach | `coach_program_template_exercises` insert | unbatched-bulk-write |  | c | exempt: the exercises of one coach-authored template (a few dozen by design, see this file's header), inserted whole so a save never leaves half a template |
| `lib/coaching-direction/data.ts:86` | coach | `member_coaching_threads` select | unpaged-read | 8 | b | paged (selectAllRows) |
| `lib/coaching-direction/data.ts:218` | coach | `member_coaching_threads` select | unpaged-read | 8 | b | paged (selectAllRows) |
| `lib/coaching-direction/data.ts:432` | coach | `member_coaching_decisions` select | unpaged-read | 11 | c | exempt: one row per day (unique member_id+local_date) and the read is a 30-day window (UNRESOLVED_LOOKBACK_DAYS) |
| `lib/coaching-direction/data.ts:463` | coach | `member_coaching_decisions` select | unpaged-read | 31 | b | paged (selectAllRows) |
| `lib/coaching-direction/escalationData.ts:55` | coach | `member_coaching_threads` select | unpaged-read | 8 | b | paged (selectAllRows) |
| `lib/coaching-direction/escalationData.ts:137` | coach | `member_coaching_threads` select | unpaged-read | 8 | b | paged (selectAllRows) |
| `lib/coaching-direction/escalationData.ts:178` | coach | `member_coaching_decisions` select | unbatched-list | 31 | b | chunked read (selectAllRowsInChunks) |
| `lib/coaching-direction/frictionData.ts:45` | coach | `member_coaching_decisions` select | unpaged-read | 31 | b | paged (selectAllRows) |
| `lib/coaching-direction/gradesData.ts:87` | coach | `member_coaching_decisions` select | unpaged-read | 31 | b | paged (selectAllRows) |
| `lib/coaching-direction/gradesData.ts:223` | coach | `member_coaching_grades` select | unpaged-read | 10 | b | paged (selectAllRows) |
| `lib/coaching-direction/gradesData.ts:273` | coach | `member_coaching_grades` upsert | unbatched-bulk-write |  | c | exempt: one grading pass is at most 5 action-type grades plus one per thread in the 90-day ledger window (one decision per day), so at most 95 rows, and the pass is all-or-nothing |
| `lib/coaching-direction/signals.ts:90` | coach | `safety_acknowledgments` select | unbatched-list | 0 | b | chunked read (selectAllRowsInChunks) |
| `lib/coaching-engine/data.ts:106` | coach | `habits` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/coaching-engine/data.ts:125` | coach | `habit_logs` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/coaching-insights/data.ts:19` | coach | `coaching_insights` select | unpaged-read | 3 | c | exempt: unique (member_id, local_date, category) and category is check-constrained to 5 values, so one date is at most 5 rows |
| `lib/coaching-insights/sources/checkinSource.ts:62` | coach | `daily_checkins_current` select | unpaged-read | 45 | b | paged (selectAllRows) |
| `lib/coaching-insights/sources/progressSource.ts:66` | coach | `daily_checkins_current` select | unpaged-read | 45 | b | paged (selectAllRows) |
| `lib/conversation-coach/data.ts:338` | coach | `conversation_memory` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/conversation-coach/data.ts:411` | coach | `conversation_handoffs` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/conversation-coach/data.ts:428` | coach | `conversation_handoffs` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/conversation-coach/nutritionActivity.ts:89` | coach | `member_food_log` select | unpaged-read | 37 | b | paged (selectAllRows) |
| `lib/core-values-snapshot/dailyLogsData.ts:29` | member / shared | `cvs_experiment_daily_logs` select | unpaged-read | 7 | b | paged (selectAllRows) |
| `lib/corrective-engine/findings.ts:40` | member / shared | `body_assessment_findings` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `lib/correlation-engine/data.ts:35` | member / shared | `correlation_candidate_pairs` select | unpaged-read | 18 | b | paged (selectAllRows) |
| `lib/correlation-engine/data.ts:125` | member / shared | `member_correlation_findings` select | unpaged-read | 18 | b | paged (selectAllRows) |
| `lib/cross-system-complaints/data.ts:103` | member / shared | `cross_system_complaint_classifications` upsert | unbatched-bulk-write |  | c | exempt: the classifications of one report, which the only caller caps at MAX_CLASSIFICATIONS_PER_REPORT (24), written all-or-nothing |
| `lib/cross-system-complaints/data.ts:260` | member / shared | `cross_system_signals` select | unbatched-list | 118 | c | exempt: one fingerprint per draft of one report (the only caller caps drafts at MAX_CLASSIFICATIONS_PER_REPORT, 24), unique (member_id, ingest_fingerprint) |
| `lib/cross-system-complaints/data.ts:361` | member / shared | `cross_system_complaint_classifications` select | unbatched-list | 0 | b | chunked read (selectAllRowsInChunks) |
| `lib/cross-system-patterns/data.ts:78` | member / shared | `cross_system_pattern_matches` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/cross-system-patterns/data.ts:90` | member / shared | `cross_system_pattern_match_signals` select | unbatched-list | 0 | b | chunked read (selectAllRowsInChunks) |
| `lib/cross-system-patterns/data.ts:155` | member / shared | `cross_system_pattern_matches` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `lib/cross-system-patterns/data.ts:168` | member / shared | `cross_system_pattern_matches` insert | unbatched-bulk-write |  | b | chunked write (writeInChunks) |
| `lib/cross-system-patterns/evaluate.ts:139` | member / shared | `cross_system_pattern_matches` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/cross-system-relationships/data.ts:385` | member / shared | `cross_system_relationship_components` insert | unbatched-bulk-write |  | c | exempt: the inputs of one version, capped at MAX_COMPONENTS (60) by resolveRelationshipDraft, and a version is written whole |
| `lib/cross-system-relationships/data.ts:410` | member / shared | `cross_system_relationship_strength_levels` insert | unbatched-bulk-write |  | c | exempt: the strength levels of one version, capped at MAX_STRENGTH_LEVELS (6) by resolveRelationshipDraft |
| `lib/cross-system-relationships/data.ts:428` | member / shared | `cross_system_relationship_considerations` insert | unbatched-bulk-write |  | c | exempt: the considerations of one version, cut to MAX_CONSIDERATIONS (30) by resolveRelationshipDraft |
| `lib/cross-system-root/data.ts:144` | member / shared | `cross_system_root_findings` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/cross-system-root/data.ts:245` | member / shared | `cross_system_root_findings` insert | unbatched-bulk-write |  | b | chunked write (writeInChunks) |
| `lib/cross-system-root/data.ts:294` | member / shared | `cross_system_root_finding_triggers` insert | unbatched-bulk-write |  | b | chunked write (writeInChunks) |
| `lib/cross-system-root/data.ts:305` | member / shared | `cross_system_root_finding_areas` insert | unbatched-bulk-write |  | b | chunked write (writeInChunks) |
| `lib/cross-system-root/data.ts:338` | member / shared | `cross_system_root_finding_signals` insert | unbatched-bulk-write |  | b | chunked write (writeInChunks) |
| `lib/cross-system-signals/data.ts:230` | member / shared | `cross_system_signals` upsert | unbatched-bulk-write |  | b | chunked write (writeInChunks) |
| `lib/daily-checkin-adaptive/data.ts:58` | member / shared | `driver_probe_questions` select | unpaged-read | 87 | b | paged (selectAllRows) |
| `lib/daily-checkin-adaptive/data.ts:72` | member / shared | `member_daily_probe_selections` select | unpaged-read | 205 | b | paged (selectAllRows) |
| `lib/daily-checkin-adaptive/data.ts:99` | member / shared | `member_daily_probe_selections` select | unpaged-read | 10 | b | paged (selectAllRows) |
| `lib/daily-checkin-adaptive/data.ts:124` | member / shared | `member_daily_probe_selections` upsert | unbatched-bulk-write |  | c | exempt: one day's plan, the 6 FIXED_CORE_QUESTION_KEYS plus at most ROTATING_PROBE_TARGET_COUNT (3) rotating probes |
| `lib/daily-checkin-adaptive/data.ts:161` | member / shared | `daily_checkin_probe_answers` select | unpaged-read | 5 | b | paged (selectAllRows) |
| `lib/discovery-moments/data.ts:16` | member / shared | `member_discovery_moments` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `lib/driver-library/data.ts:64` | member / shared | `drivers` select | unpaged-read | 35 | c | exempt: the authored driver library (one row per driver, text primary key, seeded by migration 106 and edited only by admin screens), and it stays unordered on purpose: lib/priority/service.ts takes panel.likelyInvolved[0] from this array's order |
| `lib/driver-library/data.ts:77` | member / shared | `driver_goal_weights` select | unpaged-read | 92 | b | paged (selectAllRows) |
| `lib/driver-library/data.ts:121` | member / shared | `member_driver_states` select | unpaged-read | 35 | b | paged (selectAllRows) |
| `lib/driver-probe-admin/data.ts:65` | admin | `driver_probe_questions` select | unpaged-read | 88 | b | paged (selectAllRows) |
| `lib/driver-probe-admin/data.ts:74` | admin | `member_daily_probe_selections` select | unpaged-read | 414 | b | paged (selectAllRows) |
| `lib/driver-probe-admin/data.ts:90` | admin | `daily_checkin_probe_answers` select | unpaged-read | 134 | b | paged (selectAllRows) |
| `lib/driver-probe-admin/data.ts:104` | admin | `daily_checkins` select | unpaged-read | 136 | b | paged (selectAllRows) |
| `lib/driver-probe-admin/data.ts:199` | admin | `driver_probe_question_revisions` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/driver-probe-admin/data.ts:231` | admin | `profiles` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `lib/energy-forecast/data.ts:290` | member / shared | `energy_forecasts` select | unpaged-read | 21 | b | paged (selectAllRows) |
| `lib/energy-forecast/data.ts:309` | member / shared | `root_energy_forecasts` select | unpaged-read | 21 | b | paged (selectAllRows) |
| `lib/events/service.ts:74` | member / shared | `member_wellness_events` select | unpaged-read | 390 | b | paged (selectAllRows) |
| `lib/exercise-library/favorites.ts:16` | member / shared | `member_exercise_favorites` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/exercise-library/favorites.ts:34` | member / shared | `member_exercise_favorites` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/exercise-library/metadata.ts:52` | member / shared | `mef_exercise_metadata` select | unbatched-list | 853 | b | chunked read (selectAllRowsInChunks) |
| `lib/exercise-library/metadata.ts:80` | member / shared | `member_exercise_cues` select | unbatched-list | 0 | b | chunked read (selectAllRowsInChunks) |
| `lib/feed/data.ts:26` | member / shared | `mef_content_items` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/feed/data.ts:80` | member / shared | `mef_content_items` select | unbatched-list | 0 | b | chunked read (selectAllRowsInChunks) |
| `lib/food-lens/data.ts:181` | member / shared | `food_lens_captures` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `lib/food-lens/data.ts:300` | member / shared | `food_lens_detected_items` select | unpaged-read | 6 | b | paged (selectAllRows) |
| `lib/food-lens/data.ts:487` | member / shared | `food_lens_item_macro_estimates` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `lib/food-lens/weeklyReportData.ts:115` | member / shared | `member_food_log` select | unpaged-read | 37 | b | paged (selectAllRows) |
| `lib/food-lens/weeklyReportData.ts:138` | member / shared | `food_analysis_results` select | unbatched-list | 19 | b | chunked read (selectAllRowsInChunks) |
| `lib/food-lens/weeklyReportData.ts:184` | member / shared | `food_lens_scans` select | unpaged-read | 26 | b | paged (selectAllRows) |
| `lib/food-lens/weeklyReportData.ts:204` | member / shared | `food_lens_meal_quality_ratings` select | unbatched-list | 52 | b | chunked read (selectAllRowsInChunks) |
| `lib/food-lens/weeklyReportData.ts:262` | member / shared | `food_lens_scans` select | unpaged-read | 26 | b | paged (selectAllRows) |
| `lib/food-lens/weeklyReportData.ts:282` | member / shared | `food_lens_detected_items` select | unbatched-list | 29 | b | chunked read (selectAllRowsInChunks) |
| `lib/food-lens/weeklyReportData.ts:313` | member / shared | `movement_sessions` select | unpaged-read | 10 | b | paged (selectAllRows) |
| `lib/food-lens/weeklyReportData.ts:339` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | c | exempt: the view is one row per (user_id, local_date) and the read is one 7-day week, so at most 7 rows |
| `lib/food-products/data.ts:73` | member / shared | `product_allergens` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/food-products/data.ts:170` | member / shared | `product_allergens` insert | unbatched-bulk-write |  | c | exempt: the allergen and trace tags of one provider product, replaced whole right after the delete above so the set stays all-or-nothing |
| `lib/food-products/data.ts:306` | member / shared | `product_allergens` insert | unbatched-bulk-write |  | c | exempt: the comma-separated "Contains" line of one confirmed product label, written whole with the product it belongs to |
| `lib/food-products/data.ts:611` | member / shared | `member_food_log` select | unpaged-read | 37 | b | paged (selectAllRows) |
| `lib/food-products/savedMeals.ts:44` | member / shared | `saved_meal_items` insert | unbatched-bulk-write |  | c | exempt: the detected items of one Food Lens scan, written whole as the one saved meal they make up |
| `lib/food-products/savedMeals.ts:105` | member / shared | `saved_meals` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/food-products/savedMeals.ts:123` | member / shared | `saved_meal_items` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/food-products/savedMeals.ts:156` | member / shared | `member_food_favorites` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/food-products/search.ts:87` | member / shared | `member_food_log` select | unpaged-read | 37 | b | paged (selectAllRows) |
| `lib/food-products/search.ts:111` | member / shared | `food_products` select | unbatched-list | 17 | c | exempt: ranked is sliced to `limit` ids above, and the only caller (app/actions/food-search.ts) passes 8 |
| `lib/fuel-pattern/data.ts:125` | member / shared | `fuel_pattern_results` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `lib/fuel-pattern/experiment/data.ts:128` | member / shared | `fuel_experiments` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `lib/fuel-pattern/experiment/data.ts:147` | member / shared | `fuel_experiment_checks` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/fuel-pattern/experiment/data.ts:168` | member / shared | `fuel_experiment_checks` select | unbatched-list | 0 | b | chunked read (selectAllRowsInChunks) |
| `lib/fuel-pattern/meals/data.ts:68` | member / shared | `fuel_meal_exclusions` select | unpaged-read | 0 | c | exempt: unique (member_id, exclusion_key) and exclusion_key is checked against a closed set of 12 keys (migration 237) |
| `lib/fuel-pattern/meals/data.ts:91` | member / shared | `fuel_meal_rejections` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/fuel-pattern/meals/data.ts:115` | member / shared | `fuel_meal_saves` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/fuel-pattern/meals/data.ts:135` | member / shared | `fuel_meal_slot_state` select | unpaged-read | 2 | c | exempt: primary key (member_id, meal_type) and meal_type is checked against 4 values (migration 237) |
| `lib/guest-preview/data.ts:142` | member / shared | `guest_wellness_check_answers` upsert | unbatched-bulk-write |  | c | exempt: every key is filtered by sanitizeGuestAnswers to the 7 fixed guest wellness check questions, so at most 7 rows |
| `lib/guest-preview/data.ts:152` | member / shared | `guest_wellness_check_answers` select | unpaged-read | 0 | c | exempt: unique (session_id, question_key) and only the 7 fixed guest wellness check question keys are ever written |
| `lib/intelligence-core/data.ts:170` | member / shared | `wellness_identity_observations` select | unbatched-list | 13 | c | exempt: statusFilter is a subset of WellnessIdentityStatus, a fixed set of three statuses |
| `lib/intelligence-core/data.ts:233` | member / shared | `wellness_profile_dimensions` select | unpaged-read | 15 | b | paged (selectAllRows) |
| `lib/intelligence-core/data.ts:321` | member / shared | `list_own_wellness_recommendation_feedback` rpc | set-rpc-unbounded |  | b | paged (selectAllRows) |
| `lib/intelligence-engine/data.ts:225` | member / shared | `intelligence_coach_alerts` select | unpaged-read | 108 | b | paged (selectAllRows) |
| `lib/intelligence-engine/data.ts:247` | member / shared | `intelligence_coach_alerts` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `lib/intelligence-engine/data.ts:265` | member / shared | `intelligence_coach_alerts` select | unbatched-list | 108 | c | exempt: statusFilter is a subset of the closed IntelligenceAlertStatus union |
| `lib/intelligence/data.ts:202` | member / shared | `wellness_insights` select | unbatched-list | 453 | c | exempt: statusFilter is a subset of the closed WellnessInsightStatus union |
| `lib/lead-capture/data.ts:194` | member / shared | `lead_messages` select | unpaged-read | 13 | b | paged (selectAllRows) |
| `lib/lead-capture/notify.ts:21` | member / shared | `user_roles` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `lib/lifestyle-experiments/data.ts:135` | member / shared | `lifestyle_experiments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `lib/lifestyle-experiments/data.ts:213` | member / shared | `lifestyle_experiments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `lib/lifestyle-experiments/data.ts:228` | member / shared | `lifestyle_experiments` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `lib/lifestyle-experiments/data.ts:243` | member / shared | `lifestyle_experiments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `lib/lifestyle-experiments/data.ts:270` | member / shared | `lifestyle_experiments` select | unpaged-read | 5 | b | paged (selectAllRows) |
| `lib/longitudinal-intelligence/data.ts:101` | member / shared | `member_pattern_states` select | unpaged-read | 51 | b | paged (selectAllRows) |
| `lib/longitudinal-intelligence/data.ts:189` | member / shared | `member_recommendation_events` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/member-counts/checkinCounts.ts:110` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | b | paged (selectAllRows) |
| `lib/member-interpretation/service.ts:66` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | c | exempt: the view is distinct on (user_id, local_date), so one member over the EVIDENCE_WINDOW_DAYS (21) day window is at most 21 rows |
| `lib/membership/relationship.ts:144` | member / shared | `coach_client_assignments` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `lib/movement-profile/reviewItems.ts:91` | member / shared | `movement_profile_review_items` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/movement-sessions/data.ts:81` | member / shared | `movement_session_template_slots` select | unpaged-read | 14 | b | paged (selectAllRows) |
| `lib/movement-sessions/data.ts:286` | member / shared | `member_movement_session_runs` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `lib/narrative/data.ts:141` | member / shared | `narrative_items` select | unpaged-read | 10 | b | paged (selectAllRows) |
| `lib/narrative/data.ts:183` | member / shared | `narrative_items` select | unbatched-list | 20 | c | exempt: statusFilter is a subset of the closed NarrativeStatus union (4 values) |
| `lib/onboarding/baseline.ts:164` | member / shared | `onboarding_answers` select | unpaged-read | 14 | b | paged (selectAllRows) |
| `lib/onboarding/baseline.ts:165` | member / shared | `onboarding_questions` select | unpaged-read | 169 | b | paged (selectAllRows) |
| `lib/onboarding/reassessment.ts:33` | member / shared | `onboarding_submissions` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `lib/onboarding/reassessment.ts:54` | member / shared | `onboarding_answers` select | unpaged-read | 14 | b | paged (selectAllRows) |
| `lib/onboarding/reassessment.ts:55` | member / shared | `onboarding_questions` select | unpaged-read | 169 | b | paged (selectAllRows) |
| `lib/pantry/data.ts:80` | member / shared | `pantry_items` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/pantry/data.ts:110` | member / shared | `pantry_items` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/pantry/data.ts:129` | member / shared | `pantry_items` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/primal-pattern/store.ts:73` | member / shared | `<ANSWERS_TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `lib/primal-pattern/store.ts:314` | member / shared | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `lib/priority/data.ts:72` | member / shared | `member_daily_priorities` select | unbatched-list | 26 | b | chunked read (selectAllRowsInChunks) |
| `lib/program-lifecycle/coachAttention.ts:88` | coach | `coach_program_assignments` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `lib/program-lifecycle/opened.ts:32` | member / shared | `member_wellness_events` select | unbatched-list | 2924 | b | chunked by hand in ID_CHUNK_SIZE steps |
| `lib/program-lifecycle/service.ts:79` | member / shared | `profiles` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `lib/programs/blueprints/assign.ts:218` | member / shared | `coach_program_assignments` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `lib/programs/blueprints/assign.ts:234` | member / shared | `coach_program_assignments` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `lib/programs/blueprints/assign.ts:256` | member / shared | `coach_program_templates` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `lib/programs/blueprints/assign.ts:265` | member / shared | `coach_program_templates` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `lib/programs/blueprints/candidates.ts:93` | member / shared | `exercise_catalog` select | unbatched-list | 824 | b | chunked read (selectAllRowsInChunks) |
| `lib/programs/blueprints/data.ts:71` | member / shared | `program_blueprint_slots` select | unpaged-read | 27 | b | paged (selectAllRows) |
| `lib/programs/blueprints/data.ts:86` | member / shared | `movement_programs` select | unpaged-read | 17 | b | paged (selectAllRows) |
| `lib/programs/blueprints/data.ts:101` | member / shared | `movement_program_versions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `lib/programs/blueprints/saveAsTemplate.ts:168` | member / shared | `program_blueprint_slots` insert | unbatched-bulk-write |  | b | chunked write (writeInChunks) |
| `lib/programs/blueprints/versioning.ts:71` | member / shared | `program_blueprint_slots` insert | unbatched-bulk-write |  | b | chunked write (writeInChunks) |
| `lib/programs/blueprints/versioning.ts:257` | member / shared | `movement_programs` select | unpaged-read | 17 | b | paged (selectAllRows) |
| `lib/programs/feedback/attention.ts:60` | member / shared | `member_exercise_feedback` select | unbatched-list | 0 | b | chunked read (selectAllRowsInChunks) |
| `lib/programs/feedback/candidates.ts:112` | member / shared | `exercise_catalog` select | unbatched-list | 861 | b | chunked read (selectAllRowsInChunks) |
| `lib/programs/feedback/candidates.ts:164` | member / shared | `member_exercise_avoidance` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/programs/feedback/data.ts:240` | member / shared | `coach_assigned_workouts` select | unbatched-list | 34 | b | chunked read (selectAllRowsInChunks) |
| `lib/programs/feedback/data.ts:253` | member / shared | `coach_assigned_workout_exercises` select | unbatched-list | 26 | b | chunked read (selectAllRowsInChunks) |
| `lib/programs/feedback/data.ts:296` | member / shared | `coach_assigned_workout_exercises` update | unbatched-list |  | c | exempt: the upcoming occurrences of ONE exercise in one member's program group, and a swap must land whole or not at all |
| `lib/programs/materialize.ts:68` | member / shared | `coach_program_templates` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `lib/programs/review/data.ts:82` | member / shared | `program_phase_reviews` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/programs/review/drafts.ts:321` | member / shared | `member_exercise_avoidance` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/programs/review/drafts.ts:353` | member / shared | `movement_session_template_slots` select | unpaged-read | 14 | b | paged (selectAllRows) |
| `lib/programs/review/drafts.ts:364` | member / shared | `exercise_catalog` select | unbatched-list | 861 | b | chunked read (selectAllRowsInChunks) |
| `lib/programs/signals/data.ts:60` | member / shared | `coach_program_assignments` select | unpaged-read | 3 | b | paged (selectAllRows) |
| `lib/programs/signals/data.ts:99` | member / shared | `coach_assigned_workouts` select | unbatched-list | 34 | b | chunked read (selectAllRowsInChunks) |
| `lib/programs/signals/data.ts:115` | member / shared | `coach_assigned_workout_sections` select | unbatched-list | 220 | b | chunked read (selectAllRowsInChunks) |
| `lib/programs/signals/data.ts:121` | member / shared | `coach_assigned_workout_exercises` select | unbatched-list | 386 | b | chunked read (selectAllRowsInChunks) |
| `lib/programs/signals/data.ts:129` | member / shared | `member_exercise_feedback` select | unpaged-read | 0 | c | exempt: assignmentIds are the phases of ONE program group for one member |
| `lib/programs/signals/data.ts:143` | member / shared | `member_exercise_avoidance` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/protein/store.ts:185` | member / shared | `<TARGETS_TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `lib/protein/store.ts:199` | member / shared | `profiles` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `lib/public-entry/data.ts:218` | member / shared | `public_entry_answers` upsert | unbatched-bulk-write |  | c | exempt: one row per answer key, and every caller passes sanitizeAnswers output, which keeps only keys of the literal ENERGY_QUESTIONS list |
| `lib/public-entry/data.ts:228` | member / shared | `public_entry_answers` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `lib/public-entry/funnel.ts:62` | member / shared | `public_entry_funnel` select | unpaged-read | 13 | b | paged (selectAllRows) |
| `lib/public-entry/funnel.ts:99` | member / shared | `public_entry_events` select | unpaged-read | 46 | b | paged (selectAllRows) |
| `lib/push-decision/data.ts:97` | member / shared | `member_push_subscriptions` select | unpaged-read | 3 | b | paged (selectAllRows) |
| `lib/push-decision/data.ts:113` | member / shared | `profiles` select | unbatched-list | 9 | b | chunked read (selectAllRowsInChunks) |
| `lib/push/data.ts:192` | member / shared | `member_push_subscriptions` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `lib/push/data.ts:221` | member / shared | `member_push_subscriptions` select | unpaged-read | 3 | b | paged (selectAllRows) |
| `lib/reassessment-intelligence/data.ts:24` | member / shared | `reassessment_schedules` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `lib/reassessment-intelligence/data.ts:68` | member / shared | `reassessment_schedules` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `lib/reassessment-intelligence/data.ts:210` | member / shared | `assessment_status_by_member` select | unpaged-read | 14 | b | paged (selectAllRows) |
| `lib/recommendation-engine/data.ts:222` | member / shared | `member_recommendations` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `lib/recommendation-engine/data.ts:243` | member / shared | `member_recommendations` select | unbatched-list | 24 | c | exempt: statusFilter is a subset of the closed recommendation status union |
| `lib/registry/adapters/onboarding.ts:80` | member / shared | `onboarding_answers` select | unpaged-read | 14 | b | paged (selectAllRows) |
| `lib/registry/adapters/onboarding.ts:81` | member / shared | `onboarding_questions` select | unpaged-read | 169 | b | paged (selectAllRows) |
| `lib/registry/data.ts:146` | member / shared | `registry_entries` select | unbatched-list | 57 | c | exempt: statusFilter is a subset of the closed RegistryEntryStatus union (4 values) |
| `lib/registry/data.ts:187` | member / shared | `registry_entries` select | unbatched-list | 57 | c | exempt: domains is a subset of the closed RegistryEntry domain union |
| `lib/reset-plan/data.ts:257` | member / shared | `member_reset_plan_versions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `lib/reset-plan/data.ts:301` | member / shared | `member_reset_plan_daily_logs` select | unpaged-read | 3 | b | paged (selectAllRows) |
| `lib/root-coaching-engine/data.ts:51` | coach | `member_coaching_messages` select | unpaged-read | 263 | b | paged (selectAllRows) |
| `lib/root-map/coverage.ts:142` | member / shared | `daily_checkin_probe_answers` select | unbatched-list | 68 | b | chunked read (selectAllRowsInChunks) |
| `lib/root-map/coverage.ts:166` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | b | paged (selectAllRows) |
| `lib/root-popup-messages/data.ts:343` | member / shared | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `lib/root-popup-messages/oneKnock.ts:140` | member / shared | `unified_assessment_sessions` select | unbatched-list | 6 | c | exempt: definitionIds is at most one id per key of FREE_ARC_SEQUENCE, a constant list of 3, and the read is capped by .limit(ROW_LIMIT) (20) |
| `lib/safety/data.ts:261` | member / shared | `safety_review_queue` select | unbatched-list | 27 | c | exempt: statusFilter is typed SafetyReviewStatus[], a fixed union of 6 statuses |
| `lib/safety/data.ts:340` | member / shared | `safety_audit_log` select | unpaged-read | 98 | b | paged (selectAllRows) |
| `lib/scoring/fetchInputs.ts:36` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | c | exempt: the view is one row per (user_id, local_date) and the window is RESILIENCE_LOOKBACK_DAYS (90) days, so at most 90 rows |
| `lib/scoring/fetchInputs.ts:82` | member / shared | `food_lens_meal_quality_ratings` select | unbatched-list | 52 | b | chunked read (selectAllRowsInChunks) |
| `lib/scoring/fetchInputs.ts:120` | member / shared | `movement_sessions` select | unpaged-read | 10 | b | paged (selectAllRows) |
| `lib/scoring/fetchInputs.ts:142` | member / shared | `body_assessments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `lib/scoring/fetchInputs.ts:171` | member / shared | `registry_entries` select | unpaged-read | 40 | b | paged (selectAllRows) |
| `lib/scoring/service.ts:110` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | c | exempt: the view is one row per (user_id, local_date) and the window is EVIDENCE_WINDOW_DAYS (21) days, so at most 21 rows |
| `lib/staff/testAccounts.ts:119` | member / shared | `coach_client_assignments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `lib/staff/testAccounts.ts:155` | member / shared | `profiles` select | unpaged-read | 10 | b | paged (selectAllRows) |
| `lib/stress-load/data.ts:240` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | c | exempt: the view is one row per (user_id, local_date) and the read is a 21-day window (STRESS_LOAD_CROSS_REFERENCE_WINDOW_DAYS) |
| `lib/trial-arc/data.ts:59` | member / shared | `member_trial_arc_deliveries` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `lib/trial-arc/data.ts:199` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | b | paged (selectAllRows) |
| `lib/trial-arc/data.ts:234` | member / shared | `cvs_experiment_daily_logs` select | unpaged-read | 13 | b | paged (selectAllRows) |
| `lib/visibility/context.ts:62` | member / shared | `onboarding_answers` select | unpaged-read | 14 | b | paged (selectAllRows) |
| `lib/visibility/context.ts:66` | member / shared | `onboarding_questions` select | unpaged-read | 169 | b | paged (selectAllRows) |
| `lib/visibility/data.ts:47` | member / shared | `member_feature_visibility` select | unpaged-read | 62 | b | paged (selectAllRows) |
| `lib/visibility/data.ts:101` | member / shared | `member_feature_visibility` upsert | unbatched-bulk-write |  | c | exempt: one row per newly revealed feature of the visibility catalog (lib/visibility/catalog.ts, 76 features), unique (member_id, feature_key) |
| `lib/visibility/data.ts:116` | member / shared | `member_feature_visibility` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `lib/wearables/data.ts:19` | member / shared | `wearable_connections` select | unpaged-read | 1 | c | exempt: unique (member_id, provider) and provider is check-constrained to 3 values, so at most 3 rows |
| `lib/wearables/data.ts:144` | member / shared | `wearable_daily_metrics` upsert | unbatched-bulk-write |  | b | chunked write (writeInChunks) |
| `lib/wearables/data.ts:179` | member / shared | `wearable_daily_metrics` select | unpaged-read | 0 | c | exempt: unique (member_id, provider, local_date, metric_code), with provider check-constrained to 3 values and metric_code to 16, so one date is at most 48 rows |
| `lib/weekly-reflection/data.ts:191` | member / shared | `daily_checkins_current` select | unpaged-read | 45 | c | exempt: the view is one row per (user_id, local_date) and recapRangeFor is a 7-day inclusive range, so at most 7 rows |
| `lib/whole-body-signal/contentData.ts:147` | member / shared | `whole_body_signal_questions` select | unpaged-read | 96 | b | paged (selectAllRows) |
| `lib/whole-body-signal/contentData.ts:237` | member / shared | `whole_body_signal_copy` select | unpaged-read | 60 | b | paged (selectAllRows) |
| `lib/whole-body-signal/contentData.ts:335` | member / shared | `whole_body_signal_coaching_questions` select | unpaged-read | 53 | b | paged (selectAllRows) |
| `lib/whole-body-signal/data.ts:354` | member / shared | `member_whole_body_signal_focus` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/whole-body-signal/data.ts:418` | member / shared | `member_whole_body_signal_question_actions` select | unbatched-list | 0 | b | chunked read (selectAllRowsInChunks) |
| `lib/your-move/catalog.ts:69` | member / shared | `exercise_catalog` select | unbatched-list | 861 | b | chunked read (selectAllRowsInChunks) |
| `lib/your-move/catalog.ts:156` | member / shared | `exercise_catalog` select | unpaged-read | 861 | b | paged (selectAllRows) |
| `lib/your-move/generation.ts:137` | member / shared | `exercise_catalog` select | unpaged-read | 861 | b | paged (selectAllRows) |
| `lib/your-move/posters.ts:40` | member / shared | `exercise_extracted_posters` select | unbatched-list | 0 | b | chunked read (selectAllRowsInChunks) |
| `lib/your-move/posters.ts:92` | member / shared | `exercise_extracted_posters` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `lib/your-move/posters.ts:99` | member / shared | `exercise_extracted_posters` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/_tmp-state.mjs:12` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/approve-program-library-live.mjs:85` | script (standing tool) | `movement_programs` select | unpaged-read | 17 | c | exempt: key is unique on movement_programs and the list is the constant LIBRARY_KEYS (16 keys) |
| `scripts/approve-program-library-live.mjs:91` | script (standing tool) | `movement_program_versions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/approve-program-library-live.mjs:118` | script (standing tool) | `user_roles` select | unpaged-read | 3 | b | paged (selectAllRows) |
| `scripts/exercise-media/cleanup-exercise-api-media.ts:32` | script (standing tool) | `exercise_open_license_images` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/exercise-media/cleanup-exercise-api-media.ts:42` | script (standing tool) | `exercise_open_license_images` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/exercise-media/cleanup-exercise-api-media.ts:53` | script (standing tool) | `exercise_extracted_posters` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/exercise-media/cleanup-exercise-api-media.ts:66` | script (standing tool) | `exercise_extracted_posters` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/exercise-media/dedupe-exercise-catalog.ts:292` | script (standing tool) | `exercise_catalog` select | unpaged-read | 861 | b | paged (selectAllRows) |
| `scripts/exercise-media/dedupe-exercise-catalog.ts:296` | script (standing tool) | `mef_exercise_metadata` select | unpaged-read | 853 | b | paged (selectAllRows) |
| `scripts/exercise-media/extract-posters.ts:57` | script (standing tool) | `exercise_catalog` select | unpaged-read | 824 | b | paged (selectAllRows) |
| `scripts/exercise-media/fetch-your-move-catalog.ts:83` | script (standing tool) | `exercise_catalog` upsert | unbatched-bulk-write |  | c | exempt: already chunked by hand, each upsert is one rows.slice of at most BATCH_SIZE (200) rows |
| `scripts/exercise-media/migrate-legacy-exercise-references.ts:108` | script (standing tool) | `mef_exercise_metadata` select | unpaged-read | 825 | b | paged (selectAllRows) |
| `scripts/exercise-media/migrate-legacy-exercise-references.ts:183` | script (standing tool) | `member_exercise_favorites` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/exercise-media/migrate-legacy-exercise-references.ts:238` | script (standing tool) | `<table>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/exercise-media/migrate-legacy-exercise-references.ts:268` | script (standing tool) | `member_exercise_recent_views` select | unpaged-read | 8 | b | paged (selectAllRows) |
| `scripts/measure-login-journey-live.mjs:152` | script (verification harness) | `consent_records` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/measure-login-journey-live.mjs:187` | script (verification harness) | `consent_records` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/measure-login-journey-live.mjs:204` | script (verification harness) | `consent_records` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/provision-admin-account.mjs:242` | script (standing tool) | `user_roles` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/provision-admin-account.mjs:283` | script (standing tool) | `analytics_member_scope` rpc | set-rpc-unbounded |  | b | paged (selectAllRows) |
| `scripts/provision-admin-account.mjs:291` | script (standing tool) | `coach_client_assignments` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/screenshots/verify-role-based-home-routing-live.mjs:173` | script (verification harness) | `user_roles` select | unpaged-read | 14 | b | paged (selectAllRows) |
| `scripts/screenshots/verify-signout-dialog-live.mjs:198` | script (verification harness) | `user_roles` select | unpaged-read | 14 | b | paged (selectAllRows) |
| `scripts/screenshots/verify-skipped-meals.mjs:110` | script (verification harness) | `member_daily_probe_selections` insert | unbatched-bulk-write |  | c | exempt: 7 rows, today's plan for one member (the six FIXED_CORE literal keys plus one rotating key) |
| `scripts/screenshots/verify-skipped-meals.mjs:352` | script (verification harness) | `daily_checkin_probe_answers` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `scripts/screenshots/verify-staff-chrome-and-signout-live.mjs:173` | script (verification harness) | `user_roles` select | unpaged-read | 14 | b | paged (selectAllRows) |
| `scripts/seed-production-test-accounts.mjs:287` | script (standing tool) | `daily_checkins` insert | unbatched-bulk-write |  | c | exempt: one row per seeded day, numDays is a MEMBER_CONFIGS constant (at most 40) |
| `scripts/seed-production-test-accounts.mjs:357` | script (standing tool) | `energy_forecasts` insert | unbatched-bulk-write |  | c | exempt: one row per scored day, forecastDays is a MEMBER_CONFIGS constant (at most 35) |
| `scripts/seed-production-test-accounts.mjs:361` | script (standing tool) | `root_energy_forecasts` insert | unbatched-bulk-write |  | c | exempt: one row per scored day, forecastDays is a MEMBER_CONFIGS constant (at most 35) |
| `scripts/trial-arc-rig.mjs:166` | script (verification harness) | `member_trial_arc_deliveries` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/trial-arc-rig.mjs:305` | script (verification harness) | `daily_checkins` insert | unbatched-bulk-write |  | b | chunked write (writeInChunks) |
| `scripts/trial-arc-rig.mjs:345` | script (verification harness) | `member_return_greetings` select | unpaged-read | 6 | b | paged (selectAllRows) |
| `scripts/trial-arc-rig.mjs:375` | script (verification harness) | `coach_client_assignments` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-acquisition-attribution-live.mjs:195` | script (verification harness) | `public_entry_links` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-acquisition-attribution-live.mjs:355` | script (verification harness) | `public_entry_attribution` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-acquisition-attribution-live.mjs:571` | script (verification harness) | `daily_checkins` select | unpaged-read | 46 | b | paged (selectAllRows) |
| `scripts/verify-acquisition-attribution-live.mjs:572` | script (verification harness) | `onboarding_submissions` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-acquisition-attribution-live.mjs:628` | script (verification harness) | `captured_leads` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-acquisition-attribution-live.mjs:640` | script (verification harness) | `public_entry_sessions` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-acquisition-attribution-live.mjs:652` | script (verification harness) | `public_entry_sessions` select | unbatched-list | 22 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-acquisition-report-live.mjs:136` | script (verification harness) | `captured_leads` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-acquisition-report-live.mjs:193` | script (verification harness) | `public_entry_funnel` select | unpaged-read | 22 | b | paged (selectAllRows) |
| `scripts/verify-acquisition-report-live.mjs:226` | script (verification harness) | `public_entry_sources` select | unpaged-read | 23 | b | paged (selectAllRows) |
| `scripts/verify-acquisition-report-live.mjs:530` | script (verification harness) | `public_entry_sessions` select | unbatched-list | 22 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-acquisition-report-live.mjs:545` | script (verification harness) | `acquisition_report_rows` select | unpaged-read | 32 | b | paged (selectAllRows) |
| `scripts/verify-admin-hidden-counts-live.mjs:48` | script (verification harness) | `profiles` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-analytics-live.mjs:125` | script (verification harness) | `profiles` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-analytics-live.mjs:130` | script (verification harness) | `user_roles` select | unpaged-read | 15 | b | paged (selectAllRows) |
| `scripts/verify-arrival-greeting-live.mts:94` | script (verification harness) | `consent_records` insert | unbatched-bulk-write |  | c | exempt: one row per entry of the CONSENT_ITEMS constant for one new account |
| `scripts/verify-arrival-greeting-live.mts:361` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-arrival-greeting-live.mts:404` | script (verification harness) | `public_entry_signup_refs` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-assessment-status-block-live.mjs:215` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `scripts/verify-assessment-status-block-live.mjs:220` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-assessment-status-block-live.mjs:482` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `scripts/verify-assessment-status-block-live.mjs:537` | script (verification harness) | `member_assignment_deliveries` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-assessment-status-block-live.mjs:541` | script (verification harness) | `assessment_assignments` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-assessment-status-block-live.mjs:546` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-assessment-status-block-live.mjs:552` | script (verification harness) | `member_root_popup_dismissals` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-assign-again-prod.mjs:113` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-assign-again-prod.mjs:123` | script (verification harness) | `member_breathing_check_in_sessions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-assign-flow-live.mjs:167` | script (verification harness) | `movement_program_versions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-assign-flow-live.mjs:180` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 27 | b | paged (selectAllRows) |
| `scripts/verify-assign-flow-live.mjs:186` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 27 | b | paged (selectAllRows) |
| `scripts/verify-assign-flow-live.mjs:193` | script (verification harness) | `exercise_catalog` select | unbatched-list | 861 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-assign-flow-live.mjs:249` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `scripts/verify-assign-flow-live.mjs:340` | script (verification harness) | `movement_program_versions` select | unpaged-read | 2 | c | exempt: the versions of the throwaway program this run just duplicated, which Duplicate creates with exactly one version (read as [0] below) |
| `scripts/verify-assign-flow-live.mjs:347` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 27 | b | paged (selectAllRows) |
| `scripts/verify-assign-flow-live.mjs:685` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-assign-flow-live.mjs:693` | script (verification harness) | `coach_assigned_workouts` select | unbatched-list | 44 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-assign-flow-live.mjs:701` | script (verification harness) | `coach_assigned_workout_exercises` select | unbatched-list | 29 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-assign-flow-live.mjs:710` | script (verification harness) | `coach_assigned_workout_exercises` select | unbatched-list | 29 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-assign-flow-live.mjs:720` | script (verification harness) | `coach_assigned_workouts` select | unbatched-list | 44 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-assign-flow-live.mjs:736` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-assign-flow-live.mjs:744` | script (verification harness) | `coach_program_assignments` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-assign-flow-live.mjs:749` | script (verification harness) | `coach_program_templates` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-assign-flow-live.mjs:755` | script (verification harness) | `movement_program_versions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-assign-flow-live.mjs:765` | script (verification harness) | `movement_program_versions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-assign-flow-live.mjs:778` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `scripts/verify-assign-flow-live.mjs:784` | script (verification harness) | `movement_programs` select | unpaged-read | 17 | b | paged (selectAllRows) |
| `scripts/verify-assign-flow-live.mjs:794` | script (verification harness) | `movement_program_versions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-assignment-receipts-live.mjs:101` | script (verification harness) | `assessment_assignments` select | unpaged-read | 3 | b | paged (selectAllRows) |
| `scripts/verify-being-seen-live.mjs:293` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-being-seen-live.mjs:306` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-being-seen-live.mjs:368` | script (verification harness) | `assessment_assignments` select | unpaged-read | 3 | b | paged (selectAllRows) |
| `scripts/verify-being-seen-live.mjs:676` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-being-seen-live.mjs:877` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-being-seen-live.mjs:925` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-being-seen-live.mjs:1137` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-being-seen-live.mjs:1148` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `scripts/verify-being-seen-live.mjs:1155` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 5 | b | paged (selectAllRows) |
| `scripts/verify-being-seen-live.mjs:1162` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 5 | b | paged (selectAllRows) |
| `scripts/verify-being-seen-live.mjs:1172` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-blueprints-live.mjs:170` | script (verification harness) | `movement_program_versions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-blueprints-live.mjs:180` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 27 | b | paged (selectAllRows) |
| `scripts/verify-blueprints-live.mjs:190` | script (verification harness) | `exercise_catalog` select | unbatched-list | 861 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-blueprints-live.mjs:226` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `scripts/verify-blueprints-live.mjs:333` | script (verification harness) | `coach_program_template_exercises` insert | unbatched-bulk-write |  | c | exempt: the slots of one block of one session of one blueprint version, kept whole so a section is all-or-nothing |
| `scripts/verify-blueprints-live.mjs:430` | script (verification harness) | `coach_assigned_workout_exercises` insert | unbatched-bulk-write |  | c | exempt: the slots of one block of one session of one blueprint version, kept whole so a section is all-or-nothing |
| `scripts/verify-blueprints-live.mjs:491` | script (verification harness) | `coach_assigned_workouts` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-blueprints-live.mjs:501` | script (verification harness) | `coach_assigned_workout_exercises` select | unpaged-read | 1 | c | exempt: one exercise of one workout this run just inserted, at most one row per blueprint slot of that session |
| `scripts/verify-blueprints-live.mjs:538` | script (verification harness) | `coach_program_assignments` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-blueprints-live.mjs:541` | script (verification harness) | `coach_program_templates` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-blueprints-live.mjs:544` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-blueprints-live.mjs:548` | script (verification harness) | `coach_program_templates` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-blueprints-live.mjs:552` | script (verification harness) | `coach_program_templates` select | unpaged-read | 6 | b | paged (selectAllRows) |
| `scripts/verify-body-systems-branch-labels.mjs:363` | script (verification harness) | `body_systems_copy` select | unpaged-read | 76 | c | exempt: copy_key is the unique key and the filter is a literal list of two keys, so at most two rows |
| `scripts/verify-body-systems-experience-live.mjs:70` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-body-systems-experience-live.mjs:156` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-body-systems-experience-live.mjs:453` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-body-systems-experience-live.mjs:454` | script (verification harness) | `assessment_assignments` select | unpaged-read | 3 | b | paged (selectAllRows) |
| `scripts/verify-body-systems-live.mjs:666` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-body-systems-live.mjs:681` | script (verification harness) | `assessment_attempts` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-body-systems-live.mjs:696` | script (verification harness) | `registry_entries` select | unpaged-read | 22 | b | paged (selectAllRows) |
| `scripts/verify-body-systems-live.mjs:898` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-body-systems-live.mjs:899` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-body-systems-live.mjs:904` | script (verification harness) | `registry_entries` select | unpaged-read | 22 | b | paged (selectAllRows) |
| `scripts/verify-coach-assessment-search-live.mjs:162` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `scripts/verify-coach-assessment-search-live.mjs:348` | script (verification harness) | `assessment_assignments` select | unpaged-read | 10 | b | paged (selectAllRows) |
| `scripts/verify-coach-assessment-search-live.mjs:407` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `scripts/verify-coach-assessment-search-live.mjs:413` | script (verification harness) | `member_assignment_deliveries` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-coach-assessment-search-live.mjs:414` | script (verification harness) | `assessment_assignments` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-coach-assign-only-shelf-prod.mjs:166` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-coach-assign-only-shelf-prod.mjs:183` | script (verification harness) | `<table>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-coach-member-view-live.mjs:64` | script (verification harness) | `coach_client_assignments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-coach-member-view-live.mjs:70` | script (verification harness) | `profiles` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-coach-member-view-live.mjs:75` | script (verification harness) | `daily_checkins` select | unbatched-list | 136 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-coach-member-view-live.mjs:81` | script (verification harness) | `daily_checkin_probe_answers` select | unbatched-list | 40 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-coach-member-view-live.mjs:87` | script (verification harness) | `intelligence_coach_alerts` select | unbatched-list | 145 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-coach-reassignment-live.mjs:75` | script (verification harness) | `member_whole_body_signal_sessions` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-coach-reassignment-live.mjs:81` | script (verification harness) | `member_whole_body_signal_question_actions` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-coach-reassignment-live.mjs:82` | script (verification harness) | `member_whole_body_signal_focus` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-coach-reassignment-live.mjs:201` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-coach-reassignment-live.mjs:396` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-coach-reassignment-live.mjs:806` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-coach-reassignment-live.mjs:814` | script (verification harness) | `member_root_popup_dismissals` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-coach-reassignment-live.mjs:832` | script (verification harness) | `member_whole_body_signal_sessions` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-coach-reassignment-live.mjs:833` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `scripts/verify-coach-reassignment-live.mjs:838` | script (verification harness) | `assessment_attempts` select | unpaged-read | 18 | b | paged (selectAllRows) |
| `scripts/verify-coach-reassignment-live.mjs:843` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 6 | b | paged (selectAllRows) |
| `scripts/verify-coach-sees-test-member-live.mjs:59` | script (verification harness) | `profiles` select | unpaged-read | 12 | c | exempt: primary-key lookup of a literal list of two ids, at most two rows |
| `scripts/verify-coach-sees-test-member-live.mjs:65` | script (verification harness) | `coach_client_assignments` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-coach-sees-test-member-live.mjs:216` | script (verification harness) | `analytics_member_scope` rpc | set-rpc-unbounded |  | b | paged (selectAllRows) |
| `scripts/verify-coach-sees-test-member-live.mjs:219` | script (verification harness) | `analytics_member_scope` rpc | set-rpc-unbounded |  | b | paged (selectAllRows) |
| `scripts/verify-coaching-brain-live.mjs:167` | script (verification harness) | `coach_assigned_workouts` select | unpaged-read | 44 | b | paged (selectAllRows) |
| `scripts/verify-coaching-brain-live.mjs:182` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | c | exempt: not paged on purpose, the .find below takes the first program group in this unordered read and a paging order would change which group is reviewed (one member's published assignments) |
| `scripts/verify-coaching-brain-live.mjs:195` | script (verification harness) | `coach_assigned_workouts` select | unbatched-list | 44 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-coaching-brain-live.mjs:202` | script (verification harness) | `coach_assigned_workout_exercises` select | unbatched-list | 386 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-coaching-brain-live.mjs:532` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-coaching-brain-live.mjs:586` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-coaching-brain-live.mjs:631` | script (verification harness) | `coach_assigned_workouts` select | unbatched-list | 44 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-coaching-brain-live.mjs:635` | script (verification harness) | `coach_assigned_workout_exercises` select | unbatched-list | 29 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-coaching-brain-live.mjs:651` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-coaching-brain-live.mjs:666` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-coaching-brain-live.mjs:680` | script (verification harness) | `member_exercise_avoidance` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-coaching-brain-live.mjs:709` | script (verification harness) | `member_exercise_avoidance` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-coaching-brain-live.mjs:723` | script (verification harness) | `member_exercise_feedback` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-coaching-brain-live.mjs:851` | script (verification harness) | `coach_program_assignments` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-coaching-brain-live.mjs:854` | script (verification harness) | `coach_program_templates` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-coaching-brain-live.mjs:857` | script (verification harness) | `program_phase_reviews` delete | unbatched-list |  | c | exempt: at most 2 ids, pushed once for the repeat review and once for the progress review this run made |
| `scripts/verify-coaching-brain-live.mjs:861` | script (verification harness) | `member_exercise_avoidance` delete | unbatched-list |  | c | exempt: at most 1 id, the one avoidance entry this run's pain report created |
| `scripts/verify-coaching-brain-live.mjs:864` | script (verification harness) | `member_exercise_feedback` delete | unbatched-list |  | c | exempt: at most 2 ids, the too-easy and pain feedback rows this run wrote |
| `scripts/verify-coaching-brain-live.mjs:929` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b | chunked by hand in ID_CHUNK_SIZE steps |
| `scripts/verify-completed-experiences-live.mjs:54` | script (verification harness) | `unified_assessment_definitions` select | unpaged-read | 5 | c | exempt: key is unique and KEYS is a constant list of three keys, so at most three rows |
| `scripts/verify-completed-experiences-live.mjs:59` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-daily-notification-decision-live.mjs:101` | script (verification harness) | `member_push_subscriptions` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-daily-notification-decision-live.mjs:492` | script (verification harness) | `member_push_subscriptions` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-duplicate-experiment-offers-live.mjs:100` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 5 | b | paged (selectAllRows) |
| `scripts/verify-duplicate-experiment-offers-live.mjs:181` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-duplicate-experiment-offers-live.mjs:243` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-duplicate-experiment-offers-live.mjs:261` | script (verification harness) | `lifestyle_experiments` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-explanations-live.mjs:179` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-explanations-live.mjs:185` | script (verification harness) | `coach_assigned_workout_exercises` select | unpaged-read | 386 | b | paged (selectAllRows) |
| `scripts/verify-explanations-live.mjs:194` | script (verification harness) | `exercise_catalog` select | unpaged-read | 861 | b | paged (selectAllRows) |
| `scripts/verify-explanations-live.mjs:201` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 415 | b | paged (selectAllRows) |
| `scripts/verify-explanations-live.mjs:204` | script (verification harness) | `exercise_catalog` select | unpaged-read | 861 | b | paged (selectAllRows) |
| `scripts/verify-explanations-live.mjs:227` | script (verification harness) | `coach_assigned_workout_exercises` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-explanations-live.mjs:239` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `scripts/verify-explanations-live.mjs:254` | script (verification harness) | `movement_program_versions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-explanations-live.mjs:383` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 27 | b | paged (selectAllRows) |
| `scripts/verify-explanations-live.mjs:614` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | c | exempt: createdAssignmentIds are the assignments this run inserted, one per session of the v2 blueprint (three, asserted above) |
| `scripts/verify-explanations-live.mjs:622` | script (verification harness) | `coach_assigned_workouts` select | unbatched-list | 44 | c | exempt: the week 1 workouts of the assignments this run inserted, one workout per assignment (three) |
| `scripts/verify-explanations-live.mjs:626` | script (verification harness) | `coach_assigned_workout_exercises` select | unbatched-list | 386 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-explanations-live.mjs:639` | script (verification harness) | `coach_assigned_workouts` select | unbatched-list | 44 | c | exempt: the ids are the three workouts this run inserted, one per assignment it created |
| `scripts/verify-explanations-live.mjs:645` | script (verification harness) | `member_program_lifecycle` select | unbatched-list | 0 | c | exempt: createdAssignmentIds are the assignments this run inserted, one per session of the v2 blueprint (three) |
| `scripts/verify-explanations-live.mjs:681` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `scripts/verify-explanations-live.mjs:707` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `scripts/verify-explanations-live.mjs:727` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | c | exempt: createdAssignmentIds are the assignments this run inserted, one per session of the v2 blueprint (three) |
| `scripts/verify-explanations-live.mjs:735` | script (verification harness) | `coach_program_assignments` delete | unbatched-list |  | c | exempt: createdAssignmentIds are the assignments this run inserted, one per session of the v2 blueprint (three) |
| `scripts/verify-explanations-live.mjs:739` | script (verification harness) | `coach_program_templates` delete | unbatched-list |  | c | exempt: createdTemplateIds are the templates this run inserted, one per session of the v2 blueprint (three) |
| `scripts/verify-explanations-live.mjs:742` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `scripts/verify-food-lens-macro-grams-live.mjs:116` | script (verification harness) | `member_food_log` select | unpaged-read | 37 | b | paged (selectAllRows) |
| `scripts/verify-food-lens-macro-grams-live.mjs:128` | script (verification harness) | `product_nutrients` select | unbatched-list | 17 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-food-lens-macro-grams-live.mjs:188` | script (verification harness) | `food_lens_item_macro_estimates` select | unpaged-read | 1 | c | exempt: one row per detected item of the single scan this run just created |
| `scripts/verify-food-lens-macro-grams-live.mjs:285` | script (verification harness) | `member_food_log` select | unpaged-read | 4 | c | exempt: the rows confirmed from the single scan this run just created, one per detected item |
| `scripts/verify-food-lens-macro-grams-live.mjs:353` | script (verification harness) | `member_food_log` select | unpaged-read | 4 | c | exempt: rows for the single unconfirmed scan this run just created (expected zero) |
| `scripts/verify-food-lens-macro-grams-live.mjs:374` | script (verification harness) | `member_food_log` delete | unbatched-list |  | c | exempt: ids this run inserted, the log rows of the one scan it confirmed |
| `scripts/verify-food-lens-macro-grams-live.mjs:377` | script (verification harness) | `member_food_log` delete | unbatched-list |  | c | exempt: createdScanIds holds only the two scans this run made (runScan is called twice) |
| `scripts/verify-food-lens-macro-grams-live.mjs:378` | script (verification harness) | `food_lens_scans` delete | unbatched-list |  | c | exempt: createdScanIds holds only the two scans this run made (runScan is called twice) |
| `scripts/verify-friction-armed-live.mjs:45` | script (verification harness) | `auth.users` listUsers | auth-list-unpaged |  | b | paged storage listing |
| `scripts/verify-friction-armed-live.mjs:52` | script (verification harness) | `registry_entries` select | unpaged-read | 136 | b | paged (selectAllRows) |
| `scripts/verify-friction-armed-live.mjs:64` | script (verification harness) | `profiles` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-friction-armed-live.mjs:186` | script (verification harness) | `member_coaching_decisions` select | unpaged-read | 31 | b | paged (selectAllRows) |
| `scripts/verify-friction-armed-live.mjs:202` | script (verification harness) | `member_coaching_decisions` select | unpaged-read | 31 | b | paged (selectAllRows) |
| `scripts/verify-friction-armed-live.mjs:258` | script (verification harness) | `member_coaching_threads` select | unpaged-read | 8 | b | paged (selectAllRows) |
| `scripts/verify-friction-armed-live.mjs:274` | script (verification harness) | `member_coaching_decisions` select | unpaged-read | 31 | b | paged (selectAllRows) |
| `scripts/verify-friction-question-live.mjs:169` | script (verification harness) | `member_coaching_decisions` select | unpaged-read | 31 | b | paged (selectAllRows) |
| `scripts/verify-friction-question-live.mjs:221` | script (verification harness) | `member_coaching_threads` select | unpaged-read | 8 | b | paged (selectAllRows) |
| `scripts/verify-fuel-pattern-experiment-live.mjs:580` | script (verification harness) | `fuel_experiment_checks` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-fuel-pattern-experiment-live.mjs:707` | script (verification harness) | `fuel_experiments` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-fuel-pattern-experiment-live.mjs:948` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-fuel-pattern-experiment-live.mjs:978` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-fuel-pattern-live.mjs:106` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | c | exempt: unique index unified_assessment_sessions_one_draft_per_definition allows one in_progress row per member_id+assessment_definition_id |
| `scripts/verify-fuel-pattern-live.mjs:433` | script (verification harness) | `fuel_pattern_results` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-fuel-pattern-live.mjs:469` | script (verification harness) | `fuel_pattern_results` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-fuel-pattern-live.mjs:497` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 6 | b | paged (selectAllRows) |
| `scripts/verify-fuel-pattern-live.mjs:519` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-fuel-pattern-meals-live.mjs:709` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-fuel-pattern-meals-live.mjs:737` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-fuel-pattern-results-live.mjs:448` | script (verification harness) | `fuel_pattern_results` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-fuel-pattern-results-live.mjs:645` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-fuel-pattern-results-live.mjs:661` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-guest-wellness-check-fence-live.mjs:343` | script (verification harness) | `guest_wellness_check_answers` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-guest-wellness-check-fence-live.mjs:425` | script (verification harness) | `daily_checkins` select | unpaged-read | 46 | b | paged (selectAllRows) |
| `scripts/verify-health-intake-live.mjs:113` | script (verification harness) | `safety_classifications` select | unpaged-read | 27 | b | paged (selectAllRows) |
| `scripts/verify-health-intake-live.mjs:120` | script (verification harness) | `safety_audit_log` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-health-intake-live.mjs:121` | script (verification harness) | `safety_review_queue` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-health-intake-live.mjs:122` | script (verification harness) | `safety_acknowledgments` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-health-intake-live.mjs:123` | script (verification harness) | `safety_classifications` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-health-intake-live.mjs:928` | script (verification harness) | `member_health_intake_sessions` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-hydration-focus-live.mjs:199` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-hydration-focus-live.mjs:210` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-hydration-focus-live.mjs:290` | script (verification harness) | `member_daily_probe_selections` select | unpaged-read | 10 | b | paged (selectAllRows) |
| `scripts/verify-intake-profiles-live.mjs:70` | script (verification harness) | `member_feature_visibility` select | unpaged-read | 62 | b | paged (selectAllRows) |
| `scripts/verify-intake-profiles-live.mjs:89` | script (verification harness) | `onboarding_answers` select | unpaged-read | 14 | b | paged (selectAllRows) |
| `scripts/verify-intake-profiles-live.mjs:93` | script (verification harness) | `onboarding_questions` select | unpaged-read | 169 | b | paged (selectAllRows) |
| `scripts/verify-language-pass-live.mjs:251` | script (verification harness) | `member_feature_visibility` select | unpaged-read | 62 | b | paged (selectAllRows) |
| `scripts/verify-load-rules-live.mjs:215` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `scripts/verify-load-rules-live.mjs:229` | script (verification harness) | `coach_assigned_workouts` select | unbatched-list | 44 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-load-rules-live.mjs:236` | script (verification harness) | `coach_assigned_workout_exercises` select | unbatched-list | 386 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-load-rules-live.mjs:282` | script (verification harness) | `coach_assigned_workouts` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-load-rules-live.mjs:605` | script (verification harness) | `program_phase_reviews` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-load-rules-live.mjs:611` | script (verification harness) | `member_exercise_feedback` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-member-program-presentation-live.mjs:162` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `scripts/verify-member-program-presentation-live.mjs:188` | script (verification harness) | `coach_program_assignments` update | unbatched-list |  | c | exempt: subject is the phases of ONE program group, and NOT IN cannot be split into chunks |
| `scripts/verify-member-program-presentation-live.mjs:356` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-member-voice-live.mjs:165` | script (verification harness) | `exercise_catalog` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-member-voice-live.mjs:178` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 415 | b | paged (selectAllRows) |
| `scripts/verify-member-voice-live.mjs:181` | script (verification harness) | `exercise_catalog` select | unpaged-read | 861 | b | paged (selectAllRows) |
| `scripts/verify-member-voice-live.mjs:193` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `scripts/verify-member-voice-live.mjs:201` | script (verification harness) | `coach_assigned_workouts` select | unbatched-list | 44 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-member-voice-live.mjs:208` | script (verification harness) | `coach_assigned_workout_exercises` select | unbatched-list | 306 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-member-voice-live.mjs:402` | script (verification harness) | `coach_assigned_workout_exercises` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-member-voice-live.mjs:429` | script (verification harness) | `coach_assigned_workout_exercises` select | unbatched-list | 386 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-member-voice-live.mjs:481` | script (verification harness) | `coach_assigned_workout_exercises` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-member-voice-live.mjs:503` | script (verification harness) | `mef_exercise_metadata` select | unpaged-read | 853 | b | paged (selectAllRows) |
| `scripts/verify-member-voice-live.mjs:621` | script (verification harness) | `member_exercise_feedback` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-member-voice-live.mjs:644` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 335 | b | paged (selectAllRows) |
| `scripts/verify-member-voice-live.mjs:732` | script (verification harness) | `member_exercise_feedback` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-member-voice-live.mjs:735` | script (verification harness) | `member_exercise_avoidance` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-membership-access-live.mjs:320` | script (verification harness) | `member_wellness_events` select | unpaged-read | 2443 | b | paged (selectAllRows) |
| `scripts/verify-membership-access-live.mjs:331` | script (verification harness) | `member_wellness_events` select | unpaged-read | 2443 | b | paged (selectAllRows) |
| `scripts/verify-naming-migration-live.mjs:148` | script (verification harness) | `unified_assessment_sections` select | unpaged-read | 16 | b | paged (selectAllRows) |
| `scripts/verify-naming-migration-live.mjs:175` | script (verification harness) | `unified_assessment_questions` select | unbatched-list | 120 | c | exempt: a head count over the sections of one assessment definition, which this script asserts is sixteen |
| `scripts/verify-naming-migration-live.mjs:188` | script (verification harness) | `registry_entries` select | unpaged-read | 136 | b | paged (selectAllRows) |
| `scripts/verify-naming-migration-live.mjs:259` | script (verification harness) | `registry_entries` select | unpaged-read | 138 | b | paged (selectAllRows) |
| `scripts/verify-owning-your-value-live.mjs:253` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-owning-your-value-live.mjs:381` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-owning-your-value-live.mjs:478` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-owning-your-value-live.mjs:533` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-popup-chain-and-events-live.mjs:52` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-popup-chain-drain-live.mjs:45` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-post-launch-fix-1-live.mts:569` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | c | exempt: unique (member_id, message_key) and free_arc_available keys are one per FREE_ARC_SEQUENCE entry (three), so at most three rows |
| `scripts/verify-post-launch-fix-1-live.mts:680` | script (verification harness) | `member_trial_arc_deliveries` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-post-launch-fix-1-live.mts:698` | script (verification harness) | `member_trial_arc_deliveries` select | unbatched-list | 3 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-post-launch-fix-3-live.mjs:226` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-program-hero-live.mjs:163` | script (verification harness) | `coach_program_assignments` update | unbatched-list |  | c | exempt: created.assignmentIds holds the one assignment this run inserted |
| `scripts/verify-program-hero-live.mjs:175` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `scripts/verify-program-hero-live.mjs:179` | script (verification harness) | `coach_assigned_workouts` select | unpaged-read | 34 | b | paged (selectAllRows) |
| `scripts/verify-program-hero-live.mjs:183` | script (verification harness) | `member_wellness_events` select | unpaged-read | 2443 | b | paged (selectAllRows) |
| `scripts/verify-program-hero-live.mjs:338` | script (verification harness) | `member_wellness_events` select | unbatched-list | 2443 | c | exempt: events for the one assignment this run inserted (created.assignmentIds), expected exactly one |
| `scripts/verify-program-hero-live.mjs:362` | script (verification harness) | `member_wellness_events` select | unbatched-list | 2443 | c | exempt: events for the one assignment this run inserted (created.assignmentIds), expected exactly one |
| `scripts/verify-program-hero-live.mjs:468` | script (verification harness) | `member_wellness_events` delete | unbatched-list |  | c | exempt: created.assignmentIds holds the one assignment this run inserted |
| `scripts/verify-program-hero-live.mjs:474` | script (verification harness) | `coach_assigned_workouts` delete | unbatched-list |  | c | exempt: created.workoutIds holds the two sessions this run inserted |
| `scripts/verify-program-hero-live.mjs:477` | script (verification harness) | `coach_program_assignments` delete | unbatched-list |  | c | exempt: created.assignmentIds holds the one assignment this run inserted |
| `scripts/verify-program-hero-live.mjs:480` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `scripts/verify-program-hero-live.mjs:484` | script (verification harness) | `coach_assigned_workouts` select | unpaged-read | 34 | b | paged (selectAllRows) |
| `scripts/verify-program-hero-live.mjs:488` | script (verification harness) | `member_wellness_events` select | unpaged-read | 2443 | b | paged (selectAllRows) |
| `scripts/verify-program-library-live.mjs:157` | script (verification harness) | `movement_programs` select | unpaged-read | 17 | b | paged (selectAllRows) |
| `scripts/verify-program-library-live.mjs:158` | script (verification harness) | `movement_program_versions` select | unpaged-read | 18 | b | paged (selectAllRows) |
| `scripts/verify-program-library-live.mjs:218` | script (verification harness) | `program_blueprint_slots` select | unpaged-read | 27 | b | paged (selectAllRows) |
| `scripts/verify-program-lifecycle-live.mjs:117` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `scripts/verify-program-lifecycle-live.mjs:161` | script (verification harness) | `coach_program_assignments` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-program-lifecycle-live.mjs:240` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-program-lifecycle-live.mjs:293` | script (verification harness) | `coach_program_assignments` select | unpaged-read | 9 | b | paged (selectAllRows) |
| `scripts/verify-program-lifecycle-live.mjs:301` | script (verification harness) | `coach_program_assignments` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-program-lifecycle-live.mjs:315` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-program-lifecycle-live.mjs:320` | script (verification harness) | `coach_program_assignments` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-program-lifecycle-live.mjs:325` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-program-lifecycle-live.mjs:443` | script (verification harness) | `coach_program_assignments` select | unbatched-list | 12 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-public-entry-continuation-live.mjs:174` | script (verification harness) | `daily_checkins` select | unpaged-read | 46 | b | paged (selectAllRows) |
| `scripts/verify-public-entry-continuation-live.mjs:178` | script (verification harness) | `onboarding_submissions` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-push-notifications-live.mjs:105` | script (verification harness) | `member_push_subscriptions` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-push-notifications-live.mjs:493` | script (verification harness) | `member_push_subscriptions` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-questionnaire-experience-live.mjs:101` | script (verification harness) | `wellness_assessments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-questionnaire-experience-live.mjs:122` | script (verification harness) | `investigation_router_decisions` select | unpaged-read | 114 | b | paged (selectAllRows) |
| `scripts/verify-questionnaire-experience-live.mjs:130` | script (verification harness) | `investigation_router_decisions` select | unpaged-read | 114 | b | paged (selectAllRows) |
| `scripts/verify-questionnaire-experience-live.mjs:188` | script (verification harness) | `wellness_assessments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-questionnaire-experience-live.mjs:194` | script (verification harness) | `wellness_assessment_answers` select | unbatched-list | 392 | b | chunked by hand in ID_CHUNK_SIZE steps |
| `scripts/verify-questionnaire-experience-live.mjs:540` | script (verification harness) | `wellness_assessments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-questionnaire-polish-live.mjs:104` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-questionnaire-polish-live.mjs:105` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `scripts/verify-questionnaire-polish-live.mjs:106` | script (verification harness) | `registry_entries` select | unpaged-read | 22 | b | paged (selectAllRows) |
| `scripts/verify-questionnaire-polish-live.mjs:111` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-questionnaire-polish-live.mjs:137` | script (verification harness) | `member_body_systems_sessions` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-questionnaire-polish-live.mjs:138` | script (verification harness) | `registry_entries` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-questionnaire-polish-live.mjs:140` | script (verification harness) | `assessment_attempts` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-questionnaire-polish-live.mjs:141` | script (verification harness) | `assessment_assignments` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-questionnaire-root-live.ts:411` | script (verification harness) | `cross_system_root_findings` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-questionnaire-root-live.ts:526` | script (verification harness) | `cross_system_signals` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-questionnaire-root-live.ts:566` | script (verification harness) | `cross_system_signals` select | unpaged-read | 5 | b | paged (selectAllRows) |
| `scripts/verify-quiz-signup-link-live.mts:312` | script (verification harness) | `public_entry_signup_refs` select | unpaged-read | 1 | c | exempt: references for the single arrival this run just finished, expected exactly one |
| `scripts/verify-quiz-signup-link-live.mts:560` | script (verification harness) | `public_entry_sessions` select | unpaged-read | 22 | b | paged (selectAllRows) |
| `scripts/verify-quiz-signup-link-live.mts:578` | script (verification harness) | `public_entry_sessions` select | unpaged-read | 22 | b | paged (selectAllRows) |
| `scripts/verify-quiz-signup-link-live.mts:594` | script (verification harness) | `public_entry_signup_refs` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-recovery-running-behind-coach-card.mjs:78` | script (verification harness) | `member_stress_load_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-recovery-running-behind-live.mjs:98` | script (verification harness) | `member_stress_load_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-recovery-running-behind-live.mjs:129` | script (verification harness) | `coach_client_assignments` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-recovery-running-behind-live.mjs:182` | script (verification harness) | `assessment_assignments` select | unpaged-read | 3 | b | paged (selectAllRows) |
| `scripts/verify-recovery-running-behind-live.mjs:265` | script (verification harness) | `member_stress_load_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-recovery-running-behind-live.mjs:330` | script (verification harness) | `registry_entries` select | unpaged-read | 22 | b | paged (selectAllRows) |
| `scripts/verify-relationship-library-live.mjs:124` | script (verification harness) | `cross_system_relationships` select | unpaged-read | 240 | b | paged (selectAllRows) |
| `scripts/verify-relationship-library-live.mjs:135` | script (verification harness) | `cross_system_relationship_versions` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-relationship-library-live.mjs:150` | script (verification harness) | `cross_system_signal_names` select | unpaged-read | 211 | b | paged (selectAllRows) |
| `scripts/verify-relationship-library-live.mjs:243` | script (verification harness) | `cross_system_relationships` select | unpaged-read | 239 | b | paged (selectAllRows) |
| `scripts/verify-relationship-library-live.mjs:263` | script (verification harness) | `cross_system_relationship_components` select | unpaged-read | 13 | b | paged (selectAllRows) |
| `scripts/verify-relationship-library-live.mjs:292` | script (verification harness) | `cross_system_relationship_versions` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-relationship-library-live.mjs:372` | script (verification harness) | `cross_system_relationships` select | unpaged-read | 240 | b | paged (selectAllRows) |
| `scripts/verify-relationship-library-live.mjs:373` | script (verification harness) | `cross_system_relationship_versions` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-render-writes-prefetch-live.mjs:57` | script (verification harness) | `member_pattern_states` select | unpaged-read | 51 | b | paged (selectAllRows) |
| `scripts/verify-root-expansion-live.mjs:414` | script (verification harness) | `cross_system_complaint_classifications` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-root-expansion-live.mjs:423` | script (verification harness) | `cross_system_signals` select | unpaged-read | 117 | b | paged (selectAllRows) |
| `scripts/verify-root-expansion-live.mjs:432` | script (verification harness) | `cross_system_root_findings` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-root-expansion-live.mjs:471` | script (verification harness) | `cross_system_relationships` select | unpaged-read | 239 | b | paged (selectAllRows) |
| `scripts/verify-root-expansion-live.mjs:481` | script (verification harness) | `cross_system_relationship_versions` select | unbatched-list | 240 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-root-expansion-live.mjs:517` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-root-expansion-live.mjs:548` | script (verification harness) | `daily_checkins` select | unpaged-read | 25 | b | paged (selectAllRows) |
| `scripts/verify-root-expansion-live.mjs:562` | script (verification harness) | `cross_system_complaint_reports` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-root-expansion-live.mjs:795` | script (verification harness) | `cross_system_root_findings` select | unbatched-list | 0 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-root-expansion-live.mjs:878` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-root-expansion-live.mjs:1088` | script (verification harness) | `cross_system_root_findings` select | unbatched-list | 0 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-root-expansion-live.mjs:1143` | script (verification harness) | `cross_system_complaint_reports` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-root-expansion-live.mjs:1156` | script (verification harness) | `daily_checkins` select | unpaged-read | 25 | b | paged (selectAllRows) |
| `scripts/verify-root-noticed-live.mjs:287` | script (verification harness) | `cross_system_relationships` select | unpaged-read | 239 | b | paged (selectAllRows) |
| `scripts/verify-root-noticed-live.mjs:297` | script (verification harness) | `cross_system_relationship_versions` select | unbatched-list | 240 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-root-noticed-live.mjs:329` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-root-noticed-live.mjs:414` | script (verification harness) | `cross_system_complaint_classifications` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-root-noticed-live.mjs:443` | script (verification harness) | `cross_system_signals` select | unpaged-read | 108 | b | paged (selectAllRows) |
| `scripts/verify-root-noticed-live.mjs:465` | script (verification harness) | `cross_system_root_findings` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-root-noticed-live.mjs:477` | script (verification harness) | `cross_system_relationships` select | unbatched-list | 240 | b | chunked read (selectAllRowsInChunks) |
| `scripts/verify-root-noticed-live.mjs:785` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-root-noticed-live.mjs:840` | script (verification harness) | `cross_system_complaint_reports` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-root-noticed-live.mjs:845` | script (verification harness) | `cross_system_signals` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-staff-assign-roundtrip.mjs:72` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `scripts/verify-staff-assign-roundtrip.mjs:97` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `scripts/verify-stress-load-live.mjs:159` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-stress-load-live.mjs:314` | script (verification harness) | `member_stress_load_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-stress-load-live.mjs:327` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-stress-load-live.mjs:353` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-stress-load-live.mjs:383` | script (verification harness) | `registry_entries` select | unpaged-read | 22 | b | paged (selectAllRows) |
| `scripts/verify-the-giving-ledger-live.mjs:205` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-the-giving-ledger-live.mjs:339` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-the-giving-ledger-live.mjs:471` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-the-giving-ledger-live.mjs:570` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-the-giving-ledger-live.mjs:627` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-the-life-youre-building-live.mjs:291` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-the-life-youre-building-live.mjs:304` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-the-life-youre-building-live.mjs:628` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-the-life-youre-building-live.mjs:869` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-the-life-youre-building-live.mjs:940` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-the-life-youre-building-live.mjs:1038` | script (verification harness) | `assessment_assignments` select | unpaged-read | 3 | b | paged (selectAllRows) |
| `scripts/verify-the-life-youre-building-live.mjs:1211` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-the-life-youre-building-live.mjs:1223` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-the-life-youre-building-live.mjs:1344` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 5 | b | paged (selectAllRows) |
| `scripts/verify-the-life-youre-building-live.mjs:1354` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-the-life-youre-building-live.mjs:1456` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-the-life-youre-building-live.mjs:1467` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-the-life-youre-building-live.mjs:1477` | script (verification harness) | `assessment_attempts` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-the-life-youre-building-live.mjs:1487` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-the-life-youre-building-live.mjs:1498` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 5 | b | paged (selectAllRows) |
| `scripts/verify-the-weight-of-yes-live.mjs:178` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-the-weight-of-yes-live.mjs:240` | script (verification harness) | `assessment_assignments` select | unpaged-read | 3 | b | paged (selectAllRows) |
| `scripts/verify-the-weight-of-yes-live.mjs:290` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-the-weight-of-yes-live.mjs:488` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-the-weight-of-yes-live.mjs:586` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-the-weight-of-yes-live.mjs:631` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-the-weight-of-yes-live.mjs:688` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-the-weight-of-yes-live.mjs:856` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-the-weight-of-yes-live.mjs:902` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-the-weight-of-yes-live.mjs:910` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `scripts/verify-the-weight-of-yes-live.mjs:917` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 5 | b | paged (selectAllRows) |
| `scripts/verify-the-weight-of-yes-live.mjs:924` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-the-weight-of-yes-live.mjs:935` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-this-week-band-live.mjs:129` | script (verification harness) | `<table>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-this-week-band-live.mjs:172` | script (verification harness) | `daily_checkins_current` select | unpaged-read | 45 | b | paged (selectAllRows) |
| `scripts/verify-this-week-band-live.mjs:182` | script (verification harness) | `coach_assigned_workouts` select | unpaged-read | 34 | b | paged (selectAllRows) |
| `scripts/verify-this-week-band-live.mjs:293` | script (verification harness) | `assessment_assignments` select | unpaged-read | 11 | b | paged (selectAllRows) |
| `scripts/verify-this-week-band-live.mjs:320` | script (verification harness) | `intelligence_coach_alerts` select | unpaged-read | 108 | b | paged (selectAllRows) |
| `scripts/verify-this-week-band-live.mjs:367` | script (verification harness) | `daily_checkins` select | unpaged-read | 25 | b | paged (selectAllRows) |
| `scripts/verify-this-week-band-live.mjs:421` | script (verification harness) | `daily_checkins_current` select | unpaged-read | 45 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-day6-live.mts:319` | script (verification harness) | `unified_assessment_questions` select | unpaged-read | 64 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-day6-live.mts:327` | script (verification harness) | `unified_assessment_answers` select | unpaged-read | 24 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-day6-live.mts:443` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-day6-live.mts:465` | script (verification harness) | `unified_assessment_sessions` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-trial-arc-day6-live.mts:488` | script (verification harness) | `unified_assessment_sessions` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-trial-arc-day6-live.mts:695` | script (verification harness) | `member_pattern_states` select | unpaged-read | 51 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-day6-live.mts:964` | script (verification harness) | `profiles` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-day6-live.mts:981` | script (verification harness) | `member_trial_arc_recaps` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-day7-live.mts:320` | script (verification harness) | `unified_assessment_questions` select | unpaged-read | 64 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-day7-live.mts:328` | script (verification harness) | `unified_assessment_answers` select | unpaged-read | 24 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-day7-live.mts:439` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-day7-live.mts:453` | script (verification harness) | `unified_assessment_sessions` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-trial-arc-day7-live.mts:1135` | script (verification harness) | `profiles` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-day7-live.mts:1152` | script (verification harness) | `member_trial_arc_closes` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-day7-live.mts:1156` | script (verification harness) | `member_trial_arc_recaps` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-drive-live.mts:427` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-drive-live.mts:450` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-drive-live.mts:489` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-drive-live.mts:553` | script (verification harness) | `assessment_attempts` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-drive-live.mts:573` | script (verification harness) | `assessment_attempts` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-trial-arc-drive-live.mts:578` | script (verification harness) | `unified_assessment_sessions` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-trial-arc-drive-live.mts:592` | script (verification harness) | `unified_assessment_sessions` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-trial-arc-drive-live.mts:634` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-drive-live.mts:712` | script (verification harness) | `member_return_greetings` select | unpaged-read | 6 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-drive-live.mts:754` | script (verification harness) | `profiles` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-drive-live.mts:763` | script (verification harness) | `coach_client_assignments` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-drive-live.mts:814` | script (verification harness) | `member_trial_arc_deliveries` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-drive-live.mts:856` | script (verification harness) | `unified_assessment_sessions` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-drive-live.mts:864` | script (verification harness) | `assessment_attempts` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-drive-live.mts:874` | script (verification harness) | `unified_assessment_sessions` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-trial-arc-drive-live.mts:877` | script (verification harness) | `assessment_attempts` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-trial-arc-drive-live.mts:893` | script (verification harness) | `unified_assessment_sessions` update | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-trial-arc-drive-live.mts:1032` | script (verification harness) | `profiles` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-launch-live.mts:69` | script (verification harness) | `profiles` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-launched-live.mts:236` | script (verification harness) | `member_trial_arc_deliveries` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-launched-live.mts:944` | script (verification harness) | `member_subscriptions` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-launched-live.mts:1200` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-launched-live.mts:1212` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-launched-live.mts:1234` | script (verification harness) | `profiles` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-launched-live.mts:1258` | script (verification harness) | `<table>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-launched-live.mts:1264` | script (verification harness) | `member_subscriptions` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-launched-live.mts:1345` | script (verification harness) | `profiles` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-live.mts:45` | script (verification harness) | `profiles` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-pacing-live.mts:60` | script (verification harness) | `profiles` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-trial-arc-pacing-live.mts:106` | script (verification harness) | `member_subscriptions` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-trial-ended-day8-live.mts:146` | script (verification harness) | `public_entry_events` select | unpaged-read | 46 | b | paged (selectAllRows) |
| `scripts/verify-trial-ended-day8-live.mts:574` | script (verification harness) | `public_entry_sessions` select | unpaged-read | 22 | b | paged (selectAllRows) |
| `scripts/verify-trial-ended-day8-live.mts:589` | script (verification harness) | `member_public_entry_origin` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-trial-ended-day8-live.mts:688` | script (verification harness) | `coach_client_assignments` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-trial-ended-day8-live.mts:1122` | script (verification harness) | `coach_client_assignments` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-trial-ended-day8-live.mts:1129` | script (verification harness) | `user_roles` select | unpaged-read | 3 | b | paged (selectAllRows) |
| `scripts/verify-trial-ended-day8-live.mts:1199` | script (verification harness) | `coach_client_assignments` select | unpaged-read | 1 | b | paged (selectAllRows) |
| `scripts/verify-trial-ended-day8-live.mts:1302` | script (verification harness) | `member_trial_arc_deliveries` select | unpaged-read | 3 | b | paged (selectAllRows) |
| `scripts/verify-trial-ended-day8-live.mts:1308` | script (verification harness) | `member_trial_arc_recaps` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-trial-ended-day8-live.mts:1309` | script (verification harness) | `member_trial_arc_closes` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-trial-ended-day8-live.mts:1331` | script (verification harness) | `public_entry_sessions` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-trial-ended-day8-live.mts:1333` | script (verification harness) | `public_entry_sessions` select | unpaged-read | 22 | b | paged (selectAllRows) |
| `scripts/verify-trial-ended-day8-live.mts:1338` | script (verification harness) | `public_entry_sessions` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-trial-lock-screen-live.mjs:43` | script (verification harness) | `member_subscriptions` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-trial-seven-days-live.mjs:63` | script (verification harness) | `member_subscriptions` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-visibility-migrations-live.mjs:83` | script (verification harness) | `member_feature_visibility` select | unpaged-read | 401 | b | paged (selectAllRows) |
| `scripts/verify-visibility-migrations-live.mjs:145` | script (verification harness) | `daily_checkins` select | unpaged-read | 136 | b | paged (selectAllRows) |
| `scripts/verify-visibility-migrations-live.mjs:146` | script (verification harness) | `assessment_attempts` select | unpaged-read | 53 | b | paged (selectAllRows) |
| `scripts/verify-visibility-migrations-live.mjs:147` | script (verification harness) | `onboarding_submissions` select | unpaged-read | 10 | b | paged (selectAllRows) |
| `scripts/verify-visibility-migrations-live.mjs:173` | script (verification harness) | `profiles` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-visibility-migrations-live.mjs:207` | script (verification harness) | `assessment_attempts` select | unpaged-read | 53 | b | paged (selectAllRows) |
| `scripts/verify-visibility-migrations-live.mjs:210` | script (verification harness) | `assessment_definitions` select | unpaged-read | 26 | b | paged (selectAllRows) |
| `scripts/verify-visibility-migrations-live.mjs:250` | script (verification harness) | `profiles` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-weekly-reflection-assign-live.mjs:131` | script (verification harness) | `<table>` select | unpaged-read |  | c | exempt: every table read here is unique on (member_id, week_start) and both are filtered, so at most one row |
| `scripts/verify-weekly-reflection-assign-live.mjs:246` | script (verification harness) | `<table>` insert | unbatched-bulk-write |  | c | exempt: rows is the rowsFor stash of one (member_id, week_start), unique on each of these tables, so at most one row |
| `scripts/verify-what-you-put-down-live.mjs:178` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-what-you-put-down-live.mjs:191` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-what-you-put-down-live.mjs:413` | script (verification harness) | `assessment_assignments` select | unpaged-read | 3 | b | paged (selectAllRows) |
| `scripts/verify-what-you-put-down-live.mjs:671` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-what-you-put-down-live.mjs:893` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-what-you-put-down-live.mjs:961` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-what-you-put-down-live.mjs:1214` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-what-you-put-down-live.mjs:1225` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-what-you-put-down-live.mjs:1232` | script (verification harness) | `assessment_attempts` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-what-you-put-down-live.mjs:1239` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-what-you-put-down-live.mjs:1246` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-where-your-joy-lives-live.mjs:272` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-where-your-joy-lives-live.mjs:401` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-where-your-joy-lives-live.mjs:506` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-where-your-joy-lives-live.mjs:557` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-patterns-live.mjs:195` | script (verification harness) | `cross_system_signals` select | unpaged-read | 118 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-patterns-live.mjs:201` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-patterns-live.mjs:212` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-patterns-live.mjs:233` | script (verification harness) | `cross_system_pattern_matches` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-patterns-live.mjs:277` | script (verification harness) | `cross_system_relationships` select | unpaged-read | 240 | c | exempt: NOT a size bound. created.data[0] is taken, unordered, as the row this run created; paging would impose an order and change which row that is (240 rows today, under the cap) |
| `scripts/verify-whole-body-patterns-live.mjs:290` | script (verification harness) | `cross_system_relationship_components` select | unpaged-read | 2511 | a | paged (selectAllRows) |
| `scripts/verify-whole-body-patterns-live.mjs:498` | script (verification harness) | `cross_system_pattern_matches` select | unpaged-read | 0 | c | exempt: NOT a size bound. ledger.data[0] is taken, unordered, as the match for this run's pattern; paging would impose an order and change which row that is (one row per matched relationship for the member) |
| `scripts/verify-whole-body-patterns-live.mjs:514` | script (verification harness) | `cross_system_pattern_match_signals` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-patterns-live.mjs:548` | script (verification harness) | `cross_system_pattern_matches` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-patterns-live.mjs:575` | script (verification harness) | `<table>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-whole-body-patterns-live.mjs:576` | script (verification harness) | `<table>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-whole-body-patterns-live.mjs:660` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-patterns-live.mjs:698` | script (verification harness) | `cross_system_relationships` select | unpaged-read | 240 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-patterns-live.mjs:701` | script (verification harness) | `cross_system_signals` select | unpaged-read | 118 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-patterns-live.mjs:706` | script (verification harness) | `cross_system_pattern_matches` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-patterns-live.mjs:726` | script (verification harness) | `member_body_systems_sessions` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-signal-live.mjs:80` | script (verification harness) | `member_whole_body_signal_sessions` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-signal-live.mjs:86` | script (verification harness) | `member_whole_body_signal_question_actions` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-whole-body-signal-live.mjs:87` | script (verification harness) | `member_whole_body_signal_focus` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-whole-body-signal-live.mjs:150` | script (verification harness) | `whole_body_signal_copy` select | unpaged-read | 60 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-signal-live.mjs:167` | script (verification harness) | `whole_body_signal_questions` select | unpaged-read | 96 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-signal-live.mjs:433` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-signal-live.mjs:890` | script (verification harness) | `whole_body_signal_questions` select | unpaged-read | 12 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-signal-live.mjs:1082` | script (verification harness) | `member_whole_body_signal_question_actions` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-signal-live.mjs:1096` | script (verification harness) | `member_whole_body_signal_question_actions` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-signal-live.mjs:1106` | script (verification harness) | `member_whole_body_signal_question_actions` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-signal-live.mjs:1119` | script (verification harness) | `member_whole_body_signal_question_actions` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-signal-live.mjs:1311` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-signal-live.mjs:1319` | script (verification harness) | `member_root_popup_dismissals` delete | unbatched-list |  | b | chunked write (writeInChunks) |
| `scripts/verify-whole-body-signal-live.mjs:1337` | script (verification harness) | `member_whole_body_signal_sessions` select | unpaged-read | 0 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-signal-live.mjs:1338` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-whole-body-signal-live.mjs:1343` | script (verification harness) | `assessment_attempts` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-your-own-company-live.mjs:212` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-your-own-company-live.mjs:225` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-your-own-company-live.mjs:404` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 5 | b | paged (selectAllRows) |
| `scripts/verify-your-own-company-live.mjs:465` | script (verification harness) | `assessment_assignments` select | unpaged-read | 3 | b | paged (selectAllRows) |
| `scripts/verify-your-own-company-live.mjs:717` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-your-own-company-live.mjs:979` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-your-own-company-live.mjs:1044` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 2 | b | paged (selectAllRows) |
| `scripts/verify-your-own-company-live.mjs:1308` | script (verification harness) | `<TABLE>` select | unpaged-read |  | b | paged (selectAllRows) |
| `scripts/verify-your-own-company-live.mjs:1319` | script (verification harness) | `assessment_assignments` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-your-own-company-live.mjs:1326` | script (verification harness) | `assessment_attempts` select | unpaged-read | 4 | b | paged (selectAllRows) |
| `scripts/verify-your-own-company-live.mjs:1333` | script (verification harness) | `lifestyle_experiments` select | unpaged-read | 5 | b | paged (selectAllRows) |
| `scripts/verify-your-own-company-live.mjs:1343` | script (verification harness) | `member_root_popup_dismissals` select | unpaged-read | 29 | b | paged (selectAllRows) |

## Live verification (app.mefwellness.com, 2026-09-17)

Deployment: Vercel project mef-platform, Production, commit e87c101 on
MEFwellness/mef-platform main, confirmed as the deployment
app.mefwellness.com serves through the Vercel API. Method: one-time sessions
minted for the standing staff account (coach and administrator) and the test
member, retired afterwards; every number read off the real screen and
compared with the database counted independently with the service role.
`scripts/verify-data-scale-live.ts`, one end-to-end run: **20 of 20 passed.**

| check | on screen | database |
| --- | --- | --- |
| Exercise library total | 861 | 861 rows |
| Exercise library, category "core" (largest filter): total | 120 | 120 rows |
| Exercise library, "core": cards reachable with Load more | 120 | 120 rows |
| Relationship Library | 240 of 240 patterns | 240 entries |
| Relationship Library, every entry's primary / related / supporting counts | 240 rows, 0 mismatches | 2,511 components |
| Broad musculoskeletal entry opened in the editor ("Musculoskeletal findings, body areas worth reviewing in return") | 1 primary, 10 related, 1 supporting | same |
| Coach question bank | 87 active questions | 87 active of 88 |
| Admin Users, test accounts hidden / shown | 10 shown, 2 hidden / 12 shown | 12 profiles, 2 test |
| Assignment history, test accounts hidden / shown | 1 shown, 1 hidden / 2 shown | 2 pairings, 1 with a test account |
| Test-account toggle | present both ways | |
| Test member's Signals list (coach view) | 62 signals, 176 entries | 62 distinct, 176 rows |
| Her check-in History (designed to show the latest 30) | 11 rows | 11 rows |
| Her Health Timeline (designed to show the latest 200) | 27 check-ins + 12 milestones | 39 rows |
| Admin analytics member timeline, 30 and 90 days | 1,872 actions on 19 days, truncation notice shown | cap rule applied to 2,111 / 3,241 events gives 1,872 on 19 days |
| Coach-only phrases in her 181 response bodies over 8 routes | 0 | |
| Console errors on her 8 screens | 0 | |

**What the analytics timeline showed before this build**, measured against
her events as of the start of the run: 1,000 actions on 10 days (from
2026-09-08) in BOTH the 30 and 90 day views, with no truncation notice. The
truth was 2,103 actions on 24 days (30 days) and 3,233 actions on 31 days
(90 days). It now shows the most recent 2,000 actions less the day that cap
falls inside, and says that older days are left out.

**Two check bugs were found and fixed on the way, neither in the app:** the
first run read the Relationship Library rows with `textContent`, which runs a
date into the count ("2026" + "2 primary"), and counted exercise cards inside
`<main>`, where the cards are not, before the debounced search had settled.

**Cleanup.** The test member's rows were snapshotted before the run
(89 tables, 7,629 rows). Another session was live-testing the Root briefing
on the same member at the same time, so cleanup was split by time: this run
deleted its own 20 rows written before 13:35:11Z (7 page-view events, 9
rotating probe selections, 3 profile snapshots, 1 coaching insight), and that
session's restore removes every row created after it, including this run's
later page views.

**Final recount (read only, independent of either cleanup):** every table
holding a row for the test member or the staff account matches the
13:27:20Z snapshot row for row in count, and no session minted by the run
is still open. She is back at her starting state.
