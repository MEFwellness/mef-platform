-- ============================================================================
-- The MEF program library: sixteen named programs, authored as data.
--
-- Migration 174 built the authored side of the named-program pipeline and
-- seeded one blueprint to prove it. Migration 175 revised that blueprint
-- after coach review and wrote down the shape a MEF program has. This
-- migration is the library itself: sixteen programs across three
-- collections, every one of them authored against the same rules the
-- reviewed blueprint established, and every one of them a DRAFT.
--
-- THEY ARE SEEDED AS DRAFTS ON PURPOSE, even though the coach has asked in
-- writing for them to be approved. Approval is an ACT, not a column: it is
-- attributable to a named administrator at a known moment, and migration
-- 174's own constraint says so (status <> 'approved' or approved_at and
-- approved_by are both set). A migration has no administrator to attribute
-- it to, and inventing one would make the approval record a lie in every
-- environment the migration ever runs in, including a fresh local database
-- nobody has ever reviewed anything in. So the content lands here and the
-- approval is performed afterwards through the real path, on production, by
-- a real administrator account: /admin/blueprints, Approve this version,
-- which is approveBlueprintVersionAction and nothing else.
--
-- ============================================================================
-- WHAT A MEF PROGRAM IS, encoded and then asserted at the bottom of this
-- file. Every rule here is the coach's, and every one of them is checked
-- for all sixteen programs rather than trusted.
-- ============================================================================
--
--   1. THE SESSION SHAPE. A tight opener of at most three preparation,
--      mobility and activation movements, then strength as the clear
--      majority of the work, then core. Ranks 1 to 5 in every session
--      belong to strength and core, so a shortened session drops the
--      opener first and never the lift.
--
--   2. VIDEO-BACKED ONLY. Every filled slot points at a client-assignable
--      exercise (migration 170). Asserted for all 365 slots.
--
--   3. STAGE LOGIC. Single-leg work is STATIONARY wherever a beginner
--      stage population is being written for: Staggered squats, Bodyweight
--      Split Squat, Split Squat and Step-Ups, never a jumping or switching
--      lunge. Single-arm rows appear only in the intermediate-stage
--      programs; the four gentlest programs pull with a band, a chair or
--      the floor instead. Nothing in this migration uses Side Plank, a
--      Bulgarian split squat, a pistol squat or a bent-over two-dumbbell
--      row, at any stage, and that is asserted by name.
--
--   4. PER SIDE IS SAID BY THE SLOT. Every unilateral slot sets
--      is_per_side (migration 175). The exercise NAME never carries a side
--      marker, which is what migrations 182 and 183 cleaned out of the
--      catalog, and the slot names asserted below are checked against the
--      same plumbing patterns. Carries use both dumbbells at once, so
--      Farmers walk is never per side.
--
--   5. AT MOST ONE DELIBERATE REPEAT. Thirteen programs repeat exactly
--      one exercise across their sessions and say why in that slot's own
--      purpose (usually the row, so pull volume is practised twice); the
--      other three repeat nothing at all. No two sessions of one program share an opener.
--
--   6. NO PRESET LOADS. Not one slot in this file prescribes a weight.
--      The coach sets the first load with her in the room and the load
--      engine (migration 178) takes over from her own logs.
--
--   7. LINEAR PERIODIZATION, and a real week 3. Every program's main lift
--      gains a set in week 3, and every core hold that exists gets longer.
--      The conservative populations get a five second bump rather than
--      ten, and the two chair-based programs progress the main lift alone.
--      Undulating is parked; nothing here uses it.
--
--   8. MEMBER-FACING TEXT IS AUTHORED, WARM AND CLAIMS NOTHING. No em
--      dashes, no clinical vocabulary, no treatment language. Menopause
--      Strength Foundation and Bone, Balance and Strength Support in
--      particular describe strength work and nothing else; the claims a
--      program of this kind is usually sold with are absent on purpose,
--      and their coach-facing cautions say so in as many words.
--
-- ============================================================================
-- HOW THE SLOTS ARE WRITTEN. Same technique as migration 174: one VALUES
-- row per slot, joined to exercise_catalog BY NAME, with the row count
-- asserted afterwards. A renamed or missing exercise therefore fails this
-- migration loudly in whichever environment it is missing from, rather than
-- seeding a program with a hole in it.
-- ============================================================================

-- ============================================================================
-- 1) The programs. Identity only.
-- ============================================================================
insert into movement_programs (key, display_name, internal_name)
values
('rebuild_your_foundation', 'Rebuild Your Foundation', 'Rebuild Your Foundation (very gentle full body re-entry, 2 days, minimal equipment)'),
  ('beginner_strength_and_stability', 'Beginner Strength and Stability', 'Beginner Strength and Stability (3 days, bodyweight led with dumbbells where they help)'),
  ('back_to_exercise_reset', 'Back-to-Exercise Reset', 'Back-to-Exercise Reset (long break, 2 days, conservative, minimal equipment)'),
  ('active_aging_and_balance', 'Active Aging and Balance', 'Active Aging and Balance (older adults, chair supported, balance and single leg emphasis, 3 days)'),
  ('gym_strength_foundation', 'Gym Strength Foundation', 'Gym Strength Foundation (3 days, gym equipment, machine led first program)'),
  ('strong_after_40', 'Strong After 40', 'Strong After 40 (flagship, women 35 to 55, 3 days, dumbbells)'),
  ('menopause_strength_foundation', 'Menopause Strength Foundation', 'Menopause Strength Foundation (3 days, dumbbells, weight bearing emphasis, conservative progression)'),
  ('low_impact_strength_and_conditioning', 'Low-Impact Strength and Conditioning', 'Low-Impact Strength and Conditioning (3 days, dumbbells, zero impact, conditioning through density)'),
  ('energy_and_recovery_movement_plan', 'Energy and Recovery Movement Plan', 'Energy and Recovery Movement Plan (2 days, light, slow tempo, movement quality first)'),
  ('bone_balance_and_strength_support', 'Bone, Balance and Strength Support', 'Bone, Balance and Strength Support (3 days, weight bearing plus balance, conservative)'),
  ('desk_worker_movement_reset', 'Desk Worker Movement Reset', 'Desk Worker Movement Reset (3 days, hips, upper back and posture emphasis, minimal equipment)'),
  ('busy_parent_three_day_plan', 'Busy Parent Three-Day Plan', 'Busy Parent Three-Day Plan (3 short days, home dumbbells, seven slots a session)'),
  ('low_stress_training_week', 'Low-Stress Training Week', 'Low-Stress Training Week (2 days, downregulation friendly, long rests, slow tempo)'),
  ('travel_and_hotel_program', 'Travel and Hotel Program', 'Travel and Hotel Program (3 days, one bodyweight day and two dumbbell days, hotel gym safe)'),
  ('return_after_illness_or_extended_break', 'Return After Illness or Extended Break', 'Return After Illness or Extended Break (gentlest in the library, 2 days, chair based)'),
  ('golf_mobility_and_performance_foundation', 'Golf Mobility and Performance Foundation', 'Golf Mobility and Performance Foundation (3 days, rotation and ground force, dumbbells)');

-- ============================================================================
-- 2) Version 1 of each, as a DRAFT. See this file's header for why.
-- ============================================================================
with spec (
  key, member_title, member_description,
  coach_purpose, intended_population, cautions,
  duration_weeks, sessions_per_week, equipment_mode
) as (
  values
('rebuild_your_foundation',
   'Rebuild Your Foundation',
   'A gentle four week start, twice a week. Each session opens with three short movements to get you ready, then three strength movements, then core. Nothing here is rushed, and nothing needs a gym. In week 3 the first strength movement of each session gains a set and the core holds get a little longer.',
   'The gentlest full body re-entry in the library that still deserves the word strength. Two sessions a week, both full body, both built on patterns rather than muscles: squat, push, pull, then trunk. Session A is squat and horizontal push led, Session B is single side and prone posterior led. Every strength slot is a movement she can regress by changing her own position rather than by changing the exercise.',
   'An adult starting or restarting deliberate exercise with no acute pain and no current corrective priority. Suits someone who has been walking but not training. Where a posture finding is driving the plan, the corrective program comes first and this is not a substitute for it.',
   'Reduce or skip anything that causes pain. Review before assigning to anyone with current low back, knee or shoulder pain. Four slots are floor based, so she needs to be able to get down to and up from the floor unaided; if she cannot, Active Aging and Balance is the better starting point. One slot asks for a light resistance band, which is the only piece of equipment in the program. Loads are not prescribed: the coach sets them at the first session.',
   4, 2, 'home'),
  ('beginner_strength_and_stability',
   'Beginner Strength and Stability',
   'Four weeks, three sessions a week, at home. Each session is a short warm up, then four strength movements, then core. Session A uses your own bodyweight, Session B adds dumbbells, Session C works one side at a time and finishes with a carry. In week 3 the main lift of each session gains a set and the core holds get longer.',
   'The second rung after Rebuild Your Foundation. Bodyweight led, with dumbbells where they genuinely add something, so it can be run with or without them. Session A is bodyweight squat and push led, Session B is the dumbbell day, Session C is single side and carry led with a balance slot in it. Single Arm Dumbbell Row is the one exercise repeated across the week, so the pull gets practised twice.',
   'A beginner to early intermediate adult training three days a week at home, comfortable on the floor, ready to be given a number to progress. No acute pain and no current corrective priority.',
   'Reduce or skip anything that causes pain. Review before assigning to anyone with current low back, knee or shoulder pain. Several slots are floor based. One slot asks for a step or a bottom stair. Loads are not prescribed: the coach sets them at the first session.',
   4, 3, 'home'),
  ('back_to_exercise_reset',
   'Back-to-Exercise Reset',
   'Four weeks, twice a week, for coming back after a long time away. Session A relearns the shapes you use every day, Session B adds a little more work to them. Short warm up, three strength movements, then core. In week 3 the first strength movement of each session gains a set and the core holds get longer.',
   'For somebody who has trained before and stopped for a long time. The job is pattern recall and connective tissue tolerance, not stimulus, so volume is low and every movement is one she has done before. Session A teaches the squat, the step and the push at their easiest honest version; Session B repeats the patterns with more range and more reps. Deliberately two days: the third day is what gets skipped and then the program gets abandoned.',
   'An adult returning after six months or more away from deliberate training, with no acute pain and no current corrective priority. Not for somebody returning from illness or surgery, who should be given Return After Illness or Extended Break instead.',
   'Reduce or skip anything that causes pain. Expect delayed soreness in weeks 1 and 2 and say so before she starts. Review before assigning to anyone with current low back, knee or shoulder pain. Several slots are floor based. One slot asks for a light resistance band. Loads are not prescribed: the coach sets them at the first session.',
   4, 2, 'home'),
  ('active_aging_and_balance',
   'Active Aging and Balance',
   'Four weeks, three sessions a week, with a chair for support wherever you want it. Session A is sitting and standing, Session B is time on one leg, Session C adds weight in your hands. Every session ends with trunk work you can do from a chair. In week 3 the first strength movement of each session gains a set.',
   'Balance and single leg strength for an older adult, built inside beginner stage rules: everything on one leg is stationary or supported, and nothing steps, hops or jumps. Session A is the sit to stand and the ankle, Session B is time on one leg with a step, Session C is loaded with light dumbbells including a carry. Not one slot in the program requires getting down to or up from the floor, which is a deliberate constraint rather than a coincidence.',
   'Older adults training three days a week, with or without a balance concern, who can stand and walk unaided. Beginner stage throughout, whatever her training history, because the stability demand rather than the load is what is being managed here.',
   'Reduce or skip anything that causes pain. A sturdy chair that does not slide must be available for every session, and she should be told to use it rather than to prove she does not need it. Review before assigning to anyone with a fall in the last twelve months, current dizziness, or a medication review pending, and consider running Session B with a second person present in week 1. The step used in Session B should be a low, fixed step, not a stool. Loads are not prescribed: the coach sets them at the first session and they should start lighter than she expects.',
   4, 3, 'home'),
  ('gym_strength_foundation',
   'Gym Strength Foundation',
   'Four weeks, three sessions a week, in a gym. Session A is legs, Session B is upper body, Session C is hips, back and a carry. Most of the strength work is on machines to begin with, so you can find a real weight without also having to balance it. In week 3 the main lift of each session gains a set and the core holds get longer.',
   'A first gym program. Machine and cable led on purpose: the limiting factor for a new gym member is confidence and setup time, not stimulus, and a fixed path lets her find a genuinely challenging load in week 1. Session A is leg led, Session B is push and pull led, Session C is hinge and carry led. Chest Supported Row Machine is the one exercise repeated across the week, so the pull gets practised twice. No barbell anywhere and no bent over double arm rowing, both of which belong at a later stage.',
   'A beginner to early intermediate adult with gym access, three days a week. No acute pain and no current corrective priority.',
   'Reduce or skip anything that causes pain. Machine seat and pad settings should be written down with her in the first session, or week 2 becomes a setup session again. Review before assigning to anyone with current low back, knee or shoulder pain. Three slots are floor based. Loads are not prescribed: the coach sets them at the first session.',
   4, 3, 'gym'),
  ('strong_after_40',
   'Strong After 40',
   'Four weeks, three sessions a week, with a pair of dumbbells. Session A is squat led, Session B is push and pull, Session C is hips, single side work and a carry. Real strength work, and enough of it to see something change. In week 3 the main lift of each session gains a set and the core holds get longer.',
   'The flagship dumbbell program for the 35 to 55 population, and the one most members in this collection should start on. Three full sessions built on the same five patterns every week: squat, hinge, push, pull, carry. Session A is squat led, Session B is push and pull led, Session C is hinge and carry led. Single Arm Dumbbell Row is the one exercise repeated across the week, so the pull gets practised twice. Split Squat is stationary, which is what keeps the single side work honest.',
   'Women roughly 35 to 55 training three days a week at home with dumbbells, early intermediate stage, able to get down to and up from the floor unaided. No acute pain and no current corrective priority.',
   'Reduce or skip anything that causes pain. Review before assigning to anyone with current low back, knee or shoulder pain. Several slots are floor based. The volume is real and week 3 adds to it, so check in before week 3 rather than after it. Loads are not prescribed: the coach sets them at the first session.',
   4, 3, 'home'),
  ('menopause_strength_foundation',
   'Menopause Strength Foundation',
   'Four weeks, three sessions a week, with dumbbells. Strength work you can keep doing, built around the movements that carry you through a day: standing up, hinging, pushing, pulling and carrying. Session A is legs, Session B is upper body, Session C is whole body with a carry. In week 3 the main lift of each session gains a set and the core holds get longer.',
   'Strength for a member in the menopause transition, with weight bearing and standing work deliberately favoured over floor work, and progressions kept conservative because sleep and recovery are frequently the limiting factor rather than capacity. Session A is lower body led, Session B is upper body led, Session C is whole body with a carry. Single Arm Dumbbell Row is the one exercise repeated across the week. There is no jumping and no impact anywhere in it. This program makes no claim about symptoms and none about bone: it is a strength program, described as one.',
   'Women in the perimenopausal or postmenopausal years training three days a week at home with dumbbells. Early intermediate stage, able to get down to and up from the floor unaided.',
   'Reduce or skip anything that causes pain. Nothing here treats a symptom or a diagnosis, and it should never be presented as if it did; anything medical belongs with her own clinician. Sleep disruption and joint sensitivity are common in this population and both change what a good session looks like, so ask before adding load rather than following the week 3 progression blindly. Review before assigning to anyone with current low back, knee, shoulder or pelvic floor symptoms. Loads are not prescribed: the coach sets them at the first session.',
   4, 3, 'home'),
  ('low_impact_strength_and_conditioning',
   'Low-Impact Strength and Conditioning',
   'Four weeks, three sessions a week. Nothing in this program jumps, hops or lands. The conditioning comes from higher reps, shorter rests and loaded carries instead. Session A is legs, Session B is push and pull, Session C is hips and carrying. In week 3 the main lift of each session gains a set and the core holds get longer.',
   'Strength and conditioning with zero impact anywhere: no jump, no hop, no landing, no run. Conditioning is bought with rep range and rest rather than with plyometrics, which is why the rep counts run higher than the rest of the collection and the rests run shorter. Session A is squat and isometric led, Session B is push and pull led, Session C is hinge and carry led. Single Arm Dumbbell Row is the one exercise repeated across the week.',
   'Anybody who needs the training effect without impact: joint sensitivity, pelvic floor symptoms, a heavy standing job, or simply a downstairs neighbour. Early intermediate stage, three days a week, dumbbells at home.',
   'Reduce or skip anything that causes pain. The shorter rests are the conditioning stimulus, so if she is running out of breath rather than out of muscle, lengthen the rest before dropping the load. Review before assigning to anyone with current low back, knee or shoulder pain. Several slots are floor based. Loads are not prescribed: the coach sets them at the first session.',
   4, 3, 'home'),
  ('energy_and_recovery_movement_plan',
   'Energy and Recovery Movement Plan',
   'Four weeks, twice a week, deliberately light. Every movement is done slowly, with time to feel where you are, and there is more rest than you probably think you need. You should leave each session with something left. In week 3 the first strength movement of each session gains a set and the core holds get longer.',
   'The lightest program in the library that is still a strength program. Every strength slot runs a slow three second lower and a three second lift with generous rest, so the session buys movement quality and blood flow rather than fatigue. Two days, both full body. Suits a member in a heavy life phase, a deload week, or the fortnight after a hard block. Single Arm Dumbbell Row is the one exercise repeated across the week.',
   'A member who is training but under-recovered, or coming off a demanding block, or in a period where a hard program would simply not get done. Any stage; the constraint is recovery, not capacity.',
   'Reduce or skip anything that causes pain. If she is consistently finishing this program feeling worse rather than better, the problem is upstream of training and this is not the fix. Review before assigning to anyone with current low back, knee or shoulder pain. Several slots are floor based. Loads are not prescribed, and here in particular they should be set low enough that the slow tempo is comfortable rather than a struggle.',
   4, 2, 'home'),
  ('bone_balance_and_strength_support',
   'Bone, Balance and Strength Support',
   'Four weeks, three sessions a week. Weight bearing strength work and time spent on one leg, in equal measure. Session A carries load through the legs and hips, Session B is balance and stepping, Session C is whole body with a carry. In week 3 the main lift of each session gains a set, and you hold the balance and core work for longer.',
   'Loading and balance in one program, kept conservative. Session A is the loading day, Session B is the balance day with stepping and single leg time, Session C combines them and finishes with a carry. Everything on one leg is stationary or supported, so the balance work is trained rather than tested. Single Arm Dumbbell Row is the one exercise repeated across the week. The program name is the coach shelf label; nothing a member reads claims an effect on bone, and nothing here should be presented as treatment.',
   'A member who wants loading and balance together: often, but not only, post-menopausal women and older adults. Early beginner to intermediate stage, three days a week, at home.',
   'Reduce or skip anything that causes pain. This program treats nothing and diagnoses nothing; if she has a bone density result or a diagnosis, the plan belongs with her own clinician and this supports it rather than replaces it. Where a fracture history, a diagnosis or a fall in the last twelve months exists, get clinical clearance before assigning and consider Active Aging and Balance instead, which has no floor work in it at all. The step used in Session B should be low and fixed. Loads are not prescribed: the coach sets them at the first session.',
   4, 3, 'home'),
  ('desk_worker_movement_reset',
   'Desk Worker Movement Reset',
   'Four weeks, three sessions a week, for a body that spends its day sitting. Session A opens the hips, Session B works the upper back and shoulders, Session C puts the two together. Minimal equipment, and nothing that needs a gym. In week 3 the first strength movement of each session gains a set and the core holds get longer.',
   'Hips, upper back and the pulling volume a desk job never provides. Session A is hip led, Session B is thoracic and posture led with a rotation opener, Session C is a full body day. Rowing appears in two sessions on purpose: pull volume is the single biggest thing missing from this population, and Resistance Band Row is the one exercise repeated across the week. Deliberately not a corrective program: where a real posture finding exists, the corrective program comes first and this is not a substitute for it.',
   'An adult in a seated job, three days a week, at home or in a hotel room, with a light resistance band. Beginner to early intermediate stage. No acute pain and no current corrective priority.',
   'Reduce or skip anything that causes pain. This is a general program, not a corrective one, and it should not be assigned in place of a corrective program where an assessment has found something. Review before assigning to anyone with current neck, low back or shoulder pain. Several slots are floor based. One slot asks for a light resistance band. Loads are not prescribed: the coach sets them at the first session.',
   4, 3, 'home'),
  ('busy_parent_three_day_plan',
   'Busy Parent Three-Day Plan',
   'Four weeks, three short sessions a week, at home. Seven movements each time: two to get you ready, four strength, one core. Built to be finished rather than admired. In week 3 the main lift of each session gains a set.',
   'Short by design. Seven slots a session rather than nine, a two movement opener rather than three, and no session that needs more floor space than a living room. Everything else is a normal full body dumbbell program: Session A is squat and push led, Session B is hinge and press led, Session C is single side and carry led. Single Arm Dumbbell Row is the one exercise repeated across the week. If the choice is between this being done three times and a better program being done once, this is the better program.',
   'A parent or carer with real time pressure, three days a week, dumbbells at home. Early intermediate stage. No acute pain and no current corrective priority.',
   'Reduce or skip anything that causes pain. The opener is two movements rather than three, so if she arrives cold from a car or a school run, tell her to add a few minutes of walking first rather than to skip straight to the first lift. Review before assigning to anyone with current low back, knee or shoulder pain. Loads are not prescribed: the coach sets them at the first session.',
   4, 3, 'home'),
  ('low_stress_training_week',
   'Low-Stress Training Week',
   'Four weeks, twice a week, for the weeks when everything else is already a lot. Each session opens lying down with slow breathing, moves through three strength movements at an unhurried pace with long rests, and ends with quiet core work. In week 3 the first strength movement of each session gains a set and the core holds get longer.',
   'Training that does not add to the load. The opener is lying down rather than standing so the session starts by settling rather than by revving, every strength slot runs a slow tempo with ninety second rests, and the core work is held rather than repped. It is still a real strength program: two full body days, three strength movements each, the same patterns as the rest of the library. Single Arm Dumbbell Row is the one exercise repeated across the week.',
   'A member in a high stress period who wants to keep training rather than stop. Any stage. Also useful as a planned lighter block between harder ones.',
   'Reduce or skip anything that causes pain. The long rests are the point, so a member who compresses them has changed the program into something else; say so at the first session. This program manages training load and nothing else, and it should never be offered as an answer to a mental health concern. Review before assigning to anyone with current low back, knee or shoulder pain. Loads are not prescribed, and here they should be set well short of hard.',
   4, 2, 'home'),
  ('travel_and_hotel_program',
   'Travel and Hotel Program',
   'Four weeks, three sessions a week, wherever you are. Session A needs nothing but the floor, so it works in a hotel room. Sessions B and C use a pair of dumbbells, which is the one thing every hotel gym reliably has. In week 3 the main lift of each session gains a set and the core holds get longer.',
   'Written around what is actually available on the road. Session A is entirely bodyweight and fits in a hotel room with no gym at all. Sessions B and C use dumbbells only, the one piece of equipment a hotel gym can be relied on for; there is no barbell, no cable, no machine and no bench anywhere in the program, so nothing depends on what a particular gym happens to own. Single Arm Dumbbell Row is the one exercise repeated across the week.',
   'A member who travels regularly, three days a week, early intermediate stage. Also the right program to hand somebody for a fortnight away in the middle of a different block.',
   'Reduce or skip anything that causes pain. Hotel dumbbells often jump in five pound steps, so expect the load to be either slightly too light or slightly too heavy and tell her to add reps rather than to chase the number. Review before assigning to anyone with current low back, knee or shoulder pain. Several slots are floor based. Loads are not prescribed: the coach sets them at the first session.',
   4, 3, 'mixed'),
  ('return_after_illness_or_extended_break',
   'Return After Illness or Extended Break',
   'Four weeks, twice a week, and the gentlest program we have. Almost all of it is done sitting on or holding a chair, with long rests between everything. Standing up out of a chair is the movement both sessions are built around, because it is the one that gives you the most back. In week 3 it gains a set, and nothing else changes.',
   'The floor of the library. Two days, eight slots each, chair based throughout, with ninety second rests on every strength slot. Narrow Squats with Chair is the one exercise repeated across the week and it is the whole point of the program: the sit to stand is the single most useful thing to rebuild first, so it is practised both days rather than once. Only two slots leave the chair, both of them lying down rather than standing, so nothing in the program requires getting up off the floor from a low position. Week 3 adds a set to the sit to stand and to nothing else.',
   'A member returning after illness, surgery, hospitalisation or a very long lay-off, cleared to exercise, whose starting capacity is genuinely low. Beginner stage regardless of training history.',
   'This program assumes she has been cleared to exercise. Where that clearance has not happened, it has not happened, and nothing here substitutes for it. Reduce or skip anything that causes pain, breathlessness beyond mild, dizziness or a racing heart, and stop the session rather than push through any of them. A sturdy chair that does not slide is required. Post-viral fatigue can present as a good session followed by two bad days, so ask about the day AFTER each session rather than about the session. Progress the load only when two consecutive weeks have gone well. Loads are not prescribed and in most cases should be zero for the first fortnight.',
   4, 2, 'home'),
  ('golf_mobility_and_performance_foundation',
   'Golf Mobility and Performance Foundation',
   'Four weeks, three sessions a week, built for a rotational sport. Session A is legs and hips, where the power comes from. Session B opens the upper back and works the pull. Session C brings it together with a carry. The core work is all about holding still while something else moves. In week 3 the main lift of each session gains a set and the core holds get longer.',
   'Rotation, hip and thoracic mobility, anti rotation core and ground force strength, in the MEF session shape. Session A is the ground force day: squat, stationary split squat, hinge and calf. Session B opens the thoracic spine and loads the pull. Session C is hinge, carry and single side. The core blocks are anti rotation and anti extension throughout, never a twisting crunch, which is the whole coaching point for a rotational athlete. Single Arm Dumbbell Row is the one exercise repeated across the week.',
   'A golfer or other rotational sport player, three days a week, dumbbells at home, early intermediate stage. Off season or early season. No acute pain and no current corrective priority.',
   'Reduce or skip anything that causes pain. This is a general strength and mobility base, not swing coaching, and it makes no claim about a swing or a handicap. Where low back pain is present, which is common in this population, get it assessed before assigning: rotation work on an irritated back makes things worse, not better. Several slots are floor based. Loads are not prescribed: the coach sets them at the first session.',
   4, 3, 'home')
)
insert into movement_program_versions (
  program_id, version_number, display_name, status, notes,
  member_title, member_description,
  coach_purpose, intended_population, cautions,
  duration_weeks, sessions_per_week, equipment_mode, periodization
)
select
  p.id,
  1,
  p.display_name || ' v1',
  'draft',
  'Authored as part of the MEF program library. Approved separately, through the administrator approval action, by a named administrator.',
  s.member_title, s.member_description,
  s.coach_purpose, s.intended_population, s.cautions,
  s.duration_weeks, s.sessions_per_week, s.equipment_mode, 'linear'
from spec s
join movement_programs p on p.key = s.key;

-- ============================================================================
-- 3) The slots. Columns, in order:
--      program key, session, slot order, block, exercise name,
--      movement pattern, purpose (coach only), priority rank, required,
--      equipment, difficulty, locked, per side,
--      sets, reps, hold seconds, tempo, rest seconds, week overrides
-- ============================================================================
with slot_spec (
  program_key, session_designation, slot_order, block, exercise_name, movement_pattern,
  purpose, priority_rank, is_required, equipment_requirement, difficulty_tier,
  is_locked, is_per_side, sets, reps, hold_duration_seconds, tempo, rest_seconds, week_overrides
) as (
  values
('rebuild_your_foundation', 'A', 1, 'release', 'Cat cow pose', 'spinal',
   'Wake the spine up through flexion and extension before anything is loaded. Low effort on purpose.',
   8, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('rebuild_your_foundation', 'A', 2, 'mobility', 'Hip flexor stretch', 'hip_flexion',
   'Length at the front of the hip so the squat and the split stance can reach depth without the low back taking it. Marked per side: the whole set is completed on one side before the other.',
   7, true, '{}'::text[], 'beginner', false, true,
   2, null, 30, null, 15, '{}'::jsonb),
  ('rebuild_your_foundation', 'A', 3, 'stability', 'Glute Bridge (Bodyweight)', 'hip_hinge',
   'Glute activation before the main lift, so the squat and the hinge are not driven by the quads alone.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('rebuild_your_foundation', 'A', 4, 'strength', 'Bodyweight Squat', 'squat',
   'The main movement of Session A. The squat with nothing in the hands, so depth and knee tracking are the only things being asked for.',
   1, true, '{}'::text[], 'beginner', true, false,
   2, 10, null, '2-0-2', 75, '{"3":{"sets":3}}'::jsonb),
  ('rebuild_your_foundation', 'A', 5, 'strength', 'Wall Push Ups', 'horizontal_push',
   'The push up at the easiest angle there is. Distance from the wall is the whole progression.',
   2, true, '{wall}'::text[], 'beginner', false, false,
   2, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('rebuild_your_foundation', 'A', 6, 'strength', 'Resistance Band Row', 'horizontal_pull',
   'Rowing with the torso upright and no weight to hold. The pull pattern at its lowest cost.',
   3, true, '{band}'::text[], 'beginner', false, false,
   2, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('rebuild_your_foundation', 'A', 7, 'core', 'Dead Bug', 'anti_extension',
   'Trunk control with the arms and legs moving, lying on the back. Slow on purpose.',
   4, true, '{}'::text[], 'beginner', false, false,
   2, 8, null, '3-1-3', 30, '{}'::jsonb),
  ('rebuild_your_foundation', 'A', 8, 'core', 'Ab Bridge Complex', 'anti_extension',
   'Forearm bridge hold. Same job as a plank and materially easier to hold well.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 20, null, 30, '{"3":{"hold_duration_seconds":25}}'::jsonb),
  ('rebuild_your_foundation', 'B', 1, 'release', 'Child''s pose', 'spinal',
   'Settle the hips and the low back, and get the breathing slow, before the working sets.',
   8, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('rebuild_your_foundation', 'B', 2, 'mobility', 'Standing forward bend', 'hip_hinge',
   'Hamstring and posterior chain length before the hinge, standing so nobody has to get to the floor for it.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('rebuild_your_foundation', 'B', 3, 'stability', 'Prone W to lifts', 'scapular',
   'Mid back switched on before the pull, so the row is not all biceps.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('rebuild_your_foundation', 'B', 4, 'strength', 'Staggered squats', 'squat',
   'The main movement of Session B, and the first single side work in the program. One foot forward and left there. Single side work without asking anyone to balance on one leg yet. Marked per side: the whole set is completed on one side before the other.',
   1, true, '{}'::text[], 'beginner', true, true,
   2, 8, null, '2-0-2', 75, '{"3":{"sets":3}}'::jsonb),
  ('rebuild_your_foundation', 'B', 5, 'strength', 'Inclined push up', 'horizontal_push',
   'Push up with the hands raised. Lower the surface and it gets harder, which is a progression she owns.',
   2, true, '{}'::text[], 'beginner', false, false,
   2, 8, null, '2-0-2', 60, '{}'::jsonb),
  ('rebuild_your_foundation', 'B', 6, 'strength', 'Reverse Snow Angels', 'scapular',
   'Upper back and lower traps worked lying face down. No equipment, and nothing to balance.',
   3, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('rebuild_your_foundation', 'B', 7, 'core', 'Plank', 'anti_extension',
   'Hold the trunk still under fatigue. Timed, never a crunch.',
   4, true, '{}'::text[], 'beginner', false, false,
   2, null, 20, null, 30, '{"3":{"hold_duration_seconds":25}}'::jsonb),
  ('rebuild_your_foundation', 'B', 8, 'core', 'Arch Skydiver', 'anti_flexion',
   'Low back and glutes held in extension, face down. No spinal flexion anywhere in it.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, 8, null, '3-1-3', 30, '{}'::jsonb),
  ('beginner_strength_and_stability', 'A', 1, 'release', 'Cat cow pose', 'spinal',
   'Wake the spine up through flexion and extension before anything is loaded. Low effort on purpose.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('beginner_strength_and_stability', 'A', 2, 'mobility', 'Hip flexor stretch', 'hip_flexion',
   'Length at the front of the hip so the squat and the split stance can reach depth without the low back taking it. Marked per side: the whole set is completed on one side before the other.',
   8, true, '{}'::text[], 'beginner', false, true,
   2, null, 30, null, 15, '{}'::jsonb),
  ('beginner_strength_and_stability', 'A', 3, 'stability', 'Glute Bridge (Bodyweight)', 'hip_hinge',
   'Glute activation before the main lift, so the squat and the hinge are not driven by the quads alone.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('beginner_strength_and_stability', 'A', 4, 'strength', 'Bodyweight Squat', 'squat',
   'The main movement of Session A. The squat with nothing in the hands, so depth and knee tracking are the only things being asked for.',
   1, true, '{}'::text[], 'beginner', true, false,
   3, 10, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('beginner_strength_and_stability', 'A', 5, 'strength', 'Step-Ups (Bodyweight)', 'lunge',
   'One leg does the work, on a step, with the other foot available. Single side strength with a way out of it. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{}'::text[], 'beginner', false, true,
   2, 8, null, '2-0-2', 60, '{}'::jsonb),
  ('beginner_strength_and_stability', 'A', 6, 'strength', 'Inclined push up', 'horizontal_push',
   'Push up with the hands raised. Lower the surface and it gets harder, which is a progression she owns.',
   3, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('beginner_strength_and_stability', 'A', 7, 'strength', 'Reverse Snow Angels', 'scapular',
   'Upper back and lower traps worked lying face down. No equipment, and nothing to balance.',
   4, true, '{}'::text[], 'beginner', false, false,
   2, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('beginner_strength_and_stability', 'A', 8, 'core', 'Plank', 'anti_extension',
   'Hold the trunk still under fatigue. Timed, never a crunch.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 25, null, 30, '{"3":{"hold_duration_seconds":35}}'::jsonb),
  ('beginner_strength_and_stability', 'A', 9, 'core', 'Dead Bug', 'anti_extension',
   'Trunk control with the arms and legs moving, lying on the back. Slow on purpose.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 8, null, '3-1-3', 30, '{}'::jsonb),
  ('beginner_strength_and_stability', 'B', 1, 'release', 'Arm swings', 'shoulder',
   'Blood into the shoulders and a first look at overhead range before anything presses.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('beginner_strength_and_stability', 'B', 2, 'mobility', 'Puppy pose', 'thoracic',
   'Upper back and lat length so the press comes from the shoulder rather than the low back.',
   8, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('beginner_strength_and_stability', 'B', 3, 'stability', 'Prone W to lifts', 'scapular',
   'Mid back switched on before the pull, so the row is not all biceps.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('beginner_strength_and_stability', 'B', 4, 'strength', 'Dumbbell floor chest press', 'horizontal_push',
   'The main lift of Session B. Floor press rather than bench: no bench needed, and the floor limits the range for a shoulder that is not ready for all of it.',
   1, true, '{dumbbell}'::text[], 'intermediate', true, false,
   3, 10, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('beginner_strength_and_stability', 'B', 5, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The one exercise repeated across the week. Session C is the second go at it. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'beginner', true, true,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('beginner_strength_and_stability', 'B', 6, 'strength', 'Dumbbell Sumo Squat', 'squat',
   'Wide stance squat under load. Inner thigh and glute, and less demand on the ankle than a narrow stance.',
   3, true, '{dumbbell}'::text[], 'beginner', false, false,
   2, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('beginner_strength_and_stability', 'B', 7, 'strength', 'Dumbbell Shoulder Press', 'vertical_push',
   'Overhead strength. Kept short because it is the most demanding position on any of these lists.',
   4, true, '{dumbbell}'::text[], 'beginner', false, false,
   2, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('beginner_strength_and_stability', 'B', 8, 'core', 'Bird Dog', 'anti_rotation',
   'Trunk still while opposite limbs move. The rehearsal for holding position under the hinge, and the anti rotation work of the week.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('beginner_strength_and_stability', 'B', 9, 'core', 'Reverse Plank', 'anti_flexion',
   'Back of the body under a hold, to balance the front loaded core work elsewhere in the week.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, null, 20, null, 30, '{"3":{"hold_duration_seconds":30}}'::jsonb),
  ('beginner_strength_and_stability', 'C', 1, 'release', 'Child''s pose', 'spinal',
   'Settle the hips and the low back, and get the breathing slow, before the working sets.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('beginner_strength_and_stability', 'C', 2, 'mobility', 'Standing forward bend', 'hip_hinge',
   'Hamstring and posterior chain length before the hinge, standing so nobody has to get to the floor for it.',
   8, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('beginner_strength_and_stability', 'C', 3, 'stability', 'Fire Hydrant Circles', 'hip_rotation',
   'Hip abduction and rotation control, which is what sets knee tracking for everything on one leg. Marked per side: the whole set is completed on one side before the other.',
   7, true, '{}'::text[], 'beginner', false, true,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('beginner_strength_and_stability', 'C', 4, 'strength', 'Dumbbell Romanian Deadlift', 'hip_hinge',
   'The main lift of Session C. Hinge with a soft knee, stopped short of the point where the back rounds. The hamstring and glute lift of the week.',
   1, true, '{dumbbell}'::text[], 'intermediate', true, false,
   3, 8, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('beginner_strength_and_stability', 'C', 5, 'strength', 'Bodyweight Split Squat', 'lunge',
   'Split stance, feet set and left there, every rep on one leg before switching. No stepping in or out. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{}'::text[], 'intermediate', false, true,
   2, 8, null, '2-0-2', 60, '{}'::jsonb),
  ('beginner_strength_and_stability', 'C', 6, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The week''s second go at the row, and the only exercise that appears twice. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   3, true, '{dumbbell}'::text[], 'beginner', true, true,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('beginner_strength_and_stability', 'C', 7, 'strength', 'Single-Leg Step Balance', 'balance',
   'Time on one leg, in front of a step, with something to touch down onto. Balance trained rather than tested. Marked per side: the whole set is completed on one side before the other.',
   4, true, '{box}'::text[], 'beginner', false, true,
   2, null, 20, null, 30, '{}'::jsonb),
  ('beginner_strength_and_stability', 'C', 8, 'core', 'Ab Bridge Complex', 'anti_extension',
   'Forearm bridge hold. Same job as a plank and materially easier to hold well.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 20, null, 30, '{"3":{"hold_duration_seconds":30}}'::jsonb),
  ('beginner_strength_and_stability', 'C', 9, 'core', 'Arch Skydiver', 'anti_flexion',
   'Low back and glutes held in extension, face down. No spinal flexion anywhere in it.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('back_to_exercise_reset', 'A', 1, 'release', 'Cat cow pose', 'spinal',
   'Wake the spine up through flexion and extension before anything is loaded. Low effort on purpose.',
   8, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('back_to_exercise_reset', 'A', 2, 'mobility', 'Hip hinge', 'hip_hinge',
   'The hinge rehearsed with no load at all. This is a teaching slot, not a warm up one.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('back_to_exercise_reset', 'A', 3, 'stability', 'Glute Bridge (Bodyweight)', 'hip_hinge',
   'Glute activation before the main lift, so the squat and the hinge are not driven by the quads alone.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('back_to_exercise_reset', 'A', 4, 'strength', 'Bodyweight Squat', 'squat',
   'The main movement of Session A. The squat with nothing in the hands, so depth and knee tracking are the only things being asked for.',
   1, true, '{}'::text[], 'beginner', true, false,
   2, 10, null, '2-0-2', 75, '{"3":{"sets":3}}'::jsonb),
  ('back_to_exercise_reset', 'A', 5, 'strength', 'Step-Ups (Bodyweight)', 'lunge',
   'One leg does the work, on a step, with the other foot available. Single side strength with a way out of it. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{}'::text[], 'beginner', false, true,
   2, 8, null, '2-0-2', 60, '{}'::jsonb),
  ('back_to_exercise_reset', 'A', 6, 'strength', 'Wall Push Ups', 'horizontal_push',
   'The push up at the easiest angle there is. Distance from the wall is the whole progression.',
   3, true, '{wall}'::text[], 'beginner', false, false,
   2, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('back_to_exercise_reset', 'A', 7, 'core', 'Dead Bug', 'anti_extension',
   'Trunk control with the arms and legs moving, lying on the back. Slow on purpose.',
   4, true, '{}'::text[], 'beginner', false, false,
   2, 8, null, '3-1-3', 30, '{}'::jsonb),
  ('back_to_exercise_reset', 'A', 8, 'core', 'Ab Bridge Complex', 'anti_extension',
   'Forearm bridge hold. Same job as a plank and materially easier to hold well.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 20, null, 30, '{"3":{"hold_duration_seconds":25}}'::jsonb),
  ('back_to_exercise_reset', 'B', 1, 'release', 'Child''s pose', 'spinal',
   'Settle the hips and the low back, and get the breathing slow, before the working sets.',
   8, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('back_to_exercise_reset', 'B', 2, 'mobility', 'Standing forward bend', 'hip_hinge',
   'Hamstring and posterior chain length before the hinge, standing so nobody has to get to the floor for it.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('back_to_exercise_reset', 'B', 3, 'stability', 'Prone W to lifts', 'scapular',
   'Mid back switched on before the pull, so the row is not all biceps.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('back_to_exercise_reset', 'B', 4, 'strength', 'Sumo squats', 'squat',
   'The main movement of Session B. Wide stance, so a stiff ankle is not the limiting factor. Wide stance squat, no load. Less ankle range needed than a narrow squat, more inner thigh and glute.',
   1, true, '{}'::text[], 'beginner', true, false,
   2, 12, null, '2-0-2', 75, '{"3":{"sets":3}}'::jsonb),
  ('back_to_exercise_reset', 'B', 5, 'strength', 'Resistance Band Row', 'horizontal_pull',
   'Rowing with the torso upright and no weight to hold. The pull pattern at its lowest cost.',
   2, true, '{band}'::text[], 'beginner', false, false,
   2, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('back_to_exercise_reset', 'B', 6, 'strength', 'Inclined push up', 'horizontal_push',
   'Push up with the hands raised. Lower the surface and it gets harder, which is a progression she owns.',
   3, true, '{}'::text[], 'beginner', false, false,
   2, 8, null, '2-0-2', 60, '{}'::jsonb),
  ('back_to_exercise_reset', 'B', 7, 'core', 'Plank', 'anti_extension',
   'Hold the trunk still under fatigue. Timed, never a crunch.',
   4, true, '{}'::text[], 'beginner', false, false,
   2, null, 20, null, 30, '{"3":{"hold_duration_seconds":25}}'::jsonb),
  ('back_to_exercise_reset', 'B', 8, 'core', 'Reverse Plank', 'anti_flexion',
   'Back of the body under a hold, to balance the front loaded core work elsewhere in the week.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 15, null, 30, '{"3":{"hold_duration_seconds":20}}'::jsonb),
  ('active_aging_and_balance', 'A', 1, 'release', 'Seated ankle circles', 'ankle',
   'Ankles first, seated. Everything that follows is done standing, and the ankle is where standing balance starts.',
   8, true, '{chair}'::text[], 'beginner', false, false,
   1, null, 45, null, 15, '{}'::jsonb),
  ('active_aging_and_balance', 'A', 2, 'mobility', 'Psoas stretch', 'hip_flexion',
   'Front of the hip opened with a chair to hold, so balance is never the limiting factor. Marked per side: the whole set is completed on one side before the other.',
   7, true, '{chair}'::text[], 'beginner', false, true,
   2, null, 30, null, 15, '{}'::jsonb),
  ('active_aging_and_balance', 'A', 3, 'stability', 'Sitting Pelvic tilts', 'pelvic',
   'Find the two ends of the pelvis, seated. The reference point everything else in the session is held against.',
   6, true, '{chair}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('active_aging_and_balance', 'A', 4, 'strength', 'Narrow Squats with Chair', 'squat',
   'The main movement of Session A, and the one that matters most for independence. Sit to stand with a chair behind. The most useful movement in the library for somebody rebuilding, and the safest way to load it.',
   1, true, '{chair}'::text[], 'beginner', true, false,
   2, 10, null, '2-0-2', 75, '{"3":{"sets":3}}'::jsonb),
  ('active_aging_and_balance', 'A', 5, 'strength', 'Heel Raises toe raises', 'ankle',
   'Calves and shins, with a chair to hold. The ankle strength that stops a trip becoming a fall.',
   2, true, '{chair}'::text[], 'beginner', false, false,
   2, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('active_aging_and_balance', 'A', 6, 'strength', 'Chair Leg Extension', 'knee_extension',
   'Quads worked seated, one leg at a time, with no weight through the joint at all. Marked per side: the whole set is completed on one side before the other.',
   3, true, '{chair}'::text[], 'beginner', false, true,
   2, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('active_aging_and_balance', 'A', 7, 'strength', 'Resistance Band Row', 'horizontal_pull',
   'Rowing with the torso upright and no weight to hold. The pull pattern at its lowest cost.',
   4, true, '{band}'::text[], 'beginner', false, false,
   2, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('active_aging_and_balance', 'A', 8, 'core', 'Chair Twists', 'rotation',
   'Rotation through the trunk, seated and controlled, with the hips staying put.',
   5, true, '{chair}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('active_aging_and_balance', 'B', 1, 'release', 'Arm swings', 'shoulder',
   'Blood into the shoulders and a first look at overhead range before anything presses.',
   8, true, '{}'::text[], 'beginner', false, false,
   1, null, 45, null, 15, '{}'::jsonb),
  ('active_aging_and_balance', 'B', 2, 'mobility', 'Lateral leg swing', 'hip_abduction',
   'Hip opened side to side with a chair to hold. Prepares the sideways direction most days never use. Marked per side: the whole set is completed on one side before the other.',
   7, true, '{chair}'::text[], 'beginner', false, true,
   2, 10, null, null, 15, '{}'::jsonb),
  ('active_aging_and_balance', 'B', 3, 'stability', 'Hip Abduction', 'hip_abduction',
   'Side of the hip switched on with a chair to hold. This is the muscle that keeps the pelvis level on one leg. Marked per side: the whole set is completed on one side before the other.',
   6, true, '{chair}'::text[], 'beginner', false, true,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('active_aging_and_balance', 'B', 4, 'strength', 'Step ups', 'lunge',
   'The main movement of Session B. The stair pattern, trained on purpose. Stepping up onto a box, one leg at a time. The stair pattern, trained on purpose. Marked per side: the whole set is completed on one side before the other.',
   1, true, '{box}'::text[], 'beginner', true, true,
   2, 8, null, '2-0-2', 75, '{"3":{"sets":3}}'::jsonb),
  ('active_aging_and_balance', 'B', 5, 'strength', 'Single-Leg Step Balance', 'balance',
   'Time on one leg, in front of a step, with something to touch down onto. Balance trained rather than tested. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{box}'::text[], 'beginner', false, true,
   2, null, 20, null, 45, '{}'::jsonb),
  ('active_aging_and_balance', 'B', 6, 'strength', 'Wall Push Ups', 'horizontal_push',
   'The push up at the easiest angle there is. Distance from the wall is the whole progression.',
   3, true, '{wall}'::text[], 'beginner', false, false,
   2, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('active_aging_and_balance', 'B', 7, 'strength', 'Banded Lateral Walks', 'hip_abduction',
   'Side of the hip under real resistance, standing. Loads the muscle that holds the pelvis level while walking.',
   4, true, '{band}'::text[], 'beginner', false, false,
   2, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('active_aging_and_balance', 'B', 8, 'core', 'Half Roll Backs', 'anti_flexion',
   'Lower away from a seated position and come back, under control. Trunk strength without ever leaving the chair.',
   5, true, '{chair}'::text[], 'beginner', false, false,
   2, 8, null, '3-1-3', 30, '{}'::jsonb),
  ('active_aging_and_balance', 'C', 1, 'release', 'Seated Side Bends', 'lateral_flexion',
   'Side of the trunk lengthened, seated. Opens the ribs before anything asks the trunk to hold still.',
   8, true, '{chair}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('active_aging_and_balance', 'C', 2, 'mobility', 'Head Turns Neck stretches', 'cervical',
   'Neck range, seated and slow. Cheap, and it is the first thing that stiffens after a spell of not moving.',
   7, true, '{chair}'::text[], 'beginner', false, false,
   2, null, 20, null, 15, '{}'::jsonb),
  ('active_aging_and_balance', 'C', 3, 'stability', 'Goal Post Squeeze', 'scapular',
   'Shoulder blades set, seated. The position the upper body work is asked to hold.',
   6, true, '{chair}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('active_aging_and_balance', 'C', 4, 'strength', 'Dumbbell Sumo Squat', 'squat',
   'The main lift of Session C. Wide stance, so a stiff ankle is not the limiting factor. Wide stance squat under load. Inner thigh and glute, and less demand on the ankle than a narrow stance.',
   1, true, '{dumbbell}'::text[], 'beginner', true, false,
   2, 10, null, '2-0-2', 75, '{"3":{"sets":3}}'::jsonb),
  ('active_aging_and_balance', 'C', 5, 'strength', 'Farmers walk', 'carry',
   'Both dumbbells at once, one in each hand, not one side at a time. Grip, trunk and posture together, and almost impossible to do badly.',
   2, true, '{dumbbell}'::text[], 'intermediate', false, false,
   2, null, 30, null, 60, '{}'::jsonb),
  ('active_aging_and_balance', 'C', 6, 'strength', 'Dumbbell Shoulder Press', 'vertical_push',
   'Overhead strength. Kept short because it is the most demanding position on any of these lists.',
   3, true, '{dumbbell}'::text[], 'beginner', false, false,
   2, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('active_aging_and_balance', 'C', 7, 'strength', 'Staggered squats', 'squat',
   'One foot forward and left there. Single side work without asking anyone to balance on one leg yet. Marked per side: the whole set is completed on one side before the other.',
   4, true, '{}'::text[], 'beginner', false, true,
   2, 8, null, '2-0-2', 60, '{}'::jsonb),
  ('active_aging_and_balance', 'C', 8, 'core', 'Alternating Side Reaches', 'lateral_flexion',
   'Side of the trunk worked seated, one side then the other.',
   5, true, '{chair}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('gym_strength_foundation', 'A', 1, 'release', 'Cat cow pose', 'spinal',
   'Wake the spine up through flexion and extension before anything is loaded. Low effort on purpose.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('gym_strength_foundation', 'A', 2, 'mobility', 'Hip flexor stretch', 'hip_flexion',
   'Length at the front of the hip so the squat and the split stance can reach depth without the low back taking it. Marked per side: the whole set is completed on one side before the other.',
   8, true, '{}'::text[], 'beginner', false, true,
   2, null, 30, null, 15, '{}'::jsonb),
  ('gym_strength_foundation', 'A', 3, 'stability', 'Glute Bridge (Bodyweight)', 'hip_hinge',
   'Glute activation before the main lift, so the squat and the hinge are not driven by the quads alone.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('gym_strength_foundation', 'A', 4, 'strength', 'Leg Press', 'squat',
   'The main lift of Session A. Heavy leg work with the back supported and nothing to balance. The safest way to find a real load on a first gym program.',
   1, true, '{machine}'::text[], 'beginner', true, false,
   3, 10, null, '2-0-2', 90, '{"3":{"sets":4}}'::jsonb),
  ('gym_strength_foundation', 'A', 5, 'strength', 'Dumbbell Goblet Squat', 'squat',
   'Front loaded so the torso stays upright, which is what makes it the right first loaded squat.',
   2, true, '{dumbbell}'::text[], 'beginner', false, false,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('gym_strength_foundation', 'A', 6, 'strength', 'Seated Leg Curl', 'knee_flexion',
   'Hamstrings worked directly, seated. Balances a squat led day.',
   3, true, '{machine}'::text[], 'beginner', false, false,
   2, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('gym_strength_foundation', 'A', 7, 'strength', 'Chest Supported Row Machine', 'horizontal_pull',
   'The one exercise repeated across the week. Session C is the second go at it. Rowing with the chest supported, so the low back is not holding the position while the back does the work.',
   4, true, '{machine}'::text[], 'beginner', true, false,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('gym_strength_foundation', 'A', 8, 'core', 'Plank', 'anti_extension',
   'Hold the trunk still under fatigue. Timed, never a crunch.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 30, '{"3":{"hold_duration_seconds":40}}'::jsonb),
  ('gym_strength_foundation', 'A', 9, 'core', 'Dead Bug', 'anti_extension',
   'Trunk control with the arms and legs moving, lying on the back. Slow on purpose.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 8, null, '3-1-3', 30, '{}'::jsonb),
  ('gym_strength_foundation', 'B', 1, 'release', 'Arm swings', 'shoulder',
   'Blood into the shoulders and a first look at overhead range before anything presses.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('gym_strength_foundation', 'B', 2, 'mobility', 'Puppy pose', 'thoracic',
   'Upper back and lat length so the press comes from the shoulder rather than the low back.',
   8, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('gym_strength_foundation', 'B', 3, 'stability', 'Prone W to lifts', 'scapular',
   'Mid back switched on before the pull, so the row is not all biceps.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('gym_strength_foundation', 'B', 4, 'strength', 'Chest Press Machine flat', 'horizontal_push',
   'The main lift of Session B. Pressing on a fixed path, so the first heavy press does not also have to be a balancing act.',
   1, true, '{machine}'::text[], 'beginner', true, false,
   3, 10, null, '2-0-2', 90, '{"3":{"sets":4}}'::jsonb),
  ('gym_strength_foundation', 'B', 5, 'strength', 'Lat Pulldown', 'vertical_pull',
   'Overhead pulling at a load she chooses, which is the version of a pull up that is actually trainable today.',
   2, true, '{cable}'::text[], 'beginner', false, false,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('gym_strength_foundation', 'B', 6, 'strength', 'Machine Shoulder Press', 'vertical_push',
   'Overhead press on a fixed path, seated and supported.',
   3, true, '{machine}'::text[], 'beginner', false, false,
   2, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('gym_strength_foundation', 'B', 7, 'strength', 'Cable Rope Face Pull', 'scapular',
   'Upper back and back of the shoulder against a cable. The counterweight to every pressing movement in the week.',
   4, true, '{cable}'::text[], 'beginner', false, false,
   2, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('gym_strength_foundation', 'B', 8, 'core', 'Bird Dog', 'anti_rotation',
   'Trunk still while opposite limbs move. The rehearsal for holding position under the hinge, and the anti rotation work of the week.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('gym_strength_foundation', 'B', 9, 'core', 'Ab Bridge Complex', 'anti_extension',
   'Forearm bridge hold. Same job as a plank and materially easier to hold well.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, null, 20, null, 30, '{"3":{"hold_duration_seconds":30}}'::jsonb),
  ('gym_strength_foundation', 'C', 1, 'release', 'Child''s pose', 'spinal',
   'Settle the hips and the low back, and get the breathing slow, before the working sets.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('gym_strength_foundation', 'C', 2, 'mobility', 'Standing forward bend', 'hip_hinge',
   'Hamstring and posterior chain length before the hinge, standing so nobody has to get to the floor for it.',
   8, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('gym_strength_foundation', 'C', 3, 'stability', 'Fire Hydrant Circles', 'hip_rotation',
   'Hip abduction and rotation control, which is what sets knee tracking for everything on one leg. Marked per side: the whole set is completed on one side before the other.',
   7, true, '{}'::text[], 'beginner', false, true,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('gym_strength_foundation', 'C', 4, 'strength', 'Dumbbell Romanian Deadlift', 'hip_hinge',
   'The main lift of Session C. Hinge with a soft knee, stopped short of the point where the back rounds. The hamstring and glute lift of the week.',
   1, true, '{dumbbell}'::text[], 'intermediate', true, false,
   3, 8, null, '2-0-2', 90, '{"3":{"sets":4}}'::jsonb),
  ('gym_strength_foundation', 'C', 5, 'strength', 'Chest Supported Row Machine', 'horizontal_pull',
   'The week''s second go at the row, and the only exercise that appears twice. Rowing with the chest supported, so the low back is not holding the position while the back does the work.',
   2, true, '{machine}'::text[], 'beginner', true, false,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('gym_strength_foundation', 'C', 6, 'strength', 'Hip Thrust Machine', 'hip_hinge',
   'Glutes loaded directly with the back supported. Heavy hip extension with no demand on the low back.',
   3, true, '{machine}'::text[], 'beginner', false, false,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('gym_strength_foundation', 'C', 7, 'strength', 'Farmers walk', 'carry',
   'Both dumbbells at once, one in each hand, not one side at a time. Grip, trunk and posture together, and almost impossible to do badly.',
   4, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, null, 30, null, 60, '{}'::jsonb),
  ('gym_strength_foundation', 'C', 8, 'core', 'Reverse Plank', 'anti_flexion',
   'Back of the body under a hold, to balance the front loaded core work elsewhere in the week.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 20, null, 30, '{"3":{"hold_duration_seconds":30}}'::jsonb),
  ('gym_strength_foundation', 'C', 9, 'core', 'Arch Skydiver', 'anti_flexion',
   'Low back and glutes held in extension, face down. No spinal flexion anywhere in it.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('strong_after_40', 'A', 1, 'release', 'Cat cow pose', 'spinal',
   'Wake the spine up through flexion and extension before anything is loaded. Low effort on purpose.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('strong_after_40', 'A', 2, 'mobility', 'Hip flexor stretch', 'hip_flexion',
   'Length at the front of the hip so the squat and the split stance can reach depth without the low back taking it. Marked per side: the whole set is completed on one side before the other.',
   8, true, '{}'::text[], 'beginner', false, true,
   2, null, 30, null, 15, '{}'::jsonb),
  ('strong_after_40', 'A', 3, 'stability', 'Glute Bridge (Bodyweight)', 'hip_hinge',
   'Glute activation before the main lift, so the squat and the hinge are not driven by the quads alone.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('strong_after_40', 'A', 4, 'strength', 'Dumbbell Goblet Squat', 'squat',
   'The main lift of Session A. Front loaded so the torso stays upright, which is what makes it the right first loaded squat.',
   1, true, '{dumbbell}'::text[], 'beginner', true, false,
   3, 10, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('strong_after_40', 'A', 5, 'strength', 'Split Squat', 'lunge',
   'Stationary single side strength. Feet set and left there, every rep on one leg before switching. Split stance under load, stationary. Every rep on one leg before switching, no stepping. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'intermediate', true, true,
   3, 8, null, '2-0-2', 60, '{}'::jsonb),
  ('strong_after_40', 'A', 6, 'strength', 'Dumbbell Shoulder Press', 'vertical_push',
   'Overhead strength. Kept short because it is the most demanding position on any of these lists.',
   3, true, '{dumbbell}'::text[], 'beginner', false, false,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('strong_after_40', 'A', 7, 'strength', 'Dumbbel calf raises', 'ankle',
   'Calves under load. Weight bearing through the foot and ankle, which is the point of it here.',
   4, true, '{dumbbell}'::text[], 'beginner', false, false,
   2, 15, null, '2-0-2', 60, '{}'::jsonb),
  ('strong_after_40', 'A', 8, 'core', 'Plank', 'anti_extension',
   'Hold the trunk still under fatigue. Timed, never a crunch.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 30, '{"3":{"hold_duration_seconds":40}}'::jsonb),
  ('strong_after_40', 'A', 9, 'core', 'Dead Bug', 'anti_extension',
   'Trunk control with the arms and legs moving, lying on the back. Slow on purpose.',
   6, true, '{}'::text[], 'beginner', false, false,
   3, 8, null, '3-1-3', 30, '{}'::jsonb),
  ('strong_after_40', 'B', 1, 'release', 'Arm swings', 'shoulder',
   'Blood into the shoulders and a first look at overhead range before anything presses.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('strong_after_40', 'B', 2, 'mobility', 'Puppy pose', 'thoracic',
   'Upper back and lat length so the press comes from the shoulder rather than the low back.',
   8, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('strong_after_40', 'B', 3, 'stability', 'Prone W to lifts', 'scapular',
   'Mid back switched on before the pull, so the row is not all biceps.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('strong_after_40', 'B', 4, 'strength', 'Dumbbell floor chest press', 'horizontal_push',
   'The main lift of Session B. Floor press rather than bench: no bench needed, and the floor limits the range for a shoulder that is not ready for all of it.',
   1, true, '{dumbbell}'::text[], 'intermediate', true, false,
   3, 10, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('strong_after_40', 'B', 5, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The one exercise repeated across the week. Session C is the second go at it. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'beginner', true, true,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('strong_after_40', 'B', 6, 'strength', 'Reverse Fly', 'horizontal_pull',
   'Back of the shoulder, to balance the press. Light on purpose: this is about position, not load.',
   3, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('strong_after_40', 'B', 7, 'strength', 'Dumbbell Sumo Squat', 'squat',
   'Wide stance squat under load. Inner thigh and glute, and less demand on the ankle than a narrow stance.',
   4, true, '{dumbbell}'::text[], 'beginner', false, false,
   3, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('strong_after_40', 'B', 8, 'core', 'Bird Dog', 'anti_rotation',
   'Trunk still while opposite limbs move. The rehearsal for holding position under the hinge, and the anti rotation work of the week.',
   5, true, '{}'::text[], 'beginner', false, false,
   3, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('strong_after_40', 'B', 9, 'core', 'Ab Bridge Complex', 'anti_extension',
   'Forearm bridge hold. Same job as a plank and materially easier to hold well.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, null, 25, null, 30, '{"3":{"hold_duration_seconds":35}}'::jsonb),
  ('strong_after_40', 'C', 1, 'release', 'Child''s pose', 'spinal',
   'Settle the hips and the low back, and get the breathing slow, before the working sets.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('strong_after_40', 'C', 2, 'mobility', 'Standing forward bend', 'hip_hinge',
   'Hamstring and posterior chain length before the hinge, standing so nobody has to get to the floor for it.',
   8, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('strong_after_40', 'C', 3, 'stability', 'Fire Hydrant Circles', 'hip_rotation',
   'Hip abduction and rotation control, which is what sets knee tracking for everything on one leg. Marked per side: the whole set is completed on one side before the other.',
   7, true, '{}'::text[], 'beginner', false, true,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('strong_after_40', 'C', 4, 'strength', 'Dumbbell Romanian Deadlift', 'hip_hinge',
   'The main lift of Session C. Hinge with a soft knee, stopped short of the point where the back rounds. The hamstring and glute lift of the week.',
   1, true, '{dumbbell}'::text[], 'intermediate', true, false,
   3, 8, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('strong_after_40', 'C', 5, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The week''s second go at the row, and the only exercise that appears twice. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'beginner', true, true,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('strong_after_40', 'C', 6, 'strength', 'Dumbbell Step Ups', 'lunge',
   'Loaded step up. Single side strength with the load carried rather than balanced. Marked per side: the whole set is completed on one side before the other.',
   3, true, '{dumbbell}'::text[], 'intermediate', false, true,
   3, 8, null, '2-0-2', 60, '{}'::jsonb),
  ('strong_after_40', 'C', 7, 'strength', 'Farmers walk', 'carry',
   'Both dumbbells at once, one in each hand, not one side at a time. Grip, trunk and posture together, and almost impossible to do badly.',
   4, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, null, 40, null, 60, '{}'::jsonb),
  ('strong_after_40', 'C', 8, 'core', 'Reverse Plank', 'anti_flexion',
   'Back of the body under a hold, to balance the front loaded core work elsewhere in the week.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 25, null, 30, '{"3":{"hold_duration_seconds":35}}'::jsonb),
  ('strong_after_40', 'C', 9, 'core', 'Arch Skydiver', 'anti_flexion',
   'Low back and glutes held in extension, face down. No spinal flexion anywhere in it.',
   6, true, '{}'::text[], 'beginner', false, false,
   3, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('menopause_strength_foundation', 'A', 1, 'release', 'Cat cow pose', 'spinal',
   'Wake the spine up through flexion and extension before anything is loaded. Low effort on purpose.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('menopause_strength_foundation', 'A', 2, 'mobility', 'Hip flexor stretch', 'hip_flexion',
   'Length at the front of the hip so the squat and the split stance can reach depth without the low back taking it. Marked per side: the whole set is completed on one side before the other.',
   8, true, '{}'::text[], 'beginner', false, true,
   2, null, 30, null, 15, '{}'::jsonb),
  ('menopause_strength_foundation', 'A', 3, 'stability', 'Glute Bridge (Bodyweight)', 'hip_hinge',
   'Glute activation before the main lift, so the squat and the hinge are not driven by the quads alone.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('menopause_strength_foundation', 'A', 4, 'strength', 'Dumbbell Goblet Squat', 'squat',
   'The main lift of Session A. Front loaded so the torso stays upright, which is what makes it the right first loaded squat.',
   1, true, '{dumbbell}'::text[], 'beginner', true, false,
   3, 10, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('menopause_strength_foundation', 'A', 5, 'strength', 'Dumbbell Romanian Deadlift', 'hip_hinge',
   'Hinge with a soft knee, stopped short of the point where the back rounds. The hamstring and glute lift of the week.',
   2, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, 8, null, '2-0-2', 60, '{}'::jsonb),
  ('menopause_strength_foundation', 'A', 6, 'strength', 'Step-Ups (Bodyweight)', 'lunge',
   'One leg does the work, on a step, with the other foot available. Single side strength with a way out of it. Marked per side: the whole set is completed on one side before the other.',
   3, true, '{}'::text[], 'beginner', false, true,
   2, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('menopause_strength_foundation', 'A', 7, 'strength', 'Dumbbel calf raises', 'ankle',
   'Calves under load. Weight bearing through the foot and ankle, which is the point of it here.',
   4, true, '{dumbbell}'::text[], 'beginner', false, false,
   2, 15, null, '2-0-2', 60, '{}'::jsonb),
  ('menopause_strength_foundation', 'A', 8, 'core', 'Plank', 'anti_extension',
   'Hold the trunk still under fatigue. Timed, never a crunch.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 30, '{"3":{"hold_duration_seconds":40}}'::jsonb),
  ('menopause_strength_foundation', 'A', 9, 'core', 'Bird Dog', 'anti_rotation',
   'Trunk still while opposite limbs move. The rehearsal for holding position under the hinge, and the anti rotation work of the week.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('menopause_strength_foundation', 'B', 1, 'release', 'Arm swings', 'shoulder',
   'Blood into the shoulders and a first look at overhead range before anything presses.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('menopause_strength_foundation', 'B', 2, 'mobility', 'Puppy pose', 'thoracic',
   'Upper back and lat length so the press comes from the shoulder rather than the low back.',
   8, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('menopause_strength_foundation', 'B', 3, 'stability', 'Prone W to lifts', 'scapular',
   'Mid back switched on before the pull, so the row is not all biceps.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('menopause_strength_foundation', 'B', 4, 'strength', 'Dumbbell floor chest press', 'horizontal_push',
   'The main lift of Session B. Floor press rather than bench: no bench needed, and the floor limits the range for a shoulder that is not ready for all of it.',
   1, true, '{dumbbell}'::text[], 'intermediate', true, false,
   3, 10, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('menopause_strength_foundation', 'B', 5, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The one exercise repeated across the week. Session C is the second go at it. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'beginner', true, true,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('menopause_strength_foundation', 'B', 6, 'strength', 'Dumbbell Shoulder Press', 'vertical_push',
   'Overhead strength. Kept short because it is the most demanding position on any of these lists.',
   3, true, '{dumbbell}'::text[], 'beginner', false, false,
   2, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('menopause_strength_foundation', 'B', 7, 'strength', 'Reverse Fly', 'horizontal_pull',
   'Back of the shoulder, to balance the press. Light on purpose: this is about position, not load.',
   4, true, '{dumbbell}'::text[], 'intermediate', false, false,
   2, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('menopause_strength_foundation', 'B', 8, 'core', 'Dead Bug', 'anti_extension',
   'Trunk control with the arms and legs moving, lying on the back. Slow on purpose.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, 8, null, '3-1-3', 30, '{}'::jsonb),
  ('menopause_strength_foundation', 'B', 9, 'core', 'Ab Bridge Complex', 'anti_extension',
   'Forearm bridge hold. Same job as a plank and materially easier to hold well.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, null, 20, null, 30, '{"3":{"hold_duration_seconds":30}}'::jsonb),
  ('menopause_strength_foundation', 'C', 1, 'release', 'Child''s pose', 'spinal',
   'Settle the hips and the low back, and get the breathing slow, before the working sets.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('menopause_strength_foundation', 'C', 2, 'mobility', 'Standing forward bend', 'hip_hinge',
   'Hamstring and posterior chain length before the hinge, standing so nobody has to get to the floor for it.',
   8, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('menopause_strength_foundation', 'C', 3, 'stability', 'Clams side lying with knee lifts', 'hip_rotation',
   'Deep hip rotators, lying on the side, no balance demand at all. Marked per side: the whole set is completed on one side before the other.',
   7, true, '{}'::text[], 'beginner', false, true,
   2, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('menopause_strength_foundation', 'C', 4, 'strength', 'Dumbbell Sumo Squat', 'squat',
   'The main lift of Session C. Wide stance squat under load. Inner thigh and glute, and less demand on the ankle than a narrow stance.',
   1, true, '{dumbbell}'::text[], 'beginner', true, false,
   3, 12, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('menopause_strength_foundation', 'C', 5, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The week''s second go at the row, and the only exercise that appears twice. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'beginner', true, true,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('menopause_strength_foundation', 'C', 6, 'strength', 'Farmers walk', 'carry',
   'Both dumbbells at once, one in each hand, not one side at a time. Grip, trunk and posture together, and almost impossible to do badly.',
   3, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, null, 40, null, 60, '{}'::jsonb),
  ('menopause_strength_foundation', 'C', 7, 'strength', 'Split Squat', 'lunge',
   'Split stance under load, stationary. Every rep on one leg before switching, no stepping. Marked per side: the whole set is completed on one side before the other.',
   4, true, '{dumbbell}'::text[], 'intermediate', false, true,
   2, 8, null, '2-0-2', 60, '{}'::jsonb),
  ('menopause_strength_foundation', 'C', 8, 'core', 'Reverse Plank', 'anti_flexion',
   'Back of the body under a hold, to balance the front loaded core work elsewhere in the week.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 20, null, 30, '{"3":{"hold_duration_seconds":30}}'::jsonb),
  ('menopause_strength_foundation', 'C', 9, 'core', 'Arch Skydiver', 'anti_flexion',
   'Low back and glutes held in extension, face down. No spinal flexion anywhere in it.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'A', 1, 'release', 'Cat cow pose', 'spinal',
   'Wake the spine up through flexion and extension before anything is loaded. Low effort on purpose.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'A', 2, 'mobility', 'Hip flexor stretch', 'hip_flexion',
   'Length at the front of the hip so the squat and the split stance can reach depth without the low back taking it. Marked per side: the whole set is completed on one side before the other.',
   8, true, '{}'::text[], 'beginner', false, true,
   2, null, 30, null, 15, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'A', 3, 'stability', 'Glute Bridge (Bodyweight)', 'hip_hinge',
   'Glute activation before the main lift, so the squat and the hinge are not driven by the quads alone.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'A', 4, 'strength', 'Dumbbell Goblet Squat', 'squat',
   'The main lift of Session A. Front loaded so the torso stays upright, which is what makes it the right first loaded squat.',
   1, true, '{dumbbell}'::text[], 'beginner', true, false,
   3, 12, null, '2-0-2', 60, '{"3":{"sets":4}}'::jsonb),
  ('low_impact_strength_and_conditioning', 'A', 5, 'strength', 'Split Squat', 'lunge',
   'Split stance under load, stationary. Every rep on one leg before switching, no stepping. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'intermediate', false, true,
   3, 8, null, '2-0-2', 45, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'A', 6, 'strength', 'Wall Sit', 'squat',
   'A quiet isometric for the quads with the back supported. Load without any coordination demand.',
   3, true, '{wall}'::text[], 'beginner', false, false,
   2, null, 40, null, 45, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'A', 7, 'strength', 'Dumbbell Shoulder Press', 'vertical_push',
   'Overhead strength. Kept short because it is the most demanding position on any of these lists.',
   4, true, '{dumbbell}'::text[], 'beginner', false, false,
   3, 10, null, '2-0-2', 45, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'A', 8, 'core', 'Plank', 'anti_extension',
   'Hold the trunk still under fatigue. Timed, never a crunch.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 30, '{"3":{"hold_duration_seconds":40}}'::jsonb),
  ('low_impact_strength_and_conditioning', 'A', 9, 'core', 'Dead Bug', 'anti_extension',
   'Trunk control with the arms and legs moving, lying on the back. Slow on purpose.',
   6, true, '{}'::text[], 'beginner', false, false,
   3, 8, null, '3-1-3', 30, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'B', 1, 'release', 'Arm swings', 'shoulder',
   'Blood into the shoulders and a first look at overhead range before anything presses.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'B', 2, 'mobility', 'Puppy pose', 'thoracic',
   'Upper back and lat length so the press comes from the shoulder rather than the low back.',
   8, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'B', 3, 'stability', 'Prone W to lifts', 'scapular',
   'Mid back switched on before the pull, so the row is not all biceps.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'B', 4, 'strength', 'Dumbbell floor chest press', 'horizontal_push',
   'The main lift of Session B. Floor press rather than bench: no bench needed, and the floor limits the range for a shoulder that is not ready for all of it.',
   1, true, '{dumbbell}'::text[], 'intermediate', true, false,
   3, 12, null, '2-0-2', 60, '{"3":{"sets":4}}'::jsonb),
  ('low_impact_strength_and_conditioning', 'B', 5, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The one exercise repeated across the week. Session C is the second go at it. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'beginner', true, true,
   3, 12, null, '2-0-2', 45, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'B', 6, 'strength', 'Dumbbell Sumo Squat', 'squat',
   'Wide stance squat under load. Inner thigh and glute, and less demand on the ankle than a narrow stance.',
   3, true, '{dumbbell}'::text[], 'beginner', false, false,
   3, 15, null, '2-0-2', 45, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'B', 7, 'strength', 'Reverse Fly', 'horizontal_pull',
   'Back of the shoulder, to balance the press. Light on purpose: this is about position, not load.',
   4, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, 12, null, '2-0-2', 45, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'B', 8, 'core', 'Bird Dog', 'anti_rotation',
   'Trunk still while opposite limbs move. The rehearsal for holding position under the hinge, and the anti rotation work of the week.',
   5, true, '{}'::text[], 'beginner', false, false,
   3, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'B', 9, 'core', 'Ab Bridge Complex', 'anti_extension',
   'Forearm bridge hold. Same job as a plank and materially easier to hold well.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, null, 25, null, 30, '{"3":{"hold_duration_seconds":35}}'::jsonb),
  ('low_impact_strength_and_conditioning', 'C', 1, 'release', 'Child''s pose', 'spinal',
   'Settle the hips and the low back, and get the breathing slow, before the working sets.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'C', 2, 'mobility', 'Standing forward bend', 'hip_hinge',
   'Hamstring and posterior chain length before the hinge, standing so nobody has to get to the floor for it.',
   8, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'C', 3, 'stability', 'Fire Hydrant Circles', 'hip_rotation',
   'Hip abduction and rotation control, which is what sets knee tracking for everything on one leg. Marked per side: the whole set is completed on one side before the other.',
   7, true, '{}'::text[], 'beginner', false, true,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'C', 4, 'strength', 'Dumbbell Romanian Deadlift', 'hip_hinge',
   'The main lift of Session C. Hinge with a soft knee, stopped short of the point where the back rounds. The hamstring and glute lift of the week.',
   1, true, '{dumbbell}'::text[], 'intermediate', true, false,
   3, 10, null, '2-0-2', 60, '{"3":{"sets":4}}'::jsonb),
  ('low_impact_strength_and_conditioning', 'C', 5, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The week''s second go at the row, and the only exercise that appears twice. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'beginner', true, true,
   3, 12, null, '2-0-2', 45, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'C', 6, 'strength', 'Farmers walk', 'carry',
   'Both dumbbells at once, one in each hand, not one side at a time. Grip, trunk and posture together, and almost impossible to do badly.',
   3, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, null, 45, null, 45, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'C', 7, 'strength', 'Step-Ups (Bodyweight)', 'lunge',
   'One leg does the work, on a step, with the other foot available. Single side strength with a way out of it. Marked per side: the whole set is completed on one side before the other.',
   4, true, '{}'::text[], 'beginner', false, true,
   3, 10, null, '2-0-2', 45, '{}'::jsonb),
  ('low_impact_strength_and_conditioning', 'C', 8, 'core', 'Reverse Plank', 'anti_flexion',
   'Back of the body under a hold, to balance the front loaded core work elsewhere in the week.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 25, null, 30, '{"3":{"hold_duration_seconds":35}}'::jsonb),
  ('low_impact_strength_and_conditioning', 'C', 9, 'core', 'Arch Skydiver', 'anti_flexion',
   'Low back and glutes held in extension, face down. No spinal flexion anywhere in it.',
   6, true, '{}'::text[], 'beginner', false, false,
   3, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('energy_and_recovery_movement_plan', 'A', 1, 'release', 'Cat cow pose', 'spinal',
   'Wake the spine up through flexion and extension before anything is loaded. Low effort on purpose.',
   8, true, '{}'::text[], 'beginner', false, false,
   1, null, 90, null, 15, '{}'::jsonb),
  ('energy_and_recovery_movement_plan', 'A', 2, 'mobility', 'Hip flexor stretch', 'hip_flexion',
   'Length at the front of the hip so the squat and the split stance can reach depth without the low back taking it. Marked per side: the whole set is completed on one side before the other.',
   7, true, '{}'::text[], 'beginner', false, true,
   2, null, 45, null, 15, '{}'::jsonb),
  ('energy_and_recovery_movement_plan', 'A', 3, 'stability', 'Glute Bridge (Bodyweight)', 'hip_hinge',
   'Glute activation before the main lift, so the squat and the hinge are not driven by the quads alone.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('energy_and_recovery_movement_plan', 'A', 4, 'strength', 'Dumbbell Goblet Squat', 'squat',
   'The main lift of Session A, run slowly on purpose. Front loaded so the torso stays upright, which is what makes it the right first loaded squat.',
   1, true, '{dumbbell}'::text[], 'beginner', true, false,
   2, 10, null, '3-1-3', 90, '{"3":{"sets":3}}'::jsonb),
  ('energy_and_recovery_movement_plan', 'A', 5, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The one exercise repeated across the week. Session B is the second go at it. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'beginner', true, true,
   2, 10, null, '3-1-3', 90, '{}'::jsonb),
  ('energy_and_recovery_movement_plan', 'A', 6, 'strength', 'Dumbbell Shoulder Press', 'vertical_push',
   'Overhead strength. Kept short because it is the most demanding position on any of these lists.',
   3, true, '{dumbbell}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 90, '{}'::jsonb),
  ('energy_and_recovery_movement_plan', 'A', 7, 'core', 'Dead Bug', 'anti_extension',
   'Trunk control with the arms and legs moving, lying on the back. Slow on purpose.',
   4, true, '{}'::text[], 'beginner', false, false,
   2, 8, null, '3-1-3', 30, '{}'::jsonb),
  ('energy_and_recovery_movement_plan', 'A', 8, 'core', 'Ab Bridge Complex', 'anti_extension',
   'Forearm bridge hold. Same job as a plank and materially easier to hold well.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 20, null, 30, '{"3":{"hold_duration_seconds":30}}'::jsonb),
  ('energy_and_recovery_movement_plan', 'B', 1, 'release', 'Child''s pose', 'spinal',
   'Settle the hips and the low back, and get the breathing slow, before the working sets.',
   8, true, '{}'::text[], 'beginner', false, false,
   1, null, 90, null, 15, '{}'::jsonb),
  ('energy_and_recovery_movement_plan', 'B', 2, 'mobility', 'Happy baby pose', 'hip_flexion',
   'Hips and low back released lying down, with the breathing slow. Costs nothing and asks for nothing.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, null, 45, null, 15, '{}'::jsonb),
  ('energy_and_recovery_movement_plan', 'B', 3, 'stability', 'Prone W to lifts', 'scapular',
   'Mid back switched on before the pull, so the row is not all biceps.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('energy_and_recovery_movement_plan', 'B', 4, 'strength', 'Dumbbell Romanian Deadlift', 'hip_hinge',
   'The main lift of Session B, run slowly on purpose. Hinge with a soft knee, stopped short of the point where the back rounds. The hamstring and glute lift of the week.',
   1, true, '{dumbbell}'::text[], 'intermediate', true, false,
   2, 8, null, '3-1-3', 90, '{"3":{"sets":3}}'::jsonb),
  ('energy_and_recovery_movement_plan', 'B', 5, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The week''s second go at the row, and the only exercise that appears twice. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'beginner', true, true,
   2, 10, null, '3-1-3', 90, '{}'::jsonb),
  ('energy_and_recovery_movement_plan', 'B', 6, 'strength', 'Bodyweight Split Squat', 'lunge',
   'Split stance, feet set and left there, every rep on one leg before switching. No stepping in or out. Marked per side: the whole set is completed on one side before the other.',
   3, true, '{}'::text[], 'intermediate', false, true,
   2, 8, null, '3-1-3', 90, '{}'::jsonb),
  ('energy_and_recovery_movement_plan', 'B', 7, 'core', 'Plank', 'anti_extension',
   'Hold the trunk still under fatigue. Timed, never a crunch.',
   4, true, '{}'::text[], 'beginner', false, false,
   2, null, 25, null, 30, '{"3":{"hold_duration_seconds":35}}'::jsonb),
  ('energy_and_recovery_movement_plan', 'B', 8, 'core', 'Reverse Plank', 'anti_flexion',
   'Back of the body under a hold, to balance the front loaded core work elsewhere in the week.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 20, null, 30, '{"3":{"hold_duration_seconds":30}}'::jsonb),
  ('bone_balance_and_strength_support', 'A', 1, 'release', 'Cat cow pose', 'spinal',
   'Wake the spine up through flexion and extension before anything is loaded. Low effort on purpose.',
   8, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('bone_balance_and_strength_support', 'A', 2, 'mobility', 'Hip flexor stretch', 'hip_flexion',
   'Length at the front of the hip so the squat and the split stance can reach depth without the low back taking it. Marked per side: the whole set is completed on one side before the other.',
   7, true, '{}'::text[], 'beginner', false, true,
   2, null, 30, null, 15, '{}'::jsonb),
  ('bone_balance_and_strength_support', 'A', 3, 'stability', 'Glute Bridge (Bodyweight)', 'hip_hinge',
   'Glute activation before the main lift, so the squat and the hinge are not driven by the quads alone.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('bone_balance_and_strength_support', 'A', 4, 'strength', 'Dumbbell Goblet Squat', 'squat',
   'The main lift of Session A, and the loading movement of the week. Front loaded so the torso stays upright, which is what makes it the right first loaded squat.',
   1, true, '{dumbbell}'::text[], 'beginner', true, false,
   3, 10, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('bone_balance_and_strength_support', 'A', 5, 'strength', 'Dumbbell Romanian Deadlift', 'hip_hinge',
   'Hinge with a soft knee, stopped short of the point where the back rounds. The hamstring and glute lift of the week.',
   2, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, 8, null, '2-0-2', 60, '{}'::jsonb),
  ('bone_balance_and_strength_support', 'A', 6, 'strength', 'Dumbbel calf raises', 'ankle',
   'Calves under load. Weight bearing through the foot and ankle, which is the point of it here.',
   3, true, '{dumbbell}'::text[], 'beginner', false, false,
   3, 15, null, '2-0-2', 60, '{}'::jsonb),
  ('bone_balance_and_strength_support', 'A', 7, 'core', 'Plank', 'anti_extension',
   'Hold the trunk still under fatigue. Timed, never a crunch.',
   4, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 30, '{"3":{"hold_duration_seconds":40}}'::jsonb),
  ('bone_balance_and_strength_support', 'A', 8, 'core', 'Dead Bug', 'anti_extension',
   'Trunk control with the arms and legs moving, lying on the back. Slow on purpose.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, 8, null, '3-1-3', 30, '{}'::jsonb),
  ('bone_balance_and_strength_support', 'B', 1, 'release', 'Arm swings', 'shoulder',
   'Blood into the shoulders and a first look at overhead range before anything presses.',
   8, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('bone_balance_and_strength_support', 'B', 2, 'mobility', 'Lateral leg swing', 'hip_abduction',
   'Hip opened side to side with a chair to hold. Prepares the sideways direction most days never use. Marked per side: the whole set is completed on one side before the other.',
   7, true, '{chair}'::text[], 'beginner', false, true,
   2, 10, null, null, 15, '{}'::jsonb),
  ('bone_balance_and_strength_support', 'B', 3, 'stability', 'Banded Lateral Walks', 'hip_abduction',
   'Side of the hip under real resistance, standing. Loads the muscle that holds the pelvis level while walking.',
   6, true, '{band}'::text[], 'beginner', false, false,
   2, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('bone_balance_and_strength_support', 'B', 4, 'strength', 'Step ups', 'lunge',
   'The main movement of Session B. Stepping up onto a box, one leg at a time. The stair pattern, trained on purpose. Marked per side: the whole set is completed on one side before the other.',
   1, true, '{box}'::text[], 'beginner', true, true,
   3, 8, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('bone_balance_and_strength_support', 'B', 5, 'strength', 'Single-Leg Step Balance', 'balance',
   'The balance slot of the week. Trained with a step to touch down onto, never tested without one. Time on one leg, in front of a step, with something to touch down onto. Balance trained rather than tested. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{box}'::text[], 'beginner', true, true,
   3, null, 20, null, 45, '{"3":{"hold_duration_seconds":30}}'::jsonb),
  ('bone_balance_and_strength_support', 'B', 6, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The one exercise repeated across the week. Session C is the second go at it. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   3, true, '{dumbbell}'::text[], 'beginner', true, true,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('bone_balance_and_strength_support', 'B', 7, 'core', 'Bird Dog', 'anti_rotation',
   'Trunk still while opposite limbs move. The rehearsal for holding position under the hinge, and the anti rotation work of the week.',
   4, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('bone_balance_and_strength_support', 'B', 8, 'core', 'Ab Bridge Complex', 'anti_extension',
   'Forearm bridge hold. Same job as a plank and materially easier to hold well.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 20, null, 30, '{"3":{"hold_duration_seconds":30}}'::jsonb),
  ('bone_balance_and_strength_support', 'C', 1, 'release', 'Child''s pose', 'spinal',
   'Settle the hips and the low back, and get the breathing slow, before the working sets.',
   8, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('bone_balance_and_strength_support', 'C', 2, 'mobility', 'Standing forward bend', 'hip_hinge',
   'Hamstring and posterior chain length before the hinge, standing so nobody has to get to the floor for it.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('bone_balance_and_strength_support', 'C', 3, 'stability', 'Prone W to lifts', 'scapular',
   'Mid back switched on before the pull, so the row is not all biceps.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('bone_balance_and_strength_support', 'C', 4, 'strength', 'Dumbbell Sumo Squat', 'squat',
   'The main lift of Session C. Wide stance squat under load. Inner thigh and glute, and less demand on the ankle than a narrow stance.',
   1, true, '{dumbbell}'::text[], 'beginner', true, false,
   3, 12, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('bone_balance_and_strength_support', 'C', 5, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The week''s second go at the row, and the only exercise that appears twice. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'beginner', true, true,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('bone_balance_and_strength_support', 'C', 6, 'strength', 'Farmers walk', 'carry',
   'Both dumbbells at once, one in each hand, not one side at a time. Grip, trunk and posture together, and almost impossible to do badly.',
   3, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, null, 40, null, 60, '{}'::jsonb),
  ('bone_balance_and_strength_support', 'C', 7, 'core', 'Reverse Plank', 'anti_flexion',
   'Back of the body under a hold, to balance the front loaded core work elsewhere in the week.',
   4, true, '{}'::text[], 'beginner', false, false,
   2, null, 20, null, 30, '{"3":{"hold_duration_seconds":30}}'::jsonb),
  ('bone_balance_and_strength_support', 'C', 8, 'core', 'Arch Skydiver', 'anti_flexion',
   'Low back and glutes held in extension, face down. No spinal flexion anywhere in it.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('desk_worker_movement_reset', 'A', 1, 'release', 'Cat cow pose', 'spinal',
   'Wake the spine up through flexion and extension before anything is loaded. Low effort on purpose.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('desk_worker_movement_reset', 'A', 2, 'mobility', 'Hip flexor stretch', 'hip_flexion',
   'Length at the front of the hip so the squat and the split stance can reach depth without the low back taking it. Marked per side: the whole set is completed on one side before the other.',
   8, true, '{}'::text[], 'beginner', false, true,
   2, null, 30, null, 15, '{}'::jsonb),
  ('desk_worker_movement_reset', 'A', 3, 'stability', 'Glute Bridge (Bodyweight)', 'hip_hinge',
   'Glute activation before the main lift, so the squat and the hinge are not driven by the quads alone.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('desk_worker_movement_reset', 'A', 4, 'strength', 'Bodyweight Squat', 'squat',
   'The main movement of Session A. The squat with nothing in the hands, so depth and knee tracking are the only things being asked for.',
   1, true, '{}'::text[], 'beginner', true, false,
   3, 12, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('desk_worker_movement_reset', 'A', 5, 'strength', 'Bodyweight Split Squat', 'lunge',
   'Split stance, feet set and left there, every rep on one leg before switching. No stepping in or out. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{}'::text[], 'intermediate', false, true,
   3, 8, null, '2-0-2', 60, '{}'::jsonb),
  ('desk_worker_movement_reset', 'A', 6, 'strength', 'Resistance Band Row', 'horizontal_pull',
   'The one exercise repeated across the week. Session C is the second go at it, because pull volume is what this population is short of. Rowing with the torso upright and no weight to hold. The pull pattern at its lowest cost.',
   3, true, '{band}'::text[], 'beginner', true, false,
   3, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('desk_worker_movement_reset', 'A', 7, 'strength', 'Reverse Snow Angels', 'scapular',
   'Upper back and lower traps worked lying face down. No equipment, and nothing to balance.',
   4, true, '{}'::text[], 'beginner', false, false,
   3, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('desk_worker_movement_reset', 'A', 8, 'core', 'Dead Bug', 'anti_extension',
   'Trunk control with the arms and legs moving, lying on the back. Slow on purpose.',
   5, true, '{}'::text[], 'beginner', false, false,
   3, 8, null, '3-1-3', 30, '{}'::jsonb),
  ('desk_worker_movement_reset', 'A', 9, 'core', 'Plank', 'anti_extension',
   'Hold the trunk still under fatigue. Timed, never a crunch.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 30, '{"3":{"hold_duration_seconds":40}}'::jsonb),
  ('desk_worker_movement_reset', 'B', 1, 'release', 'Arm swings', 'shoulder',
   'Blood into the shoulders and a first look at overhead range before anything presses.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('desk_worker_movement_reset', 'B', 2, 'mobility', 'Slingshot into T-Spine rotation', 'thoracic_rotation',
   'Rotation through the upper back rather than the low back. The range a rotational sport and a desk both depend on. Marked per side: the whole set is completed on one side before the other.',
   8, true, '{}'::text[], 'intermediate', false, true,
   2, 8, null, null, 15, '{}'::jsonb),
  ('desk_worker_movement_reset', 'B', 3, 'stability', 'Prone W to lifts', 'scapular',
   'Mid back switched on before the pull, so the row is not all biceps.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('desk_worker_movement_reset', 'B', 4, 'strength', 'Inclined push up', 'horizontal_push',
   'The main movement of Session B. Push up with the hands raised. Lower the surface and it gets harder, which is a progression she owns.',
   1, true, '{}'::text[], 'beginner', true, false,
   3, 10, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('desk_worker_movement_reset', 'B', 5, 'strength', 'Scapula push ups', 'scapular',
   'Shoulder blades moving on the ribcage with the arms straight. Small range, and it is the range a desk takes away.',
   2, true, '{}'::text[], 'intermediate', false, false,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('desk_worker_movement_reset', 'B', 6, 'strength', 'Superman extensions', 'anti_flexion',
   'Back of the body worked lying face down. Balances a week of sitting and a week of pressing.',
   3, true, '{}'::text[], 'intermediate', false, false,
   3, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('desk_worker_movement_reset', 'B', 7, 'strength', 'Step-Ups (Bodyweight)', 'lunge',
   'One leg does the work, on a step, with the other foot available. Single side strength with a way out of it. Marked per side: the whole set is completed on one side before the other.',
   4, true, '{}'::text[], 'beginner', false, true,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('desk_worker_movement_reset', 'B', 8, 'core', 'Bird Dog', 'anti_rotation',
   'Trunk still while opposite limbs move. The rehearsal for holding position under the hinge, and the anti rotation work of the week.',
   5, true, '{}'::text[], 'beginner', false, false,
   3, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('desk_worker_movement_reset', 'B', 9, 'core', 'Ab Bridge Complex', 'anti_extension',
   'Forearm bridge hold. Same job as a plank and materially easier to hold well.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, null, 25, null, 30, '{"3":{"hold_duration_seconds":35}}'::jsonb),
  ('desk_worker_movement_reset', 'C', 1, 'release', 'Child''s pose', 'spinal',
   'Settle the hips and the low back, and get the breathing slow, before the working sets.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('desk_worker_movement_reset', 'C', 2, 'mobility', 'Puppy pose', 'thoracic',
   'Upper back and lat length so the press comes from the shoulder rather than the low back.',
   8, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('desk_worker_movement_reset', 'C', 3, 'stability', 'Fire Hydrant Circles', 'hip_rotation',
   'Hip abduction and rotation control, which is what sets knee tracking for everything on one leg. Marked per side: the whole set is completed on one side before the other.',
   7, true, '{}'::text[], 'beginner', false, true,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('desk_worker_movement_reset', 'C', 4, 'strength', 'Sumo squats', 'squat',
   'The main movement of Session C. Wide stance squat, no load. Less ankle range needed than a narrow squat, more inner thigh and glute.',
   1, true, '{}'::text[], 'beginner', true, false,
   3, 15, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('desk_worker_movement_reset', 'C', 5, 'strength', 'Resistance Band Row', 'horizontal_pull',
   'The week''s second go at the row, and the only exercise that appears twice. Rowing with the torso upright and no weight to hold. The pull pattern at its lowest cost.',
   2, true, '{band}'::text[], 'beginner', true, false,
   3, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('desk_worker_movement_reset', 'C', 6, 'strength', 'Reverse Lunges', 'lunge',
   'Step back rather than forward, which is easier on the knee for most people starting out. Marked per side: the whole set is completed on one side before the other.',
   3, true, '{}'::text[], 'beginner', false, true,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('desk_worker_movement_reset', 'C', 7, 'strength', 'Wall Push Ups', 'horizontal_push',
   'The push up at the easiest angle there is. Distance from the wall is the whole progression.',
   4, true, '{wall}'::text[], 'beginner', false, false,
   3, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('desk_worker_movement_reset', 'C', 8, 'core', 'Arch Skydiver', 'anti_flexion',
   'Low back and glutes held in extension, face down. No spinal flexion anywhere in it.',
   5, true, '{}'::text[], 'beginner', false, false,
   3, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('desk_worker_movement_reset', 'C', 9, 'core', 'Reverse Plank', 'anti_flexion',
   'Back of the body under a hold, to balance the front loaded core work elsewhere in the week.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, null, 20, null, 30, '{"3":{"hold_duration_seconds":30}}'::jsonb),
  ('busy_parent_three_day_plan', 'A', 1, 'release', 'Cat cow pose', 'spinal',
   'Wake the spine up through flexion and extension before anything is loaded. Low effort on purpose.',
   7, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('busy_parent_three_day_plan', 'A', 2, 'stability', 'Glute Bridge (Bodyweight)', 'hip_hinge',
   'Glute activation before the main lift, so the squat and the hinge are not driven by the quads alone.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('busy_parent_three_day_plan', 'A', 3, 'strength', 'Dumbbell Goblet Squat', 'squat',
   'The main lift of Session A. Front loaded so the torso stays upright, which is what makes it the right first loaded squat.',
   1, true, '{dumbbell}'::text[], 'beginner', true, false,
   3, 10, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('busy_parent_three_day_plan', 'A', 4, 'strength', 'Dumbbell floor chest press', 'horizontal_push',
   'Floor press rather than bench: no bench needed, and the floor limits the range for a shoulder that is not ready for all of it.',
   2, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('busy_parent_three_day_plan', 'A', 5, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The one exercise repeated across the week. Session B is the second go at it. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   3, true, '{dumbbell}'::text[], 'beginner', true, true,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('busy_parent_three_day_plan', 'A', 6, 'strength', 'Dumbbell Rear Lunge', 'lunge',
   'Loaded step back. Easier on the knee than a forward lunge, and it teaches control of the descent. Marked per side: the whole set is completed on one side before the other.',
   4, true, '{dumbbell}'::text[], 'intermediate', false, true,
   2, 8, null, '2-0-2', 60, '{}'::jsonb),
  ('busy_parent_three_day_plan', 'A', 7, 'core', 'Plank', 'anti_extension',
   'Hold the trunk still under fatigue. Timed, never a crunch.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 30, '{"3":{"hold_duration_seconds":40}}'::jsonb),
  ('busy_parent_three_day_plan', 'B', 1, 'release', 'Arm swings', 'shoulder',
   'Blood into the shoulders and a first look at overhead range before anything presses.',
   7, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('busy_parent_three_day_plan', 'B', 2, 'mobility', 'Hip flexor stretch', 'hip_flexion',
   'Length at the front of the hip so the squat and the split stance can reach depth without the low back taking it. Marked per side: the whole set is completed on one side before the other.',
   6, true, '{}'::text[], 'beginner', false, true,
   2, null, 30, null, 15, '{}'::jsonb),
  ('busy_parent_three_day_plan', 'B', 3, 'strength', 'Dumbbell Romanian Deadlift', 'hip_hinge',
   'The main lift of Session B. Hinge with a soft knee, stopped short of the point where the back rounds. The hamstring and glute lift of the week.',
   1, true, '{dumbbell}'::text[], 'intermediate', true, false,
   3, 8, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('busy_parent_three_day_plan', 'B', 4, 'strength', 'Dumbbell Shoulder Press', 'vertical_push',
   'Overhead strength. Kept short because it is the most demanding position on any of these lists.',
   2, true, '{dumbbell}'::text[], 'beginner', false, false,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('busy_parent_three_day_plan', 'B', 5, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The week''s second go at the row, and the only exercise that appears twice. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   3, true, '{dumbbell}'::text[], 'beginner', true, true,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('busy_parent_three_day_plan', 'B', 6, 'strength', 'Dumbbell Sumo Squat', 'squat',
   'Wide stance squat under load. Inner thigh and glute, and less demand on the ankle than a narrow stance.',
   4, true, '{dumbbell}'::text[], 'beginner', false, false,
   3, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('busy_parent_three_day_plan', 'B', 7, 'core', 'Dead Bug', 'anti_extension',
   'Trunk control with the arms and legs moving, lying on the back. Slow on purpose.',
   5, true, '{}'::text[], 'beginner', false, false,
   3, 8, null, '3-1-3', 30, '{}'::jsonb),
  ('busy_parent_three_day_plan', 'C', 1, 'release', 'Child''s pose', 'spinal',
   'Settle the hips and the low back, and get the breathing slow, before the working sets.',
   7, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('busy_parent_three_day_plan', 'C', 2, 'stability', 'Prone W to lifts', 'scapular',
   'Mid back switched on before the pull, so the row is not all biceps.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('busy_parent_three_day_plan', 'C', 3, 'strength', 'Split Squat', 'lunge',
   'The main lift of Session C. Stationary, every rep on one leg before switching. Split stance under load, stationary. Every rep on one leg before switching, no stepping. Marked per side: the whole set is completed on one side before the other.',
   1, true, '{dumbbell}'::text[], 'intermediate', true, true,
   3, 8, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('busy_parent_three_day_plan', 'C', 4, 'strength', 'Farmers walk', 'carry',
   'Both dumbbells at once, one in each hand, not one side at a time. Grip, trunk and posture together, and almost impossible to do badly.',
   2, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, null, 40, null, 60, '{}'::jsonb),
  ('busy_parent_three_day_plan', 'C', 5, 'strength', 'Inclined push up', 'horizontal_push',
   'Push up with the hands raised. Lower the surface and it gets harder, which is a progression she owns.',
   3, true, '{}'::text[], 'beginner', false, false,
   3, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('busy_parent_three_day_plan', 'C', 6, 'strength', 'Reverse Fly', 'horizontal_pull',
   'Back of the shoulder, to balance the press. Light on purpose: this is about position, not load.',
   4, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('busy_parent_three_day_plan', 'C', 7, 'core', 'Bird Dog', 'anti_rotation',
   'Trunk still while opposite limbs move. The rehearsal for holding position under the hinge, and the anti rotation work of the week.',
   5, true, '{}'::text[], 'beginner', false, false,
   3, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('low_stress_training_week', 'A', 1, 'release', 'Child''s pose', 'spinal',
   'Settle the hips and the low back, and get the breathing slow, before the working sets.',
   8, true, '{}'::text[], 'beginner', false, false,
   1, null, 90, null, 15, '{}'::jsonb),
  ('low_stress_training_week', 'A', 2, 'mobility', 'Reclined butterfly', 'hip_external_rotation',
   'Hips open, lying down, nothing to hold. A settling position as much as a stretch.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, null, 45, null, 15, '{}'::jsonb),
  ('low_stress_training_week', 'A', 3, 'stability', 'Glute Bridge (Bodyweight)', 'hip_hinge',
   'Glute activation before the main lift, so the squat and the hinge are not driven by the quads alone.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('low_stress_training_week', 'A', 4, 'strength', 'Dumbbell Goblet Squat', 'squat',
   'The main lift of Session A. Front loaded so the torso stays upright, which is what makes it the right first loaded squat.',
   1, true, '{dumbbell}'::text[], 'beginner', true, false,
   2, 10, null, '3-1-3', 90, '{"3":{"sets":3}}'::jsonb),
  ('low_stress_training_week', 'A', 5, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The one exercise repeated across the week. Session B is the second go at it. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'beginner', true, true,
   2, 10, null, '3-1-3', 90, '{}'::jsonb),
  ('low_stress_training_week', 'A', 6, 'strength', 'Bodyweight Split Squat', 'lunge',
   'Split stance, feet set and left there, every rep on one leg before switching. No stepping in or out. Marked per side: the whole set is completed on one side before the other.',
   3, true, '{}'::text[], 'intermediate', false, true,
   2, 8, null, '3-1-3', 90, '{}'::jsonb),
  ('low_stress_training_week', 'A', 7, 'core', 'Dead Bug', 'anti_extension',
   'Trunk control with the arms and legs moving, lying on the back. Slow on purpose.',
   4, true, '{}'::text[], 'beginner', false, false,
   2, 8, null, '3-1-3', 30, '{}'::jsonb),
  ('low_stress_training_week', 'A', 8, 'core', 'Ab Bridge Complex', 'anti_extension',
   'Forearm bridge hold. Same job as a plank and materially easier to hold well.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 20, null, 30, '{"3":{"hold_duration_seconds":30}}'::jsonb),
  ('low_stress_training_week', 'B', 1, 'release', 'Cat cow pose', 'spinal',
   'Wake the spine up through flexion and extension before anything is loaded. Low effort on purpose.',
   8, true, '{}'::text[], 'beginner', false, false,
   1, null, 90, null, 15, '{}'::jsonb),
  ('low_stress_training_week', 'B', 2, 'mobility', 'Happy baby pose', 'hip_flexion',
   'Hips and low back released lying down, with the breathing slow. Costs nothing and asks for nothing.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, null, 45, null, 15, '{}'::jsonb),
  ('low_stress_training_week', 'B', 3, 'stability', 'Prone W to lifts', 'scapular',
   'Mid back switched on before the pull, so the row is not all biceps.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('low_stress_training_week', 'B', 4, 'strength', 'Dumbbell Romanian Deadlift', 'hip_hinge',
   'The main lift of Session B. Hinge with a soft knee, stopped short of the point where the back rounds. The hamstring and glute lift of the week.',
   1, true, '{dumbbell}'::text[], 'intermediate', true, false,
   2, 8, null, '3-1-3', 90, '{"3":{"sets":3}}'::jsonb),
  ('low_stress_training_week', 'B', 5, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The week''s second go at the row, and the only exercise that appears twice. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'beginner', true, true,
   2, 10, null, '3-1-3', 90, '{}'::jsonb),
  ('low_stress_training_week', 'B', 6, 'strength', 'Dumbbell Shoulder Press', 'vertical_push',
   'Overhead strength. Kept short because it is the most demanding position on any of these lists.',
   3, true, '{dumbbell}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 90, '{}'::jsonb),
  ('low_stress_training_week', 'B', 7, 'core', 'Plank', 'anti_extension',
   'Hold the trunk still under fatigue. Timed, never a crunch.',
   4, true, '{}'::text[], 'beginner', false, false,
   2, null, 25, null, 30, '{"3":{"hold_duration_seconds":35}}'::jsonb),
  ('low_stress_training_week', 'B', 8, 'core', 'Reverse Plank', 'anti_flexion',
   'Back of the body under a hold, to balance the front loaded core work elsewhere in the week.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 20, null, 30, '{"3":{"hold_duration_seconds":30}}'::jsonb),
  ('travel_and_hotel_program', 'A', 1, 'release', 'Cat cow pose', 'spinal',
   'Wake the spine up through flexion and extension before anything is loaded. Low effort on purpose.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('travel_and_hotel_program', 'A', 2, 'mobility', 'Hip flexor stretch', 'hip_flexion',
   'Length at the front of the hip so the squat and the split stance can reach depth without the low back taking it. Marked per side: the whole set is completed on one side before the other.',
   8, true, '{}'::text[], 'beginner', false, true,
   2, null, 30, null, 15, '{}'::jsonb),
  ('travel_and_hotel_program', 'A', 3, 'stability', 'Glute Bridge (Bodyweight)', 'hip_hinge',
   'Glute activation before the main lift, so the squat and the hinge are not driven by the quads alone.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('travel_and_hotel_program', 'A', 4, 'strength', 'Bodyweight Squat', 'squat',
   'The main movement of Session A, and the session that needs no equipment at all. The squat with nothing in the hands, so depth and knee tracking are the only things being asked for.',
   1, true, '{}'::text[], 'beginner', true, false,
   3, 15, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('travel_and_hotel_program', 'A', 5, 'strength', 'Bodyweight Split Squat', 'lunge',
   'Split stance, feet set and left there, every rep on one leg before switching. No stepping in or out. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{}'::text[], 'intermediate', false, true,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('travel_and_hotel_program', 'A', 6, 'strength', 'Inclined push up', 'horizontal_push',
   'Push up with the hands raised. Lower the surface and it gets harder, which is a progression she owns.',
   3, true, '{}'::text[], 'beginner', false, false,
   3, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('travel_and_hotel_program', 'A', 7, 'strength', 'Reverse Snow Angels', 'scapular',
   'Upper back and lower traps worked lying face down. No equipment, and nothing to balance.',
   4, true, '{}'::text[], 'beginner', false, false,
   3, 15, null, '2-0-2', 60, '{}'::jsonb),
  ('travel_and_hotel_program', 'A', 8, 'core', 'Plank', 'anti_extension',
   'Hold the trunk still under fatigue. Timed, never a crunch.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 35, null, 30, '{"3":{"hold_duration_seconds":45}}'::jsonb),
  ('travel_and_hotel_program', 'A', 9, 'core', 'Dead Bug', 'anti_extension',
   'Trunk control with the arms and legs moving, lying on the back. Slow on purpose.',
   6, true, '{}'::text[], 'beginner', false, false,
   3, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('travel_and_hotel_program', 'B', 1, 'release', 'Arm swings', 'shoulder',
   'Blood into the shoulders and a first look at overhead range before anything presses.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('travel_and_hotel_program', 'B', 2, 'mobility', 'Puppy pose', 'thoracic',
   'Upper back and lat length so the press comes from the shoulder rather than the low back.',
   8, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('travel_and_hotel_program', 'B', 3, 'stability', 'Prone W to lifts', 'scapular',
   'Mid back switched on before the pull, so the row is not all biceps.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('travel_and_hotel_program', 'B', 4, 'strength', 'Dumbbell Goblet Squat', 'squat',
   'The main lift of Session B. Front loaded so the torso stays upright, which is what makes it the right first loaded squat.',
   1, true, '{dumbbell}'::text[], 'beginner', true, false,
   3, 10, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('travel_and_hotel_program', 'B', 5, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The one exercise repeated across the week. Session C is the second go at it. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'beginner', true, true,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('travel_and_hotel_program', 'B', 6, 'strength', 'Dumbbell floor chest press', 'horizontal_push',
   'Floor press rather than bench: no bench needed, and the floor limits the range for a shoulder that is not ready for all of it.',
   3, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('travel_and_hotel_program', 'B', 7, 'strength', 'Dumbbell Shoulder Press', 'vertical_push',
   'Overhead strength. Kept short because it is the most demanding position on any of these lists.',
   4, true, '{dumbbell}'::text[], 'beginner', false, false,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('travel_and_hotel_program', 'B', 8, 'core', 'Bird Dog', 'anti_rotation',
   'Trunk still while opposite limbs move. The rehearsal for holding position under the hinge, and the anti rotation work of the week.',
   5, true, '{}'::text[], 'beginner', false, false,
   3, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('travel_and_hotel_program', 'B', 9, 'core', 'Ab Bridge Complex', 'anti_extension',
   'Forearm bridge hold. Same job as a plank and materially easier to hold well.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, null, 25, null, 30, '{"3":{"hold_duration_seconds":35}}'::jsonb),
  ('travel_and_hotel_program', 'C', 1, 'release', 'Child''s pose', 'spinal',
   'Settle the hips and the low back, and get the breathing slow, before the working sets.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('travel_and_hotel_program', 'C', 2, 'mobility', 'Standing forward bend', 'hip_hinge',
   'Hamstring and posterior chain length before the hinge, standing so nobody has to get to the floor for it.',
   8, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('travel_and_hotel_program', 'C', 3, 'stability', 'Fire Hydrant Circles', 'hip_rotation',
   'Hip abduction and rotation control, which is what sets knee tracking for everything on one leg. Marked per side: the whole set is completed on one side before the other.',
   7, true, '{}'::text[], 'beginner', false, true,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('travel_and_hotel_program', 'C', 4, 'strength', 'Dumbbell Romanian Deadlift', 'hip_hinge',
   'The main lift of Session C. Hinge with a soft knee, stopped short of the point where the back rounds. The hamstring and glute lift of the week.',
   1, true, '{dumbbell}'::text[], 'intermediate', true, false,
   3, 8, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('travel_and_hotel_program', 'C', 5, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The week''s second go at the row, and the only exercise that appears twice. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'beginner', true, true,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('travel_and_hotel_program', 'C', 6, 'strength', 'Step-Ups (Bodyweight)', 'lunge',
   'One leg does the work, on a step, with the other foot available. Single side strength with a way out of it. Marked per side: the whole set is completed on one side before the other.',
   3, true, '{}'::text[], 'beginner', false, true,
   3, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('travel_and_hotel_program', 'C', 7, 'strength', 'Farmers walk', 'carry',
   'Both dumbbells at once, one in each hand, not one side at a time. Grip, trunk and posture together, and almost impossible to do badly.',
   4, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, null, 40, null, 60, '{}'::jsonb),
  ('travel_and_hotel_program', 'C', 8, 'core', 'Reverse Plank', 'anti_flexion',
   'Back of the body under a hold, to balance the front loaded core work elsewhere in the week.',
   5, true, '{}'::text[], 'beginner', false, false,
   2, null, 25, null, 30, '{"3":{"hold_duration_seconds":35}}'::jsonb),
  ('travel_and_hotel_program', 'C', 9, 'core', 'Arch Skydiver', 'anti_flexion',
   'Low back and glutes held in extension, face down. No spinal flexion anywhere in it.',
   6, true, '{}'::text[], 'beginner', false, false,
   3, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('return_after_illness_or_extended_break', 'A', 1, 'release', 'Seated ankle circles', 'ankle',
   'Ankles first, seated. Everything that follows is done standing, and the ankle is where standing balance starts.',
   8, true, '{chair}'::text[], 'beginner', false, false,
   1, null, 45, null, 15, '{}'::jsonb),
  ('return_after_illness_or_extended_break', 'A', 2, 'mobility', 'Sitting Pelvic tilts', 'pelvic',
   'Find the two ends of the pelvis, seated. The reference point everything else in the session is held against.',
   7, true, '{chair}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('return_after_illness_or_extended_break', 'A', 3, 'stability', 'Goal Post Squeeze', 'scapular',
   'Shoulder blades set, seated. The position the upper body work is asked to hold.',
   6, true, '{chair}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('return_after_illness_or_extended_break', 'A', 4, 'strength', 'Narrow Squats with Chair', 'squat',
   'The main movement of Session A, and the one exercise repeated across the week: the sit to stand is what gives her the most back, so it is practised both days. Sit to stand with a chair behind. The most useful movement in the library for somebody rebuilding, and the safest way to load it.',
   1, true, '{chair}'::text[], 'beginner', true, false,
   2, 8, null, '2-0-2', 90, '{"3":{"sets":3}}'::jsonb),
  ('return_after_illness_or_extended_break', 'A', 5, 'strength', 'Wall Push Ups', 'horizontal_push',
   'The push up at the easiest angle there is. Distance from the wall is the whole progression.',
   2, true, '{wall}'::text[], 'beginner', false, false,
   2, 8, null, '2-0-2', 90, '{}'::jsonb),
  ('return_after_illness_or_extended_break', 'A', 6, 'strength', 'Resistance Band Row', 'horizontal_pull',
   'Rowing with the torso upright and no weight to hold. The pull pattern at its lowest cost.',
   3, true, '{band}'::text[], 'beginner', false, false,
   2, 10, null, '2-0-2', 90, '{}'::jsonb),
  ('return_after_illness_or_extended_break', 'A', 7, 'core', 'Dead Bug', 'anti_extension',
   'Trunk control with the arms and legs moving, lying on the back. Slow on purpose.',
   4, true, '{}'::text[], 'beginner', false, false,
   2, 6, null, '3-1-3', 30, '{}'::jsonb),
  ('return_after_illness_or_extended_break', 'A', 8, 'core', 'Chair Twists', 'rotation',
   'Rotation through the trunk, seated and controlled, with the hips staying put.',
   5, true, '{chair}'::text[], 'beginner', false, false,
   2, 8, null, '3-1-3', 30, '{}'::jsonb),
  ('return_after_illness_or_extended_break', 'B', 1, 'release', 'Head Turns Neck stretches', 'cervical',
   'Neck range, seated and slow. Cheap, and it is the first thing that stiffens after a spell of not moving.',
   8, true, '{chair}'::text[], 'beginner', false, false,
   1, null, 20, null, 15, '{}'::jsonb),
  ('return_after_illness_or_extended_break', 'B', 2, 'mobility', 'Psoas stretch', 'hip_flexion',
   'Front of the hip opened with a chair to hold, so balance is never the limiting factor. Marked per side: the whole set is completed on one side before the other.',
   7, true, '{chair}'::text[], 'beginner', false, true,
   2, null, 30, null, 15, '{}'::jsonb),
  ('return_after_illness_or_extended_break', 'B', 3, 'stability', 'Hip Abduction', 'hip_abduction',
   'Side of the hip switched on with a chair to hold. This is the muscle that keeps the pelvis level on one leg. Marked per side: the whole set is completed on one side before the other.',
   6, true, '{chair}'::text[], 'beginner', false, true,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('return_after_illness_or_extended_break', 'B', 4, 'strength', 'Narrow Squats with Chair', 'squat',
   'The one exercise repeated across the week, and deliberately so: the sit to stand is what gives her the most back, so it is practised both days. Sit to stand with a chair behind. The most useful movement in the library for somebody rebuilding, and the safest way to load it.',
   1, true, '{chair}'::text[], 'beginner', true, false,
   2, 8, null, '2-0-2', 90, '{"3":{"sets":3}}'::jsonb),
  ('return_after_illness_or_extended_break', 'B', 5, 'strength', 'Heel Raises toe raises', 'ankle',
   'Calves and shins, with a chair to hold. The ankle strength that stops a trip becoming a fall.',
   2, true, '{chair}'::text[], 'beginner', false, false,
   2, 12, null, '2-0-2', 90, '{}'::jsonb),
  ('return_after_illness_or_extended_break', 'B', 6, 'strength', 'Chair Leg Extension', 'knee_extension',
   'Quads worked seated, one leg at a time, with no weight through the joint at all. Marked per side: the whole set is completed on one side before the other.',
   3, true, '{chair}'::text[], 'beginner', false, true,
   2, 10, null, '2-0-2', 90, '{}'::jsonb),
  ('return_after_illness_or_extended_break', 'B', 7, 'core', 'Bird Dog', 'anti_rotation',
   'Trunk still while opposite limbs move. The rehearsal for holding position under the hinge, and the anti rotation work of the week.',
   4, true, '{}'::text[], 'beginner', false, false,
   2, 8, null, '3-1-3', 30, '{}'::jsonb),
  ('return_after_illness_or_extended_break', 'B', 8, 'core', 'Alternating Side Reaches', 'lateral_flexion',
   'Side of the trunk worked seated, one side then the other.',
   5, true, '{chair}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'A', 1, 'release', 'Cat cow pose', 'spinal',
   'Wake the spine up through flexion and extension before anything is loaded. Low effort on purpose.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'A', 2, 'mobility', 'Hip flexor stretch', 'hip_flexion',
   'Length at the front of the hip so the squat and the split stance can reach depth without the low back taking it. Marked per side: the whole set is completed on one side before the other.',
   8, true, '{}'::text[], 'beginner', false, true,
   2, null, 30, null, 15, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'A', 3, 'stability', 'Glute Bridge (Bodyweight)', 'hip_hinge',
   'Glute activation before the main lift, so the squat and the hinge are not driven by the quads alone.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, 12, null, '3-1-3', 30, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'A', 4, 'strength', 'Dumbbell Goblet Squat', 'squat',
   'The main lift of Session A, and the ground force movement of the week. Front loaded so the torso stays upright, which is what makes it the right first loaded squat.',
   1, true, '{dumbbell}'::text[], 'beginner', true, false,
   3, 10, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'A', 5, 'strength', 'Split Squat', 'lunge',
   'Split stance under load, stationary. Every rep on one leg before switching, no stepping. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'intermediate', false, true,
   3, 8, null, '2-0-2', 60, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'A', 6, 'strength', 'Dumbbell Romanian Deadlift', 'hip_hinge',
   'Hinge with a soft knee, stopped short of the point where the back rounds. The hamstring and glute lift of the week.',
   3, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, 8, null, '2-0-2', 60, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'A', 7, 'strength', 'Dumbbel calf raises', 'ankle',
   'Calves under load. Weight bearing through the foot and ankle, which is the point of it here.',
   4, true, '{dumbbell}'::text[], 'beginner', false, false,
   3, 15, null, '2-0-2', 60, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'A', 8, 'core', 'Bird Dog', 'anti_rotation',
   'Trunk still while opposite limbs move. The rehearsal for holding position under the hinge, and the anti rotation work of the week.',
   5, true, '{}'::text[], 'beginner', false, false,
   3, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'A', 9, 'core', 'Plank', 'anti_extension',
   'Hold the trunk still under fatigue. Timed, never a crunch.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 30, '{"3":{"hold_duration_seconds":40}}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'B', 1, 'release', 'Arm swings', 'shoulder',
   'Blood into the shoulders and a first look at overhead range before anything presses.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'B', 2, 'mobility', 'Slingshot into T-Spine rotation', 'thoracic_rotation',
   'Rotation through the upper back rather than the low back. The range a rotational sport and a desk both depend on. Marked per side: the whole set is completed on one side before the other.',
   8, true, '{}'::text[], 'intermediate', false, true,
   2, 8, null, null, 15, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'B', 3, 'stability', 'Prone W to lifts', 'scapular',
   'Mid back switched on before the pull, so the row is not all biceps.',
   7, true, '{}'::text[], 'beginner', false, false,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'B', 4, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The main lift of Session B, and the one exercise repeated across the week. Session C is the second go at it. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   1, true, '{dumbbell}'::text[], 'beginner', true, true,
   3, 10, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'B', 5, 'strength', 'Dumbbell floor chest press', 'horizontal_push',
   'Floor press rather than bench: no bench needed, and the floor limits the range for a shoulder that is not ready for all of it.',
   2, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'B', 6, 'strength', 'Dumbbell Shoulder Press', 'vertical_push',
   'Overhead strength. Kept short because it is the most demanding position on any of these lists.',
   3, true, '{dumbbell}'::text[], 'beginner', false, false,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'B', 7, 'strength', 'Reverse Fly', 'horizontal_pull',
   'Back of the shoulder, to balance the press. Light on purpose: this is about position, not load.',
   4, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, 12, null, '2-0-2', 60, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'B', 8, 'core', 'Dead Bug', 'anti_extension',
   'Trunk control with the arms and legs moving, lying on the back. Slow on purpose.',
   5, true, '{}'::text[], 'beginner', false, false,
   3, 8, null, '3-1-3', 30, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'B', 9, 'core', 'Ab Bridge Complex', 'anti_extension',
   'Forearm bridge hold. Same job as a plank and materially easier to hold well.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, null, 25, null, 30, '{"3":{"hold_duration_seconds":35}}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'C', 1, 'release', 'Child''s pose', 'spinal',
   'Settle the hips and the low back, and get the breathing slow, before the working sets.',
   9, true, '{}'::text[], 'beginner', false, false,
   1, null, 60, null, 15, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'C', 2, 'mobility', 'Standing forward bend', 'hip_hinge',
   'Hamstring and posterior chain length before the hinge, standing so nobody has to get to the floor for it.',
   8, true, '{}'::text[], 'beginner', false, false,
   2, null, 30, null, 15, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'C', 3, 'stability', 'Fire Hydrant Circles', 'hip_rotation',
   'Hip abduction and rotation control, which is what sets knee tracking for everything on one leg. Marked per side: the whole set is completed on one side before the other.',
   7, true, '{}'::text[], 'beginner', false, true,
   2, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'C', 4, 'strength', 'Dumbbell Sumo Squat', 'squat',
   'The main lift of Session C. Wide stance squat under load. Inner thigh and glute, and less demand on the ankle than a narrow stance.',
   1, true, '{dumbbell}'::text[], 'beginner', true, false,
   3, 12, null, '2-0-2', 75, '{"3":{"sets":4}}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'C', 5, 'strength', 'Single Arm Dumbbell Row', 'horizontal_pull',
   'The week''s second go at the row, and the only exercise that appears twice. One side at a time, so the stronger side cannot carry the weaker, and the torso is supported throughout. Marked per side: the whole set is completed on one side before the other.',
   2, true, '{dumbbell}'::text[], 'beginner', true, true,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'C', 6, 'strength', 'Farmers walk', 'carry',
   'Both dumbbells at once, one in each hand, not one side at a time. Grip, trunk and posture together, and almost impossible to do badly.',
   3, true, '{dumbbell}'::text[], 'intermediate', false, false,
   3, null, 40, null, 60, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'C', 7, 'strength', 'Step-Ups (Bodyweight)', 'lunge',
   'One leg does the work, on a step, with the other foot available. Single side strength with a way out of it. Marked per side: the whole set is completed on one side before the other.',
   4, true, '{}'::text[], 'beginner', false, true,
   3, 10, null, '2-0-2', 60, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'C', 8, 'core', 'Arch Skydiver', 'anti_flexion',
   'Low back and glutes held in extension, face down. No spinal flexion anywhere in it.',
   5, true, '{}'::text[], 'beginner', false, false,
   3, 10, null, '3-1-3', 30, '{}'::jsonb),
  ('golf_mobility_and_performance_foundation', 'C', 9, 'core', 'Reverse Plank', 'anti_flexion',
   'Back of the body under a hold, to balance the front loaded core work elsewhere in the week.',
   6, true, '{}'::text[], 'beginner', false, false,
   2, null, 25, null, 30, '{"3":{"hold_duration_seconds":35}}'::jsonb)
)
insert into program_blueprint_slots (
  program_version_id, session_designation, slot_order, block,
  movement_pattern, purpose, priority_rank, is_required,
  equipment_requirement, difficulty_tier, is_locked, is_per_side,
  sets, reps, hold_duration_seconds, tempo, rest_seconds, week_overrides,
  provider, external_id, exercise_name
)
select
  v.id,
  s.session_designation, s.slot_order, s.block,
  s.movement_pattern, s.purpose, s.priority_rank, s.is_required,
  s.equipment_requirement, s.difficulty_tier, s.is_locked, s.is_per_side,
  s.sets, s.reps, s.hold_duration_seconds, s.tempo, s.rest_seconds, s.week_overrides,
  c.provider, c.external_id, c.name
from slot_spec s
join movement_programs p on p.key = s.program_key
join movement_program_versions v on v.program_id = p.id and v.version_number = 1
join exercise_catalog c on c.name = s.exercise_name;

-- ============================================================================
-- 4) Assertions. Style: migrations 153, 174 and 175.
--
-- Scoped to THIS library's sixteen versions, except where a rule is a
-- whole-table one (client-assignable, contiguous ranks), which are checked
-- across every blueprint slot ever seeded so this migration also stands as
-- a guard for anything seeded before it.
-- ============================================================================
do $$
declare
  v_keys           text[] := array[
    'rebuild_your_foundation',
    'beginner_strength_and_stability',
    'back_to_exercise_reset',
    'active_aging_and_balance',
    'gym_strength_foundation',
    'strong_after_40',
    'menopause_strength_foundation',
    'low_impact_strength_and_conditioning',
    'energy_and_recovery_movement_plan',
    'bone_balance_and_strength_support',
    'desk_worker_movement_reset',
    'busy_parent_three_day_plan',
    'low_stress_training_week',
    'travel_and_hotel_program',
    'return_after_illness_or_extended_break',
    'golf_mobility_and_performance_foundation'
  ];
  v_programs       integer;
  v_versions       integer;
  v_slots          integer;
  v_unassignable   integer;
  v_bad_ranks      integer;
  v_bad_top_ranks  integer;
  v_bad_opener     integer;
  v_bad_strength   integer;
  v_bad_core       integer;
  v_bad_volume     integer;
  v_bad_weeks      integer;
  v_bad_fields     integer;
  v_no_progression integer;
  v_banned         integer;
  v_plumbing       integer;
  v_repeats        integer;
  v_shared_openers integer;
  v_home_gym       integer;
  v_row            record;
begin
  select count(*) into v_programs from movement_programs where key = any(v_keys);
  if v_programs <> 16 then
    raise exception 'program library: expected 16 programs, found %', v_programs;
  end if;

  select count(*) into v_versions
  from movement_program_versions v
  join movement_programs p on p.id = v.program_id
  where p.key = any(v_keys) and v.version_number = 1;
  if v_versions <> 16 then
    raise exception 'program library: expected 16 version 1 rows, found %', v_versions;
  end if;

  -- Every version is a draft, and no version claims an approver.
  if exists (
    select 1 from movement_program_versions v
    join movement_programs p on p.id = v.program_id
    where p.key = any(v_keys)
      and (v.status <> 'draft' or v.approved_at is not null or v.approved_by is not null)
  ) then
    raise exception 'program library: a seeded version is not an unapproved draft. Approval is performed by an administrator, never by this migration.';
  end if;

  -- Every version says how it progresses, and says linear.
  if exists (
    select 1 from movement_program_versions v
    join movement_programs p on p.id = v.program_id
    where p.key = any(v_keys) and v.periodization is distinct from 'linear'
  ) then
    raise exception 'program library: a version does not declare linear periodization';
  end if;

  -- Every slot in the spec found its exercise.
  select count(*) into v_slots
  from program_blueprint_slots s
  join movement_program_versions v on v.id = s.program_version_id
  join movement_programs p on p.id = v.program_id
  where p.key = any(v_keys);
  if v_slots <> 365 then
    raise exception
      'program library: expected 365 slots, found %. An exercise name did not match exercise_catalog, so the join silently dropped it.',
      v_slots;
  end if;

  -- Every session's slot count matches sessions_per_week.
  if exists (
    select 1
    from movement_program_versions v
    join movement_programs p on p.id = v.program_id
    join (
      select program_version_id, count(distinct session_designation) as sessions
      from program_blueprint_slots group by program_version_id
    ) g on g.program_version_id = v.id
    where p.key = any(v_keys) and g.sessions <> v.sessions_per_week
  ) then
    raise exception 'program library: a program authors a different number of weekly sessions from the one it advertises';
  end if;

  -- ------------------------------------------------------------------
  -- THE ONE RULE (migration 170), across the whole table.
  -- ------------------------------------------------------------------
  select count(*) into v_unassignable
  from program_blueprint_slots s
  left join exercise_catalog c
    on c.provider = s.provider and c.external_id = s.external_id
  where s.external_id is not null
    and (c.id is null or c.is_client_assignable is not true);
  if v_unassignable > 0 then
    for v_row in
      select s.session_designation, s.slot_order, s.exercise_name
      from program_blueprint_slots s
      left join exercise_catalog c
        on c.provider = s.provider and c.external_id = s.external_id
      where s.external_id is not null and (c.id is null or c.is_client_assignable is not true)
    loop
      raise warning '  slot % % points at a non-assignable exercise: %',
        v_row.session_designation, v_row.slot_order, v_row.exercise_name;
    end loop;
    raise exception
      'program library: % filled slot(s) point at an exercise with no video. A member may only be given an exercise she can be shown how to do (migration 170).',
      v_unassignable;
  end if;

  -- ------------------------------------------------------------------
  -- Ranks, across the whole table.
  -- ------------------------------------------------------------------
  select count(*) into v_bad_ranks
  from (
    select program_version_id, session_designation,
           count(*) as n, max(priority_rank) as hi, count(distinct priority_rank) as distinct_ranks
    from program_blueprint_slots
    group by program_version_id, session_designation
  ) g
  where g.n <> g.hi or g.n <> g.distinct_ranks;
  if v_bad_ranks > 0 then
    raise exception 'program library: % session(s) have priority ranks that are not unique and contiguous from 1', v_bad_ranks;
  end if;

  -- ------------------------------------------------------------------
  -- The MEF session shape, on this library's sixteen.
  -- ------------------------------------------------------------------
  select count(*) into v_bad_top_ranks
  from program_blueprint_slots s
  join movement_program_versions v on v.id = s.program_version_id
  join movement_programs p on p.id = v.program_id
  where p.key = any(v_keys) and s.priority_rank <= 5 and s.block not in ('strength', 'core');
  if v_bad_top_ranks > 0 then
    raise exception 'program library: % slot(s) in ranks 1 to 5 are neither strength nor core', v_bad_top_ranks;
  end if;

  select count(*) into v_bad_opener from (
    select 1
    from program_blueprint_slots s
    join movement_program_versions v on v.id = s.program_version_id
    join movement_programs p on p.id = v.program_id
    where p.key = any(v_keys) and s.block in ('release', 'mobility', 'stability')
    group by s.program_version_id, s.session_designation
    having count(*) > 3
  ) bad;
  if v_bad_opener > 0 then
    raise exception 'program library: % session(s) open with more than three movements', v_bad_opener;
  end if;

  select count(*) into v_bad_strength from (
    select 1
    from program_blueprint_slots s
    join movement_program_versions v on v.id = s.program_version_id
    join movement_programs p on p.id = v.program_id
    where p.key = any(v_keys) and s.block = 'strength'
    group by s.program_version_id, s.session_designation
    having count(*) < 3
  ) bad;
  if v_bad_strength > 0 then
    raise exception 'program library: % session(s) have fewer than three strength movements', v_bad_strength;
  end if;

  -- Strength and core together are at least five, which is what makes
  -- "ranks 1 to 5 are strength and core" satisfiable rather than lucky.
  select count(*) into v_bad_core from (
    select 1
    from program_blueprint_slots s
    join movement_program_versions v on v.id = s.program_version_id
    join movement_programs p on p.id = v.program_id
    where p.key = any(v_keys) and s.block in ('strength', 'core')
    group by s.program_version_id, s.session_designation
    having count(*) < 5
  ) bad;
  if v_bad_core > 0 then
    raise exception 'program library: % session(s) have fewer than five strength and core movements between them', v_bad_core;
  end if;

  -- ------------------------------------------------------------------
  -- A prescription is EITHER reps OR a hold, never both and never neither.
  -- ------------------------------------------------------------------
  select count(*) into v_bad_volume
  from program_blueprint_slots s
  join movement_program_versions v on v.id = s.program_version_id
  join movement_programs p on p.id = v.program_id
  where p.key = any(v_keys)
    and (s.sets is null or s.sets < 1
         or (s.reps is null) = (s.hold_duration_seconds is null));
  if v_bad_volume > 0 then
    raise exception 'program library: % slot(s) do not state sets plus exactly one of reps or a hold', v_bad_volume;
  end if;

  -- ------------------------------------------------------------------
  -- No loads, anywhere. A blueprint never prescribes a weight, and the
  -- slot table has no column for one; this asserts the equipment side of
  -- the same rule, that a home program never quietly needs a gym.
  -- ------------------------------------------------------------------
  select count(*) into v_home_gym
  from program_blueprint_slots s
  join movement_program_versions v on v.id = s.program_version_id
  join movement_programs p on p.id = v.program_id
  where p.key = any(v_keys)
    and v.equipment_mode = 'home'
    and s.equipment_requirement && '{barbell,machine,cable}'::text[];
  if v_home_gym > 0 then
    raise exception 'program library: % slot(s) in a home program require gym equipment', v_home_gym;
  end if;

  -- ------------------------------------------------------------------
  -- Week 3 is real, and names a week the program has.
  -- ------------------------------------------------------------------
  select count(*) into v_bad_weeks
  from program_blueprint_slots s
  join movement_program_versions v on v.id = s.program_version_id
  cross join lateral jsonb_object_keys(s.week_overrides) as k(week)
  where k.week !~ '^[0-9]+$'
     or k.week::int < 1
     or k.week::int > coalesce(v.duration_weeks, 0);
  if v_bad_weeks > 0 then
    raise exception 'program library: % per-week override(s) name a week outside the program''s own duration', v_bad_weeks;
  end if;

  -- Only the five fields a progression is allowed to change.
  select count(*) into v_bad_fields
  from program_blueprint_slots s,
       lateral jsonb_each(s.week_overrides) w(week, patch),
       lateral jsonb_object_keys(w.patch) f(field)
  where f.field not in ('sets', 'reps', 'hold_duration_seconds', 'tempo', 'rest_seconds');
  if v_bad_fields > 0 then
    raise exception 'program library: % week override(s) change a field a progression may not change', v_bad_fields;
  end if;

  -- Every session's main lift gains a set in week 3.
  select count(*) into v_no_progression from (
    select v.id, s.session_designation
    from program_blueprint_slots s
    join movement_program_versions v on v.id = s.program_version_id
    join movement_programs p on p.id = v.program_id
    where p.key = any(v_keys)
    group by v.id, s.session_designation
    having count(*) filter (
      where s.block = 'strength' and s.priority_rank = 1
        and (s.week_overrides -> '3' ->> 'sets')::int = s.sets + 1
    ) <> 1
  ) bad;
  if v_no_progression > 0 then
    raise exception 'program library: % session(s) do not add a set to their main lift in week 3', v_no_progression;
  end if;

  -- ------------------------------------------------------------------
  -- Exercises this library never uses, by name.
  -- ------------------------------------------------------------------
  select count(*) into v_banned
  from program_blueprint_slots s
  join movement_program_versions v on v.id = s.program_version_id
  join movement_programs p on p.id = v.program_id
  where p.key = any(v_keys)
    and (s.exercise_name ~* 'side ?plank'
      or s.exercise_name ~* 'bulgarian'
      or s.exercise_name ~* 'pistol'
      or s.exercise_name ~* 'two-?dumbbell row'
      or s.exercise_name ~* 'row two arm bent over'
      or s.exercise_name ~* 'bent over barbell row');
  if v_banned > 0 then
    raise exception 'program library: % slot(s) use an exercise this library excludes at every stage', v_banned;
  end if;

  -- ------------------------------------------------------------------
  -- No vendor plumbing in any name a member can read. The side is said by
  -- is_per_side, never by the name (migrations 182 and 183).
  -- ------------------------------------------------------------------
  select count(*) into v_plumbing
  from program_blueprint_slots s
  join movement_program_versions v on v.id = s.program_version_id
  join movement_programs p on p.id = v.program_id
  where p.key = any(v_keys)
    and (s.exercise_name ~* '\((l|r|left|right)\)'
      or s.exercise_name ~* ',\s*(left|right) side$'
      or s.exercise_name ~ ' - [0-9]+$');
  if v_plumbing > 0 then
    raise exception 'program library: % slot name(s) carry vendor plumbing', v_plumbing;
  end if;

  -- A carry uses both dumbbells at once, so it is never per side.
  if exists (
    select 1 from program_blueprint_slots s
    join movement_program_versions v on v.id = s.program_version_id
    join movement_programs p on p.id = v.program_id
    where p.key = any(v_keys) and s.movement_pattern = 'carry' and s.is_per_side
  ) then
    raise exception 'program library: a carry slot is marked per side. Carries use both dumbbells at once.';
  end if;

  -- ------------------------------------------------------------------
  -- At most one deliberate repeat per program, and no shared openers.
  -- ------------------------------------------------------------------
  select count(*) into v_repeats from (
    select v.id
    from program_blueprint_slots s
    join movement_program_versions v on v.id = s.program_version_id
    join movement_programs p on p.id = v.program_id
    where p.key = any(v_keys)
    group by v.id, s.external_id
    having count(distinct s.session_designation) > 1
  ) r
  group by r.id
  having count(*) > 1;
  if v_repeats is not null then
    raise exception 'program library: a program repeats more than one exercise across its sessions';
  end if;

  select count(*) into v_shared_openers from (
    select 1
    from program_blueprint_slots s
    join movement_program_versions v on v.id = s.program_version_id
    join movement_programs p on p.id = v.program_id
    where p.key = any(v_keys) and s.block in ('release', 'mobility', 'stability')
    group by v.id, s.external_id
    having count(distinct s.session_designation) > 1
  ) o;
  if v_shared_openers > 0 then
    raise exception 'program library: % opener exercise(s) are shared between two sessions of one program', v_shared_openers;
  end if;

  raise notice 'program library: 16 programs seeded as DRAFTS with % slots, linear periodization, every filled slot client-assignable', v_slots;
end
$$;
