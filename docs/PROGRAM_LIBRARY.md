# The MEF program library

Sixteen named programs, authored as data in migration `00000000000184_mef_program_library.sql` and approved through the administrator approval action on `/admin/blueprints`. This document is the full slot detail so the chat report and the admin screen do not have to be.

Everything here is generated from the same source the migration was generated from, so the tables below and the rows in the database cannot drift apart by transcription.

## What every program in this library obeys

| rule | how it is enforced |
| --- | --- |
| Opener of at most three preparation, mobility and activation movements | migration assertion, `tests/program-library.test.ts` |
| Strength the clear majority, then core; ranks 1 to 5 always strength or core | migration assertion, test |
| Video-backed, client-assignable exercises only | migration 170, migration assertion, test |
| Stationary single-leg work for beginner stages; no single-arm rows there either | test, per program below |
| No Side Plank, Bulgarian split squat, pistol squat or bent-over two-dumbbell row, at any stage | migration assertion, test |
| Per side said by the slot, never by the exercise name | migration assertion, test |
| Carries use both dumbbells at once, so they are never per side | migration assertion, test |
| At most one deliberately repeated exercise, and it says why | migration assertion, test |
| No two sessions of one program share an opener | migration assertion, test |
| No preset loads anywhere | the slot table has no load column; test asserts no override adds one |
| Linear periodization, and a real week 3 on every session | migration assertion, test |
| Member-facing text: no em dash, no clinical vocabulary, no treatment language | test |

## Dosing conventions

Where a slot says nothing, the corrective dosing table fills the gap at the general-population tier, exactly as it does for a generated program. These are the values this library states explicitly.

| block | member-facing section | default |
| --- | --- | --- |
| release | Preparation | 1 set, 45 to 90 second hold, 15 second rest |
| mobility | Mobility | 2 sets, 20 to 45 second hold, 15 second rest |
| stability | Activation | 2 sets, 10 to 12 reps, tempo 3-1-3, 30 second rest |
| strength | Strength | 2 to 3 sets, 8 to 15 reps, tempo 2-0-2, 45 to 90 second rest |
| core | Core | 2 to 3 sets, either 6 to 12 reps at tempo 3-1-3 or a 20 to 35 second hold, 30 second rest |

A prescription is either a rep count or a hold, never both. That is the same rule `movement_session_template_slots` enforces in the database and the same one the dosing table follows.

## The sixteen at a glance

| program | population | days | equipment | progression |
| --- | --- | --- | --- | --- |
| **Rebuild Your Foundation** | An adult starting or restarting deliberate exercise with no acute pain and no current corrective priority. | 2 | band, wall | linear: main lift gains a set in week 3, 2 core holds get longer |
| **Beginner Strength and Stability** | A beginner to early intermediate adult training three days a week at home, comfortable on the floor, ready to be given a number to progress. | 3 | box, dumbbell | linear: main lift gains a set in week 3, 3 core holds get longer |
| **Back-to-Exercise Reset** | An adult returning after six months or more away from deliberate training, with no acute pain and no current corrective priority. | 2 | band, wall | linear: main lift gains a set in week 3, 3 core holds get longer |
| **Active Aging and Balance** | Older adults training three days a week, with or without a balance concern, who can stand and walk unaided. | 3 | band, box, chair, dumbbell, wall | linear: main lift gains a set in week 3 |
| **Gym Strength Foundation** | A beginner to early intermediate adult with gym access, three days a week. | 3 | cable, dumbbell, machine | linear: main lift gains a set in week 3, 3 core holds get longer |
| **Strong After 40** | Women roughly 35 to 55 training three days a week at home with dumbbells, early intermediate stage, able to get down to and up from the floor unaided. | 3 | dumbbell | linear: main lift gains a set in week 3, 3 core holds get longer |
| **Menopause Strength Foundation** | Women in the perimenopausal or postmenopausal years training three days a week at home with dumbbells. | 3 | dumbbell | linear: main lift gains a set in week 3, 3 core holds get longer |
| **Low-Impact Strength and Conditioning** | Anybody who needs the training effect without impact: joint sensitivity, pelvic floor symptoms, a heavy standing job, or simply a downstairs neighbour. | 3 | dumbbell, wall | linear: main lift gains a set in week 3, 3 core holds get longer |
| **Energy and Recovery Movement Plan** | A member who is training but under-recovered, or coming off a demanding block, or in a period where a hard program would simply not get done. | 2 | dumbbell | linear: main lift gains a set in week 3, 3 core holds get longer |
| **Bone, Balance and Strength Support** | A member who wants loading and balance together: often, but not only, post-menopausal women and older adults. | 3 | band, box, chair, dumbbell | linear: main lift gains a set in week 3, 3 core holds get longer |
| **Desk Worker Movement Reset** | An adult in a seated job, three days a week, at home or in a hotel room, with a light resistance band. | 3 | band, wall | linear: main lift gains a set in week 3, 3 core holds get longer |
| **Busy Parent Three-Day Plan** | A parent or carer with real time pressure, three days a week, dumbbells at home. | 3 | dumbbell | linear: main lift gains a set in week 3, 1 core hold gets longer |
| **Low-Stress Training Week** | A member in a high stress period who wants to keep training rather than stop. | 2 | dumbbell | linear: main lift gains a set in week 3, 3 core holds get longer |
| **Travel and Hotel Program** | A member who travels regularly, three days a week, early intermediate stage. | 3 | dumbbell | linear: main lift gains a set in week 3, 3 core holds get longer |
| **Return After Illness or Extended Break** | A member returning after illness, surgery, hospitalisation or a very long lay-off, cleared to exercise, whose starting capacity is genuinely low. | 2 | band, chair, wall | linear: main lift gains a set in week 3 |
| **Golf Mobility and Performance Foundation** | A golfer or other rotational sport player, three days a week, dumbbells at home, early intermediate stage. | 3 | dumbbell | linear: main lift gains a set in week 3, 3 core holds get longer |

## Collection One: Foundations

### Rebuild Your Foundation

`rebuild_your_foundation` &middot; v1 &middot; 4 weeks &middot; 2 sessions a week &middot; home &middot; linear

**Equipment actually needed:** band, wall

**Member title:** Rebuild Your Foundation

**Member description:** A gentle four week start, twice a week. Each session opens with three short movements to get you ready, then three strength movements, then core. Nothing here is rushed, and nothing needs a gym. In week 3 the first strength movement of each session gains a set and the core holds get a little longer.

**Purpose (coach only):** The gentlest full body re-entry in the library that still deserves the word strength. Two sessions a week, both full body, both built on patterns rather than muscles: squat, push, pull, then trunk. Session A is squat and horizontal push led, Session B is single side and prone posterior led. Every strength slot is a movement she can regress by changing her own position rather than by changing the exercise.

**Intended for (coach only):** An adult starting or restarting deliberate exercise with no acute pain and no current corrective priority. Suits someone who has been walking but not training. Where a posture finding is driving the plan, the corrective program comes first and this is not a substitute for it.

**Cautions (coach only):** Reduce or skip anything that causes pain. Review before assigning to anyone with current low back, knee or shoulder pain. Four slots are floor based, so she needs to be able to get down to and up from the floor unaided; if she cannot, Active Aging and Balance is the better starting point. One slot asks for a light resistance band, which is the only piece of equipment in the program. Loads are not prescribed: the coach sets them at the first session.

**Repeated across the week:** nothing. Every exercise appears once.

#### Session A

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Cat cow pose | spinal | 8 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Hip flexor stretch | hip_flexion | 7 | yes | 2 x 30s, per side, rest 15s |  |  |
| 3 | Activation | Glute Bridge (Bodyweight) | hip_hinge | 6 |  | 2 x 12, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Bodyweight Squat | squat | 1 |  | 2 x 10, tempo 2-0-2, rest 75s | 3 sets | yes |
| 5 | Strength | Wall Push Ups | horizontal_push | 2 |  | 2 x 10, tempo 2-0-2, rest 60s |  |  |
| 6 | Strength | Resistance Band Row | horizontal_pull | 3 |  | 2 x 10, tempo 2-0-2, rest 60s |  |  |
| 7 | Core | Dead Bug | anti_extension | 4 |  | 2 x 8, tempo 3-1-3, rest 30s |  |  |
| 8 | Core | Ab Bridge Complex | anti_extension | 5 |  | 2 x 20s, rest 30s | 25s hold |  |

#### Session B

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Child's pose | spinal | 8 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Standing forward bend | hip_hinge | 7 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Prone W to lifts | scapular | 6 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Staggered squats | squat | 1 | yes | 2 x 8, per side, tempo 2-0-2, rest 75s | 3 sets | yes |
| 5 | Strength | Inclined push up | horizontal_push | 2 |  | 2 x 8, tempo 2-0-2, rest 60s |  |  |
| 6 | Strength | Reverse Snow Angels | scapular | 3 |  | 2 x 10, tempo 2-0-2, rest 60s |  |  |
| 7 | Core | Plank | anti_extension | 4 |  | 2 x 20s, rest 30s | 25s hold |  |
| 8 | Core | Arch Skydiver | anti_flexion | 5 |  | 2 x 8, tempo 3-1-3, rest 30s |  |  |

### Beginner Strength and Stability

`beginner_strength_and_stability` &middot; v1 &middot; 4 weeks &middot; 3 sessions a week &middot; home &middot; linear

**Equipment actually needed:** box, dumbbell

**Member title:** Beginner Strength and Stability

**Member description:** Four weeks, three sessions a week, at home. Each session is a short warm up, then four strength movements, then core. Session A uses your own bodyweight, Session B adds dumbbells, Session C works one side at a time and finishes with a carry. In week 3 the main lift of each session gains a set and the core holds get longer.

**Purpose (coach only):** The second rung after Rebuild Your Foundation. Bodyweight led, with dumbbells where they genuinely add something, so it can be run with or without them. Session A is bodyweight squat and push led, Session B is the dumbbell day, Session C is single side and carry led with a balance slot in it. Single Arm Dumbbell Row is the one exercise repeated across the week, so the pull gets practised twice.

**Intended for (coach only):** A beginner to early intermediate adult training three days a week at home, comfortable on the floor, ready to be given a number to progress. No acute pain and no current corrective priority.

**Cautions (coach only):** Reduce or skip anything that causes pain. Review before assigning to anyone with current low back, knee or shoulder pain. Several slots are floor based. One slot asks for a step or a bottom stair. Loads are not prescribed: the coach sets them at the first session.

**Repeated across the week:** Single Arm Dumbbell Row

#### Session A

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Cat cow pose | spinal | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Hip flexor stretch | hip_flexion | 8 | yes | 2 x 30s, per side, rest 15s |  |  |
| 3 | Activation | Glute Bridge (Bodyweight) | hip_hinge | 7 |  | 2 x 12, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Bodyweight Squat | squat | 1 |  | 3 x 10, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Step-Ups (Bodyweight) | lunge | 2 | yes | 2 x 8, per side, tempo 2-0-2, rest 60s |  |  |
| 6 | Strength | Inclined push up | horizontal_push | 3 |  | 2 x 10, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Reverse Snow Angels | scapular | 4 |  | 2 x 12, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Plank | anti_extension | 5 |  | 2 x 25s, rest 30s | 35s hold |  |
| 9 | Core | Dead Bug | anti_extension | 6 |  | 2 x 8, tempo 3-1-3, rest 30s |  |  |

#### Session B

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Arm swings | shoulder | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Puppy pose | thoracic | 8 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Prone W to lifts | scapular | 7 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell floor chest press | horizontal_push | 1 |  | 3 x 10, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Single Arm Dumbbell Row | horizontal_pull | 2 | yes | 3 x 10, per side, tempo 2-0-2, rest 60s |  | yes |
| 6 | Strength | Dumbbell Sumo Squat | squat | 3 |  | 2 x 12, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Dumbbell Shoulder Press | vertical_push | 4 |  | 2 x 10, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Bird Dog | anti_rotation | 5 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 9 | Core | Reverse Plank | anti_flexion | 6 |  | 2 x 20s, rest 30s | 30s hold |  |

#### Session C

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Child's pose | spinal | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Standing forward bend | hip_hinge | 8 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Fire Hydrant Circles | hip_rotation | 7 | yes | 2 x 10, per side, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Romanian Deadlift | hip_hinge | 1 |  | 3 x 8, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Bodyweight Split Squat | lunge | 2 | yes | 2 x 8, per side, tempo 2-0-2, rest 60s |  |  |
| 6 | Strength | Single Arm Dumbbell Row | horizontal_pull | 3 | yes | 3 x 10, per side, tempo 2-0-2, rest 60s |  | yes |
| 7 | Strength | Single-Leg Step Balance | balance | 4 | yes | 2 x 20s, per side, rest 30s |  |  |
| 8 | Core | Ab Bridge Complex | anti_extension | 5 |  | 2 x 20s, rest 30s | 30s hold |  |
| 9 | Core | Arch Skydiver | anti_flexion | 6 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |

### Back-to-Exercise Reset

`back_to_exercise_reset` &middot; v1 &middot; 4 weeks &middot; 2 sessions a week &middot; home &middot; linear

**Equipment actually needed:** band, wall

**Member title:** Back-to-Exercise Reset

**Member description:** Four weeks, twice a week, for coming back after a long time away. Session A relearns the shapes you use every day, Session B adds a little more work to them. Short warm up, three strength movements, then core. In week 3 the first strength movement of each session gains a set and the core holds get longer.

**Purpose (coach only):** For somebody who has trained before and stopped for a long time. The job is pattern recall and connective tissue tolerance, not stimulus, so volume is low and every movement is one she has done before. Session A teaches the squat, the step and the push at their easiest honest version; Session B repeats the patterns with more range and more reps. Deliberately two days: the third day is what gets skipped and then the program gets abandoned.

**Intended for (coach only):** An adult returning after six months or more away from deliberate training, with no acute pain and no current corrective priority. Not for somebody returning from illness or surgery, who should be given Return After Illness or Extended Break instead.

**Cautions (coach only):** Reduce or skip anything that causes pain. Expect delayed soreness in weeks 1 and 2 and say so before she starts. Review before assigning to anyone with current low back, knee or shoulder pain. Several slots are floor based. One slot asks for a light resistance band. Loads are not prescribed: the coach sets them at the first session.

**Repeated across the week:** nothing. Every exercise appears once.

#### Session A

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Cat cow pose | spinal | 8 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Hip hinge | hip_hinge | 7 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Glute Bridge (Bodyweight) | hip_hinge | 6 |  | 2 x 12, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Bodyweight Squat | squat | 1 |  | 2 x 10, tempo 2-0-2, rest 75s | 3 sets | yes |
| 5 | Strength | Step-Ups (Bodyweight) | lunge | 2 | yes | 2 x 8, per side, tempo 2-0-2, rest 60s |  |  |
| 6 | Strength | Wall Push Ups | horizontal_push | 3 |  | 2 x 10, tempo 2-0-2, rest 60s |  |  |
| 7 | Core | Dead Bug | anti_extension | 4 |  | 2 x 8, tempo 3-1-3, rest 30s |  |  |
| 8 | Core | Ab Bridge Complex | anti_extension | 5 |  | 2 x 20s, rest 30s | 25s hold |  |

#### Session B

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Child's pose | spinal | 8 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Standing forward bend | hip_hinge | 7 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Prone W to lifts | scapular | 6 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Sumo squats | squat | 1 |  | 2 x 12, tempo 2-0-2, rest 75s | 3 sets | yes |
| 5 | Strength | Resistance Band Row | horizontal_pull | 2 |  | 2 x 12, tempo 2-0-2, rest 60s |  |  |
| 6 | Strength | Inclined push up | horizontal_push | 3 |  | 2 x 8, tempo 2-0-2, rest 60s |  |  |
| 7 | Core | Plank | anti_extension | 4 |  | 2 x 20s, rest 30s | 25s hold |  |
| 8 | Core | Reverse Plank | anti_flexion | 5 |  | 2 x 15s, rest 30s | 20s hold |  |

### Active Aging and Balance

`active_aging_and_balance` &middot; v1 &middot; 4 weeks &middot; 3 sessions a week &middot; home &middot; linear

**Equipment actually needed:** band, box, chair, dumbbell, wall

**Member title:** Active Aging and Balance

**Member description:** Four weeks, three sessions a week, with a chair for support wherever you want it. Session A is sitting and standing, Session B is time on one leg, Session C adds weight in your hands. Every session ends with trunk work you can do from a chair. In week 3 the first strength movement of each session gains a set.

**Purpose (coach only):** Balance and single leg strength for an older adult, built inside beginner stage rules: everything on one leg is stationary or supported, and nothing steps, hops or jumps. Session A is the sit to stand and the ankle, Session B is time on one leg with a step, Session C is loaded with light dumbbells including a carry. Not one slot in the program requires getting down to or up from the floor, which is a deliberate constraint rather than a coincidence.

**Intended for (coach only):** Older adults training three days a week, with or without a balance concern, who can stand and walk unaided. Beginner stage throughout, whatever her training history, because the stability demand rather than the load is what is being managed here.

**Cautions (coach only):** Reduce or skip anything that causes pain. A sturdy chair that does not slide must be available for every session, and she should be told to use it rather than to prove she does not need it. Review before assigning to anyone with a fall in the last twelve months, current dizziness, or a medication review pending, and consider running Session B with a second person present in week 1. The step used in Session B should be a low, fixed step, not a stool. Loads are not prescribed: the coach sets them at the first session and they should start lighter than she expects.

**Repeated across the week:** nothing. Every exercise appears once.

#### Session A

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Seated ankle circles | ankle | 8 |  | 1 x 45s, rest 15s |  |  |
| 2 | Mobility | Psoas stretch | hip_flexion | 7 | yes | 2 x 30s, per side, rest 15s |  |  |
| 3 | Activation | Sitting Pelvic tilts | pelvic | 6 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Narrow Squats with Chair | squat | 1 |  | 2 x 10, tempo 2-0-2, rest 75s | 3 sets | yes |
| 5 | Strength | Heel Raises toe raises | ankle | 2 |  | 2 x 12, tempo 2-0-2, rest 60s |  |  |
| 6 | Strength | Chair Leg Extension | knee_extension | 3 | yes | 2 x 10, per side, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Resistance Band Row | horizontal_pull | 4 |  | 2 x 12, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Chair Twists | rotation | 5 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |

#### Session B

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Arm swings | shoulder | 8 |  | 1 x 45s, rest 15s |  |  |
| 2 | Mobility | Lateral leg swing | hip_abduction | 7 | yes | 2 x 10, per side, rest 15s |  |  |
| 3 | Activation | Hip Abduction | hip_abduction | 6 | yes | 2 x 10, per side, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Step ups | lunge | 1 | yes | 2 x 8, per side, tempo 2-0-2, rest 75s | 3 sets | yes |
| 5 | Strength | Single-Leg Step Balance | balance | 2 | yes | 2 x 20s, per side, rest 45s |  |  |
| 6 | Strength | Wall Push Ups | horizontal_push | 3 |  | 2 x 10, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Banded Lateral Walks | hip_abduction | 4 |  | 2 x 12, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Half Roll Backs | anti_flexion | 5 |  | 2 x 8, tempo 3-1-3, rest 30s |  |  |

#### Session C

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Seated Side Bends | lateral_flexion | 8 |  | 2 x 30s, rest 15s |  |  |
| 2 | Mobility | Head Turns Neck stretches | cervical | 7 |  | 2 x 20s, rest 15s |  |  |
| 3 | Activation | Goal Post Squeeze | scapular | 6 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Sumo Squat | squat | 1 |  | 2 x 10, tempo 2-0-2, rest 75s | 3 sets | yes |
| 5 | Strength | Farmers walk | carry | 2 |  | 2 x 30s, rest 60s |  |  |
| 6 | Strength | Dumbbell Shoulder Press | vertical_push | 3 |  | 2 x 10, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Staggered squats | squat | 4 | yes | 2 x 8, per side, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Alternating Side Reaches | lateral_flexion | 5 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |

### Gym Strength Foundation

`gym_strength_foundation` &middot; v1 &middot; 4 weeks &middot; 3 sessions a week &middot; gym &middot; linear

**Equipment actually needed:** cable, dumbbell, machine

**Member title:** Gym Strength Foundation

**Member description:** Four weeks, three sessions a week, in a gym. Session A is legs, Session B is upper body, Session C is hips, back and a carry. Most of the strength work is on machines to begin with, so you can find a real weight without also having to balance it. In week 3 the main lift of each session gains a set and the core holds get longer.

**Purpose (coach only):** A first gym program. Machine and cable led on purpose: the limiting factor for a new gym member is confidence and setup time, not stimulus, and a fixed path lets her find a genuinely challenging load in week 1. Session A is leg led, Session B is push and pull led, Session C is hinge and carry led. Chest Supported Row Machine is the one exercise repeated across the week, so the pull gets practised twice. No barbell anywhere and no bent over double arm rowing, both of which belong at a later stage.

**Intended for (coach only):** A beginner to early intermediate adult with gym access, three days a week. No acute pain and no current corrective priority.

**Cautions (coach only):** Reduce or skip anything that causes pain. Machine seat and pad settings should be written down with her in the first session, or week 2 becomes a setup session again. Review before assigning to anyone with current low back, knee or shoulder pain. Three slots are floor based. Loads are not prescribed: the coach sets them at the first session.

**Repeated across the week:** Chest Supported Row Machine

#### Session A

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Cat cow pose | spinal | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Hip flexor stretch | hip_flexion | 8 | yes | 2 x 30s, per side, rest 15s |  |  |
| 3 | Activation | Glute Bridge (Bodyweight) | hip_hinge | 7 |  | 2 x 12, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Leg Press | squat | 1 |  | 3 x 10, tempo 2-0-2, rest 90s | 4 sets | yes |
| 5 | Strength | Dumbbell Goblet Squat | squat | 2 |  | 3 x 10, tempo 2-0-2, rest 60s |  |  |
| 6 | Strength | Seated Leg Curl | knee_flexion | 3 |  | 2 x 12, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Chest Supported Row Machine | horizontal_pull | 4 |  | 3 x 10, tempo 2-0-2, rest 60s |  | yes |
| 8 | Core | Plank | anti_extension | 5 |  | 2 x 30s, rest 30s | 40s hold |  |
| 9 | Core | Dead Bug | anti_extension | 6 |  | 2 x 8, tempo 3-1-3, rest 30s |  |  |

#### Session B

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Arm swings | shoulder | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Puppy pose | thoracic | 8 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Prone W to lifts | scapular | 7 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Chest Press Machine flat | horizontal_push | 1 |  | 3 x 10, tempo 2-0-2, rest 90s | 4 sets | yes |
| 5 | Strength | Lat Pulldown | vertical_pull | 2 |  | 3 x 10, tempo 2-0-2, rest 60s |  |  |
| 6 | Strength | Machine Shoulder Press | vertical_push | 3 |  | 2 x 10, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Cable Rope Face Pull | scapular | 4 |  | 2 x 12, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Bird Dog | anti_rotation | 5 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 9 | Core | Ab Bridge Complex | anti_extension | 6 |  | 2 x 20s, rest 30s | 30s hold |  |

#### Session C

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Child's pose | spinal | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Standing forward bend | hip_hinge | 8 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Fire Hydrant Circles | hip_rotation | 7 | yes | 2 x 10, per side, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Romanian Deadlift | hip_hinge | 1 |  | 3 x 8, tempo 2-0-2, rest 90s | 4 sets | yes |
| 5 | Strength | Chest Supported Row Machine | horizontal_pull | 2 |  | 3 x 10, tempo 2-0-2, rest 60s |  | yes |
| 6 | Strength | Hip Thrust Machine | hip_hinge | 3 |  | 3 x 10, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Farmers walk | carry | 4 |  | 3 x 30s, rest 60s |  |  |
| 8 | Core | Reverse Plank | anti_flexion | 5 |  | 2 x 20s, rest 30s | 30s hold |  |
| 9 | Core | Arch Skydiver | anti_flexion | 6 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |

## Collection Three: Women 35 to 55

### Strong After 40

`strong_after_40` &middot; v1 &middot; 4 weeks &middot; 3 sessions a week &middot; home &middot; linear

**Equipment actually needed:** dumbbell

**Member title:** Strong After 40

**Member description:** Four weeks, three sessions a week, with a pair of dumbbells. Session A is squat led, Session B is push and pull, Session C is hips, single side work and a carry. Real strength work, and enough of it to see something change. In week 3 the main lift of each session gains a set and the core holds get longer.

**Purpose (coach only):** The flagship dumbbell program for the 35 to 55 population, and the one most members in this collection should start on. Three full sessions built on the same five patterns every week: squat, hinge, push, pull, carry. Session A is squat led, Session B is push and pull led, Session C is hinge and carry led. Single Arm Dumbbell Row is the one exercise repeated across the week, so the pull gets practised twice. Split Squat is stationary, which is what keeps the single side work honest.

**Intended for (coach only):** Women roughly 35 to 55 training three days a week at home with dumbbells, early intermediate stage, able to get down to and up from the floor unaided. No acute pain and no current corrective priority.

**Cautions (coach only):** Reduce or skip anything that causes pain. Review before assigning to anyone with current low back, knee or shoulder pain. Several slots are floor based. The volume is real and week 3 adds to it, so check in before week 3 rather than after it. Loads are not prescribed: the coach sets them at the first session.

**Repeated across the week:** Single Arm Dumbbell Row

#### Session A

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Cat cow pose | spinal | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Hip flexor stretch | hip_flexion | 8 | yes | 2 x 30s, per side, rest 15s |  |  |
| 3 | Activation | Glute Bridge (Bodyweight) | hip_hinge | 7 |  | 2 x 12, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Goblet Squat | squat | 1 |  | 3 x 10, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Split Squat | lunge | 2 | yes | 3 x 8, per side, tempo 2-0-2, rest 60s |  | yes |
| 6 | Strength | Dumbbell Shoulder Press | vertical_push | 3 |  | 3 x 10, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Dumbbel calf raises | ankle | 4 |  | 2 x 15, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Plank | anti_extension | 5 |  | 2 x 30s, rest 30s | 40s hold |  |
| 9 | Core | Dead Bug | anti_extension | 6 |  | 3 x 8, tempo 3-1-3, rest 30s |  |  |

#### Session B

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Arm swings | shoulder | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Puppy pose | thoracic | 8 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Prone W to lifts | scapular | 7 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell floor chest press | horizontal_push | 1 |  | 3 x 10, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Single Arm Dumbbell Row | horizontal_pull | 2 | yes | 3 x 10, per side, tempo 2-0-2, rest 60s |  | yes |
| 6 | Strength | Reverse Fly | horizontal_pull | 3 |  | 3 x 12, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Dumbbell Sumo Squat | squat | 4 |  | 3 x 12, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Bird Dog | anti_rotation | 5 |  | 3 x 10, tempo 3-1-3, rest 30s |  |  |
| 9 | Core | Ab Bridge Complex | anti_extension | 6 |  | 2 x 25s, rest 30s | 35s hold |  |

#### Session C

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Child's pose | spinal | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Standing forward bend | hip_hinge | 8 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Fire Hydrant Circles | hip_rotation | 7 | yes | 2 x 10, per side, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Romanian Deadlift | hip_hinge | 1 |  | 3 x 8, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Single Arm Dumbbell Row | horizontal_pull | 2 | yes | 3 x 10, per side, tempo 2-0-2, rest 60s |  | yes |
| 6 | Strength | Dumbbell Step Ups | lunge | 3 | yes | 3 x 8, per side, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Farmers walk | carry | 4 |  | 3 x 40s, rest 60s |  |  |
| 8 | Core | Reverse Plank | anti_flexion | 5 |  | 2 x 25s, rest 30s | 35s hold |  |
| 9 | Core | Arch Skydiver | anti_flexion | 6 |  | 3 x 10, tempo 3-1-3, rest 30s |  |  |

### Menopause Strength Foundation

`menopause_strength_foundation` &middot; v1 &middot; 4 weeks &middot; 3 sessions a week &middot; home &middot; linear

**Equipment actually needed:** dumbbell

**Member title:** Menopause Strength Foundation

**Member description:** Four weeks, three sessions a week, with dumbbells. Strength work you can keep doing, built around the movements that carry you through a day: standing up, hinging, pushing, pulling and carrying. Session A is legs, Session B is upper body, Session C is whole body with a carry. In week 3 the main lift of each session gains a set and the core holds get longer.

**Purpose (coach only):** Strength for a member in the menopause transition, with weight bearing and standing work deliberately favoured over floor work, and progressions kept conservative because sleep and recovery are frequently the limiting factor rather than capacity. Session A is lower body led, Session B is upper body led, Session C is whole body with a carry. Single Arm Dumbbell Row is the one exercise repeated across the week. There is no jumping and no impact anywhere in it. This program makes no claim about symptoms and none about bone: it is a strength program, described as one.

**Intended for (coach only):** Women in the perimenopausal or postmenopausal years training three days a week at home with dumbbells. Early intermediate stage, able to get down to and up from the floor unaided.

**Cautions (coach only):** Reduce or skip anything that causes pain. Nothing here treats a symptom or a diagnosis, and it should never be presented as if it did; anything medical belongs with her own clinician. Sleep disruption and joint sensitivity are common in this population and both change what a good session looks like, so ask before adding load rather than following the week 3 progression blindly. Review before assigning to anyone with current low back, knee, shoulder or pelvic floor symptoms. Loads are not prescribed: the coach sets them at the first session.

**Repeated across the week:** Single Arm Dumbbell Row

#### Session A

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Cat cow pose | spinal | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Hip flexor stretch | hip_flexion | 8 | yes | 2 x 30s, per side, rest 15s |  |  |
| 3 | Activation | Glute Bridge (Bodyweight) | hip_hinge | 7 |  | 2 x 12, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Goblet Squat | squat | 1 |  | 3 x 10, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Dumbbell Romanian Deadlift | hip_hinge | 2 |  | 3 x 8, tempo 2-0-2, rest 60s |  |  |
| 6 | Strength | Step-Ups (Bodyweight) | lunge | 3 | yes | 2 x 10, per side, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Dumbbel calf raises | ankle | 4 |  | 2 x 15, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Plank | anti_extension | 5 |  | 2 x 30s, rest 30s | 40s hold |  |
| 9 | Core | Bird Dog | anti_rotation | 6 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |

#### Session B

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Arm swings | shoulder | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Puppy pose | thoracic | 8 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Prone W to lifts | scapular | 7 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell floor chest press | horizontal_push | 1 |  | 3 x 10, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Single Arm Dumbbell Row | horizontal_pull | 2 | yes | 3 x 10, per side, tempo 2-0-2, rest 60s |  | yes |
| 6 | Strength | Dumbbell Shoulder Press | vertical_push | 3 |  | 2 x 10, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Reverse Fly | horizontal_pull | 4 |  | 2 x 12, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Dead Bug | anti_extension | 5 |  | 2 x 8, tempo 3-1-3, rest 30s |  |  |
| 9 | Core | Ab Bridge Complex | anti_extension | 6 |  | 2 x 20s, rest 30s | 30s hold |  |

#### Session C

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Child's pose | spinal | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Standing forward bend | hip_hinge | 8 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Clams side lying with knee lifts | hip_rotation | 7 | yes | 2 x 12, per side, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Sumo Squat | squat | 1 |  | 3 x 12, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Single Arm Dumbbell Row | horizontal_pull | 2 | yes | 3 x 10, per side, tempo 2-0-2, rest 60s |  | yes |
| 6 | Strength | Farmers walk | carry | 3 |  | 3 x 40s, rest 60s |  |  |
| 7 | Strength | Split Squat | lunge | 4 | yes | 2 x 8, per side, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Reverse Plank | anti_flexion | 5 |  | 2 x 20s, rest 30s | 30s hold |  |
| 9 | Core | Arch Skydiver | anti_flexion | 6 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |

### Low-Impact Strength and Conditioning

`low_impact_strength_and_conditioning` &middot; v1 &middot; 4 weeks &middot; 3 sessions a week &middot; home &middot; linear

**Equipment actually needed:** dumbbell, wall

**Member title:** Low-Impact Strength and Conditioning

**Member description:** Four weeks, three sessions a week. Nothing in this program jumps, hops or lands. The conditioning comes from higher reps, shorter rests and loaded carries instead. Session A is legs, Session B is push and pull, Session C is hips and carrying. In week 3 the main lift of each session gains a set and the core holds get longer.

**Purpose (coach only):** Strength and conditioning with zero impact anywhere: no jump, no hop, no landing, no run. Conditioning is bought with rep range and rest rather than with plyometrics, which is why the rep counts run higher than the rest of the collection and the rests run shorter. Session A is squat and isometric led, Session B is push and pull led, Session C is hinge and carry led. Single Arm Dumbbell Row is the one exercise repeated across the week.

**Intended for (coach only):** Anybody who needs the training effect without impact: joint sensitivity, pelvic floor symptoms, a heavy standing job, or simply a downstairs neighbour. Early intermediate stage, three days a week, dumbbells at home.

**Cautions (coach only):** Reduce or skip anything that causes pain. The shorter rests are the conditioning stimulus, so if she is running out of breath rather than out of muscle, lengthen the rest before dropping the load. Review before assigning to anyone with current low back, knee or shoulder pain. Several slots are floor based. Loads are not prescribed: the coach sets them at the first session.

**Repeated across the week:** Single Arm Dumbbell Row

#### Session A

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Cat cow pose | spinal | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Hip flexor stretch | hip_flexion | 8 | yes | 2 x 30s, per side, rest 15s |  |  |
| 3 | Activation | Glute Bridge (Bodyweight) | hip_hinge | 7 |  | 2 x 12, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Goblet Squat | squat | 1 |  | 3 x 12, tempo 2-0-2, rest 60s | 4 sets | yes |
| 5 | Strength | Split Squat | lunge | 2 | yes | 3 x 8, per side, tempo 2-0-2, rest 45s |  |  |
| 6 | Strength | Wall Sit | squat | 3 |  | 2 x 40s, rest 45s |  |  |
| 7 | Strength | Dumbbell Shoulder Press | vertical_push | 4 |  | 3 x 10, tempo 2-0-2, rest 45s |  |  |
| 8 | Core | Plank | anti_extension | 5 |  | 2 x 30s, rest 30s | 40s hold |  |
| 9 | Core | Dead Bug | anti_extension | 6 |  | 3 x 8, tempo 3-1-3, rest 30s |  |  |

#### Session B

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Arm swings | shoulder | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Puppy pose | thoracic | 8 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Prone W to lifts | scapular | 7 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell floor chest press | horizontal_push | 1 |  | 3 x 12, tempo 2-0-2, rest 60s | 4 sets | yes |
| 5 | Strength | Single Arm Dumbbell Row | horizontal_pull | 2 | yes | 3 x 12, per side, tempo 2-0-2, rest 45s |  | yes |
| 6 | Strength | Dumbbell Sumo Squat | squat | 3 |  | 3 x 15, tempo 2-0-2, rest 45s |  |  |
| 7 | Strength | Reverse Fly | horizontal_pull | 4 |  | 3 x 12, tempo 2-0-2, rest 45s |  |  |
| 8 | Core | Bird Dog | anti_rotation | 5 |  | 3 x 10, tempo 3-1-3, rest 30s |  |  |
| 9 | Core | Ab Bridge Complex | anti_extension | 6 |  | 2 x 25s, rest 30s | 35s hold |  |

#### Session C

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Child's pose | spinal | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Standing forward bend | hip_hinge | 8 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Fire Hydrant Circles | hip_rotation | 7 | yes | 2 x 10, per side, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Romanian Deadlift | hip_hinge | 1 |  | 3 x 10, tempo 2-0-2, rest 60s | 4 sets | yes |
| 5 | Strength | Single Arm Dumbbell Row | horizontal_pull | 2 | yes | 3 x 12, per side, tempo 2-0-2, rest 45s |  | yes |
| 6 | Strength | Farmers walk | carry | 3 |  | 3 x 45s, rest 45s |  |  |
| 7 | Strength | Step-Ups (Bodyweight) | lunge | 4 | yes | 3 x 10, per side, tempo 2-0-2, rest 45s |  |  |
| 8 | Core | Reverse Plank | anti_flexion | 5 |  | 2 x 25s, rest 30s | 35s hold |  |
| 9 | Core | Arch Skydiver | anti_flexion | 6 |  | 3 x 12, tempo 3-1-3, rest 30s |  |  |

### Energy and Recovery Movement Plan

`energy_and_recovery_movement_plan` &middot; v1 &middot; 4 weeks &middot; 2 sessions a week &middot; home &middot; linear

**Equipment actually needed:** dumbbell

**Member title:** Energy and Recovery Movement Plan

**Member description:** Four weeks, twice a week, deliberately light. Every movement is done slowly, with time to feel where you are, and there is more rest than you probably think you need. You should leave each session with something left. In week 3 the first strength movement of each session gains a set and the core holds get longer.

**Purpose (coach only):** The lightest program in the library that is still a strength program. Every strength slot runs a slow three second lower and a three second lift with generous rest, so the session buys movement quality and blood flow rather than fatigue. Two days, both full body. Suits a member in a heavy life phase, a deload week, or the fortnight after a hard block. Single Arm Dumbbell Row is the one exercise repeated across the week.

**Intended for (coach only):** A member who is training but under-recovered, or coming off a demanding block, or in a period where a hard program would simply not get done. Any stage; the constraint is recovery, not capacity.

**Cautions (coach only):** Reduce or skip anything that causes pain. If she is consistently finishing this program feeling worse rather than better, the problem is upstream of training and this is not the fix. Review before assigning to anyone with current low back, knee or shoulder pain. Several slots are floor based. Loads are not prescribed, and here in particular they should be set low enough that the slow tempo is comfortable rather than a struggle.

**Repeated across the week:** Single Arm Dumbbell Row

#### Session A

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Cat cow pose | spinal | 8 |  | 1 x 90s, rest 15s |  |  |
| 2 | Mobility | Hip flexor stretch | hip_flexion | 7 | yes | 2 x 45s, per side, rest 15s |  |  |
| 3 | Activation | Glute Bridge (Bodyweight) | hip_hinge | 6 |  | 2 x 12, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Goblet Squat | squat | 1 |  | 2 x 10, tempo 3-1-3, rest 90s | 3 sets | yes |
| 5 | Strength | Single Arm Dumbbell Row | horizontal_pull | 2 | yes | 2 x 10, per side, tempo 3-1-3, rest 90s |  | yes |
| 6 | Strength | Dumbbell Shoulder Press | vertical_push | 3 |  | 2 x 10, tempo 3-1-3, rest 90s |  |  |
| 7 | Core | Dead Bug | anti_extension | 4 |  | 2 x 8, tempo 3-1-3, rest 30s |  |  |
| 8 | Core | Ab Bridge Complex | anti_extension | 5 |  | 2 x 20s, rest 30s | 30s hold |  |

#### Session B

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Child's pose | spinal | 8 |  | 1 x 90s, rest 15s |  |  |
| 2 | Mobility | Happy baby pose | hip_flexion | 7 |  | 2 x 45s, rest 15s |  |  |
| 3 | Activation | Prone W to lifts | scapular | 6 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Romanian Deadlift | hip_hinge | 1 |  | 2 x 8, tempo 3-1-3, rest 90s | 3 sets | yes |
| 5 | Strength | Single Arm Dumbbell Row | horizontal_pull | 2 | yes | 2 x 10, per side, tempo 3-1-3, rest 90s |  | yes |
| 6 | Strength | Bodyweight Split Squat | lunge | 3 | yes | 2 x 8, per side, tempo 3-1-3, rest 90s |  |  |
| 7 | Core | Plank | anti_extension | 4 |  | 2 x 25s, rest 30s | 35s hold |  |
| 8 | Core | Reverse Plank | anti_flexion | 5 |  | 2 x 20s, rest 30s | 30s hold |  |

### Bone, Balance and Strength Support

`bone_balance_and_strength_support` &middot; v1 &middot; 4 weeks &middot; 3 sessions a week &middot; home &middot; linear

**Equipment actually needed:** band, box, chair, dumbbell

**Member title:** Bone, Balance and Strength Support

**Member description:** Four weeks, three sessions a week. Weight bearing strength work and time spent on one leg, in equal measure. Session A carries load through the legs and hips, Session B is balance and stepping, Session C is whole body with a carry. In week 3 the main lift of each session gains a set, and you hold the balance and core work for longer.

**Purpose (coach only):** Loading and balance in one program, kept conservative. Session A is the loading day, Session B is the balance day with stepping and single leg time, Session C combines them and finishes with a carry. Everything on one leg is stationary or supported, so the balance work is trained rather than tested. Single Arm Dumbbell Row is the one exercise repeated across the week. The program name is the coach shelf label; nothing a member reads claims an effect on bone, and nothing here should be presented as treatment.

**Intended for (coach only):** A member who wants loading and balance together: often, but not only, post-menopausal women and older adults. Early beginner to intermediate stage, three days a week, at home.

**Cautions (coach only):** Reduce or skip anything that causes pain. This program treats nothing and diagnoses nothing; if she has a bone density result or a diagnosis, the plan belongs with her own clinician and this supports it rather than replaces it. Where a fracture history, a diagnosis or a fall in the last twelve months exists, get clinical clearance before assigning and consider Active Aging and Balance instead, which has no floor work in it at all. The step used in Session B should be low and fixed. Loads are not prescribed: the coach sets them at the first session.

**Repeated across the week:** Single Arm Dumbbell Row

#### Session A

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Cat cow pose | spinal | 8 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Hip flexor stretch | hip_flexion | 7 | yes | 2 x 30s, per side, rest 15s |  |  |
| 3 | Activation | Glute Bridge (Bodyweight) | hip_hinge | 6 |  | 2 x 12, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Goblet Squat | squat | 1 |  | 3 x 10, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Dumbbell Romanian Deadlift | hip_hinge | 2 |  | 3 x 8, tempo 2-0-2, rest 60s |  |  |
| 6 | Strength | Dumbbel calf raises | ankle | 3 |  | 3 x 15, tempo 2-0-2, rest 60s |  |  |
| 7 | Core | Plank | anti_extension | 4 |  | 2 x 30s, rest 30s | 40s hold |  |
| 8 | Core | Dead Bug | anti_extension | 5 |  | 2 x 8, tempo 3-1-3, rest 30s |  |  |

#### Session B

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Arm swings | shoulder | 8 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Lateral leg swing | hip_abduction | 7 | yes | 2 x 10, per side, rest 15s |  |  |
| 3 | Activation | Banded Lateral Walks | hip_abduction | 6 |  | 2 x 12, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Step ups | lunge | 1 | yes | 3 x 8, per side, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Single-Leg Step Balance | balance | 2 | yes | 3 x 20s, per side, rest 45s | 30s hold | yes |
| 6 | Strength | Single Arm Dumbbell Row | horizontal_pull | 3 | yes | 3 x 10, per side, tempo 2-0-2, rest 60s |  | yes |
| 7 | Core | Bird Dog | anti_rotation | 4 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 8 | Core | Ab Bridge Complex | anti_extension | 5 |  | 2 x 20s, rest 30s | 30s hold |  |

#### Session C

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Child's pose | spinal | 8 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Standing forward bend | hip_hinge | 7 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Prone W to lifts | scapular | 6 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Sumo Squat | squat | 1 |  | 3 x 12, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Single Arm Dumbbell Row | horizontal_pull | 2 | yes | 3 x 10, per side, tempo 2-0-2, rest 60s |  | yes |
| 6 | Strength | Farmers walk | carry | 3 |  | 3 x 40s, rest 60s |  |  |
| 7 | Core | Reverse Plank | anti_flexion | 4 |  | 2 x 20s, rest 30s | 30s hold |  |
| 8 | Core | Arch Skydiver | anti_flexion | 5 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |

## Collection Four: Lifestyle

### Desk Worker Movement Reset

`desk_worker_movement_reset` &middot; v1 &middot; 4 weeks &middot; 3 sessions a week &middot; home &middot; linear

**Equipment actually needed:** band, wall

**Member title:** Desk Worker Movement Reset

**Member description:** Four weeks, three sessions a week, for a body that spends its day sitting. Session A opens the hips, Session B works the upper back and shoulders, Session C puts the two together. Minimal equipment, and nothing that needs a gym. In week 3 the first strength movement of each session gains a set and the core holds get longer.

**Purpose (coach only):** Hips, upper back and the pulling volume a desk job never provides. Session A is hip led, Session B is thoracic and posture led with a rotation opener, Session C is a full body day. Rowing appears in two sessions on purpose: pull volume is the single biggest thing missing from this population, and Resistance Band Row is the one exercise repeated across the week. Deliberately not a corrective program: where a real posture finding exists, the corrective program comes first and this is not a substitute for it.

**Intended for (coach only):** An adult in a seated job, three days a week, at home or in a hotel room, with a light resistance band. Beginner to early intermediate stage. No acute pain and no current corrective priority.

**Cautions (coach only):** Reduce or skip anything that causes pain. This is a general program, not a corrective one, and it should not be assigned in place of a corrective program where an assessment has found something. Review before assigning to anyone with current neck, low back or shoulder pain. Several slots are floor based. One slot asks for a light resistance band. Loads are not prescribed: the coach sets them at the first session.

**Repeated across the week:** Resistance Band Row

#### Session A

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Cat cow pose | spinal | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Hip flexor stretch | hip_flexion | 8 | yes | 2 x 30s, per side, rest 15s |  |  |
| 3 | Activation | Glute Bridge (Bodyweight) | hip_hinge | 7 |  | 2 x 12, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Bodyweight Squat | squat | 1 |  | 3 x 12, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Bodyweight Split Squat | lunge | 2 | yes | 3 x 8, per side, tempo 2-0-2, rest 60s |  |  |
| 6 | Strength | Resistance Band Row | horizontal_pull | 3 |  | 3 x 12, tempo 2-0-2, rest 60s |  | yes |
| 7 | Strength | Reverse Snow Angels | scapular | 4 |  | 3 x 12, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Dead Bug | anti_extension | 5 |  | 3 x 8, tempo 3-1-3, rest 30s |  |  |
| 9 | Core | Plank | anti_extension | 6 |  | 2 x 30s, rest 30s | 40s hold |  |

#### Session B

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Arm swings | shoulder | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Slingshot into T-Spine rotation | thoracic_rotation | 8 | yes | 2 x 8, per side, rest 15s |  |  |
| 3 | Activation | Prone W to lifts | scapular | 7 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Inclined push up | horizontal_push | 1 |  | 3 x 10, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Scapula push ups | scapular | 2 |  | 3 x 10, tempo 2-0-2, rest 60s |  |  |
| 6 | Strength | Superman extensions | anti_flexion | 3 |  | 3 x 12, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Step-Ups (Bodyweight) | lunge | 4 | yes | 3 x 10, per side, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Bird Dog | anti_rotation | 5 |  | 3 x 10, tempo 3-1-3, rest 30s |  |  |
| 9 | Core | Ab Bridge Complex | anti_extension | 6 |  | 2 x 25s, rest 30s | 35s hold |  |

#### Session C

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Child's pose | spinal | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Puppy pose | thoracic | 8 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Fire Hydrant Circles | hip_rotation | 7 | yes | 2 x 10, per side, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Sumo squats | squat | 1 |  | 3 x 15, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Resistance Band Row | horizontal_pull | 2 |  | 3 x 12, tempo 2-0-2, rest 60s |  | yes |
| 6 | Strength | Reverse Lunges | lunge | 3 | yes | 3 x 10, per side, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Wall Push Ups | horizontal_push | 4 |  | 3 x 12, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Arch Skydiver | anti_flexion | 5 |  | 3 x 10, tempo 3-1-3, rest 30s |  |  |
| 9 | Core | Reverse Plank | anti_flexion | 6 |  | 2 x 20s, rest 30s | 30s hold |  |

### Busy Parent Three-Day Plan

`busy_parent_three_day_plan` &middot; v1 &middot; 4 weeks &middot; 3 sessions a week &middot; home &middot; linear

**Equipment actually needed:** dumbbell

**Member title:** Busy Parent Three-Day Plan

**Member description:** Four weeks, three short sessions a week, at home. Seven movements each time: two to get you ready, four strength, one core. Built to be finished rather than admired. In week 3 the main lift of each session gains a set.

**Purpose (coach only):** Short by design. Seven slots a session rather than nine, a two movement opener rather than three, and no session that needs more floor space than a living room. Everything else is a normal full body dumbbell program: Session A is squat and push led, Session B is hinge and press led, Session C is single side and carry led. Single Arm Dumbbell Row is the one exercise repeated across the week. If the choice is between this being done three times and a better program being done once, this is the better program.

**Intended for (coach only):** A parent or carer with real time pressure, three days a week, dumbbells at home. Early intermediate stage. No acute pain and no current corrective priority.

**Cautions (coach only):** Reduce or skip anything that causes pain. The opener is two movements rather than three, so if she arrives cold from a car or a school run, tell her to add a few minutes of walking first rather than to skip straight to the first lift. Review before assigning to anyone with current low back, knee or shoulder pain. Loads are not prescribed: the coach sets them at the first session.

**Repeated across the week:** Single Arm Dumbbell Row

#### Session A

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Cat cow pose | spinal | 7 |  | 1 x 60s, rest 15s |  |  |
| 2 | Activation | Glute Bridge (Bodyweight) | hip_hinge | 6 |  | 2 x 12, tempo 3-1-3, rest 30s |  |  |
| 3 | Strength | Dumbbell Goblet Squat | squat | 1 |  | 3 x 10, tempo 2-0-2, rest 75s | 4 sets | yes |
| 4 | Strength | Dumbbell floor chest press | horizontal_push | 2 |  | 3 x 10, tempo 2-0-2, rest 60s |  |  |
| 5 | Strength | Single Arm Dumbbell Row | horizontal_pull | 3 | yes | 3 x 10, per side, tempo 2-0-2, rest 60s |  | yes |
| 6 | Strength | Dumbbell Rear Lunge | lunge | 4 | yes | 2 x 8, per side, tempo 2-0-2, rest 60s |  |  |
| 7 | Core | Plank | anti_extension | 5 |  | 2 x 30s, rest 30s | 40s hold |  |

#### Session B

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Arm swings | shoulder | 7 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Hip flexor stretch | hip_flexion | 6 | yes | 2 x 30s, per side, rest 15s |  |  |
| 3 | Strength | Dumbbell Romanian Deadlift | hip_hinge | 1 |  | 3 x 8, tempo 2-0-2, rest 75s | 4 sets | yes |
| 4 | Strength | Dumbbell Shoulder Press | vertical_push | 2 |  | 3 x 10, tempo 2-0-2, rest 60s |  |  |
| 5 | Strength | Single Arm Dumbbell Row | horizontal_pull | 3 | yes | 3 x 10, per side, tempo 2-0-2, rest 60s |  | yes |
| 6 | Strength | Dumbbell Sumo Squat | squat | 4 |  | 3 x 12, tempo 2-0-2, rest 60s |  |  |
| 7 | Core | Dead Bug | anti_extension | 5 |  | 3 x 8, tempo 3-1-3, rest 30s |  |  |

#### Session C

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Child's pose | spinal | 7 |  | 1 x 60s, rest 15s |  |  |
| 2 | Activation | Prone W to lifts | scapular | 6 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 3 | Strength | Split Squat | lunge | 1 | yes | 3 x 8, per side, tempo 2-0-2, rest 75s | 4 sets | yes |
| 4 | Strength | Farmers walk | carry | 2 |  | 3 x 40s, rest 60s |  |  |
| 5 | Strength | Inclined push up | horizontal_push | 3 |  | 3 x 12, tempo 2-0-2, rest 60s |  |  |
| 6 | Strength | Reverse Fly | horizontal_pull | 4 |  | 3 x 12, tempo 2-0-2, rest 60s |  |  |
| 7 | Core | Bird Dog | anti_rotation | 5 |  | 3 x 10, tempo 3-1-3, rest 30s |  |  |

### Low-Stress Training Week

`low_stress_training_week` &middot; v1 &middot; 4 weeks &middot; 2 sessions a week &middot; home &middot; linear

**Equipment actually needed:** dumbbell

**Member title:** Low-Stress Training Week

**Member description:** Four weeks, twice a week, for the weeks when everything else is already a lot. Each session opens lying down with slow breathing, moves through three strength movements at an unhurried pace with long rests, and ends with quiet core work. In week 3 the first strength movement of each session gains a set and the core holds get longer.

**Purpose (coach only):** Training that does not add to the load. The opener is lying down rather than standing so the session starts by settling rather than by revving, every strength slot runs a slow tempo with ninety second rests, and the core work is held rather than repped. It is still a real strength program: two full body days, three strength movements each, the same patterns as the rest of the library. Single Arm Dumbbell Row is the one exercise repeated across the week.

**Intended for (coach only):** A member in a high stress period who wants to keep training rather than stop. Any stage. Also useful as a planned lighter block between harder ones.

**Cautions (coach only):** Reduce or skip anything that causes pain. The long rests are the point, so a member who compresses them has changed the program into something else; say so at the first session. This program manages training load and nothing else, and it should never be offered as an answer to a mental health concern. Review before assigning to anyone with current low back, knee or shoulder pain. Loads are not prescribed, and here they should be set well short of hard.

**Repeated across the week:** Single Arm Dumbbell Row

#### Session A

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Child's pose | spinal | 8 |  | 1 x 90s, rest 15s |  |  |
| 2 | Mobility | Reclined butterfly | hip_external_rotation | 7 |  | 2 x 45s, rest 15s |  |  |
| 3 | Activation | Glute Bridge (Bodyweight) | hip_hinge | 6 |  | 2 x 12, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Goblet Squat | squat | 1 |  | 2 x 10, tempo 3-1-3, rest 90s | 3 sets | yes |
| 5 | Strength | Single Arm Dumbbell Row | horizontal_pull | 2 | yes | 2 x 10, per side, tempo 3-1-3, rest 90s |  | yes |
| 6 | Strength | Bodyweight Split Squat | lunge | 3 | yes | 2 x 8, per side, tempo 3-1-3, rest 90s |  |  |
| 7 | Core | Dead Bug | anti_extension | 4 |  | 2 x 8, tempo 3-1-3, rest 30s |  |  |
| 8 | Core | Ab Bridge Complex | anti_extension | 5 |  | 2 x 20s, rest 30s | 30s hold |  |

#### Session B

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Cat cow pose | spinal | 8 |  | 1 x 90s, rest 15s |  |  |
| 2 | Mobility | Happy baby pose | hip_flexion | 7 |  | 2 x 45s, rest 15s |  |  |
| 3 | Activation | Prone W to lifts | scapular | 6 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Romanian Deadlift | hip_hinge | 1 |  | 2 x 8, tempo 3-1-3, rest 90s | 3 sets | yes |
| 5 | Strength | Single Arm Dumbbell Row | horizontal_pull | 2 | yes | 2 x 10, per side, tempo 3-1-3, rest 90s |  | yes |
| 6 | Strength | Dumbbell Shoulder Press | vertical_push | 3 |  | 2 x 10, tempo 3-1-3, rest 90s |  |  |
| 7 | Core | Plank | anti_extension | 4 |  | 2 x 25s, rest 30s | 35s hold |  |
| 8 | Core | Reverse Plank | anti_flexion | 5 |  | 2 x 20s, rest 30s | 30s hold |  |

### Travel and Hotel Program

`travel_and_hotel_program` &middot; v1 &middot; 4 weeks &middot; 3 sessions a week &middot; mixed &middot; linear

**Equipment actually needed:** dumbbell

**Member title:** Travel and Hotel Program

**Member description:** Four weeks, three sessions a week, wherever you are. Session A needs nothing but the floor, so it works in a hotel room. Sessions B and C use a pair of dumbbells, which is the one thing every hotel gym reliably has. In week 3 the main lift of each session gains a set and the core holds get longer.

**Purpose (coach only):** Written around what is actually available on the road. Session A is entirely bodyweight and fits in a hotel room with no gym at all. Sessions B and C use dumbbells only, the one piece of equipment a hotel gym can be relied on for; there is no barbell, no cable, no machine and no bench anywhere in the program, so nothing depends on what a particular gym happens to own. Single Arm Dumbbell Row is the one exercise repeated across the week.

**Intended for (coach only):** A member who travels regularly, three days a week, early intermediate stage. Also the right program to hand somebody for a fortnight away in the middle of a different block.

**Cautions (coach only):** Reduce or skip anything that causes pain. Hotel dumbbells often jump in five pound steps, so expect the load to be either slightly too light or slightly too heavy and tell her to add reps rather than to chase the number. Review before assigning to anyone with current low back, knee or shoulder pain. Several slots are floor based. Loads are not prescribed: the coach sets them at the first session.

**Repeated across the week:** Single Arm Dumbbell Row

#### Session A

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Cat cow pose | spinal | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Hip flexor stretch | hip_flexion | 8 | yes | 2 x 30s, per side, rest 15s |  |  |
| 3 | Activation | Glute Bridge (Bodyweight) | hip_hinge | 7 |  | 2 x 12, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Bodyweight Squat | squat | 1 |  | 3 x 15, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Bodyweight Split Squat | lunge | 2 | yes | 3 x 10, per side, tempo 2-0-2, rest 60s |  |  |
| 6 | Strength | Inclined push up | horizontal_push | 3 |  | 3 x 12, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Reverse Snow Angels | scapular | 4 |  | 3 x 15, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Plank | anti_extension | 5 |  | 2 x 35s, rest 30s | 45s hold |  |
| 9 | Core | Dead Bug | anti_extension | 6 |  | 3 x 10, tempo 3-1-3, rest 30s |  |  |

#### Session B

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Arm swings | shoulder | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Puppy pose | thoracic | 8 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Prone W to lifts | scapular | 7 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Goblet Squat | squat | 1 |  | 3 x 10, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Single Arm Dumbbell Row | horizontal_pull | 2 | yes | 3 x 10, per side, tempo 2-0-2, rest 60s |  | yes |
| 6 | Strength | Dumbbell floor chest press | horizontal_push | 3 |  | 3 x 10, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Dumbbell Shoulder Press | vertical_push | 4 |  | 3 x 10, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Bird Dog | anti_rotation | 5 |  | 3 x 10, tempo 3-1-3, rest 30s |  |  |
| 9 | Core | Ab Bridge Complex | anti_extension | 6 |  | 2 x 25s, rest 30s | 35s hold |  |

#### Session C

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Child's pose | spinal | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Standing forward bend | hip_hinge | 8 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Fire Hydrant Circles | hip_rotation | 7 | yes | 2 x 10, per side, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Romanian Deadlift | hip_hinge | 1 |  | 3 x 8, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Single Arm Dumbbell Row | horizontal_pull | 2 | yes | 3 x 10, per side, tempo 2-0-2, rest 60s |  | yes |
| 6 | Strength | Step-Ups (Bodyweight) | lunge | 3 | yes | 3 x 12, per side, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Farmers walk | carry | 4 |  | 3 x 40s, rest 60s |  |  |
| 8 | Core | Reverse Plank | anti_flexion | 5 |  | 2 x 25s, rest 30s | 35s hold |  |
| 9 | Core | Arch Skydiver | anti_flexion | 6 |  | 3 x 12, tempo 3-1-3, rest 30s |  |  |

### Return After Illness or Extended Break

`return_after_illness_or_extended_break` &middot; v1 &middot; 4 weeks &middot; 2 sessions a week &middot; home &middot; linear

**Equipment actually needed:** band, chair, wall

**Member title:** Return After Illness or Extended Break

**Member description:** Four weeks, twice a week, and the gentlest program we have. Almost all of it is done sitting on or holding a chair, with long rests between everything. Standing up out of a chair is the movement both sessions are built around, because it is the one that gives you the most back. In week 3 it gains a set, and nothing else changes.

**Purpose (coach only):** The floor of the library. Two days, eight slots each, chair based throughout, with ninety second rests on every strength slot. Narrow Squats with Chair is the one exercise repeated across the week and it is the whole point of the program: the sit to stand is the single most useful thing to rebuild first, so it is practised both days rather than once. Only two slots leave the chair, both of them lying down rather than standing, so nothing in the program requires getting up off the floor from a low position. Week 3 adds a set to the sit to stand and to nothing else.

**Intended for (coach only):** A member returning after illness, surgery, hospitalisation or a very long lay-off, cleared to exercise, whose starting capacity is genuinely low. Beginner stage regardless of training history.

**Cautions (coach only):** This program assumes she has been cleared to exercise. Where that clearance has not happened, it has not happened, and nothing here substitutes for it. Reduce or skip anything that causes pain, breathlessness beyond mild, dizziness or a racing heart, and stop the session rather than push through any of them. A sturdy chair that does not slide is required. Post-viral fatigue can present as a good session followed by two bad days, so ask about the day AFTER each session rather than about the session. Progress the load only when two consecutive weeks have gone well. Loads are not prescribed and in most cases should be zero for the first fortnight.

**Repeated across the week:** Narrow Squats with Chair

#### Session A

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Seated ankle circles | ankle | 8 |  | 1 x 45s, rest 15s |  |  |
| 2 | Mobility | Sitting Pelvic tilts | pelvic | 7 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Goal Post Squeeze | scapular | 6 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Narrow Squats with Chair | squat | 1 |  | 2 x 8, tempo 2-0-2, rest 90s | 3 sets | yes |
| 5 | Strength | Wall Push Ups | horizontal_push | 2 |  | 2 x 8, tempo 2-0-2, rest 90s |  |  |
| 6 | Strength | Resistance Band Row | horizontal_pull | 3 |  | 2 x 10, tempo 2-0-2, rest 90s |  |  |
| 7 | Core | Dead Bug | anti_extension | 4 |  | 2 x 6, tempo 3-1-3, rest 30s |  |  |
| 8 | Core | Chair Twists | rotation | 5 |  | 2 x 8, tempo 3-1-3, rest 30s |  |  |

#### Session B

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Head Turns Neck stretches | cervical | 8 |  | 1 x 20s, rest 15s |  |  |
| 2 | Mobility | Psoas stretch | hip_flexion | 7 | yes | 2 x 30s, per side, rest 15s |  |  |
| 3 | Activation | Hip Abduction | hip_abduction | 6 | yes | 2 x 10, per side, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Narrow Squats with Chair | squat | 1 |  | 2 x 8, tempo 2-0-2, rest 90s | 3 sets | yes |
| 5 | Strength | Heel Raises toe raises | ankle | 2 |  | 2 x 12, tempo 2-0-2, rest 90s |  |  |
| 6 | Strength | Chair Leg Extension | knee_extension | 3 | yes | 2 x 10, per side, tempo 2-0-2, rest 90s |  |  |
| 7 | Core | Bird Dog | anti_rotation | 4 |  | 2 x 8, tempo 3-1-3, rest 30s |  |  |
| 8 | Core | Alternating Side Reaches | lateral_flexion | 5 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |

### Golf Mobility and Performance Foundation

`golf_mobility_and_performance_foundation` &middot; v1 &middot; 4 weeks &middot; 3 sessions a week &middot; home &middot; linear

**Equipment actually needed:** dumbbell

**Member title:** Golf Mobility and Performance Foundation

**Member description:** Four weeks, three sessions a week, built for a rotational sport. Session A is legs and hips, where the power comes from. Session B opens the upper back and works the pull. Session C brings it together with a carry. The core work is all about holding still while something else moves. In week 3 the main lift of each session gains a set and the core holds get longer.

**Purpose (coach only):** Rotation, hip and thoracic mobility, anti rotation core and ground force strength, in the MEF session shape. Session A is the ground force day: squat, stationary split squat, hinge and calf. Session B opens the thoracic spine and loads the pull. Session C is hinge, carry and single side. The core blocks are anti rotation and anti extension throughout, never a twisting crunch, which is the whole coaching point for a rotational athlete. Single Arm Dumbbell Row is the one exercise repeated across the week.

**Intended for (coach only):** A golfer or other rotational sport player, three days a week, dumbbells at home, early intermediate stage. Off season or early season. No acute pain and no current corrective priority.

**Cautions (coach only):** Reduce or skip anything that causes pain. This is a general strength and mobility base, not swing coaching, and it makes no claim about a swing or a handicap. Where low back pain is present, which is common in this population, get it assessed before assigning: rotation work on an irritated back makes things worse, not better. Several slots are floor based. Loads are not prescribed: the coach sets them at the first session.

**Repeated across the week:** Single Arm Dumbbell Row

#### Session A

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Cat cow pose | spinal | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Hip flexor stretch | hip_flexion | 8 | yes | 2 x 30s, per side, rest 15s |  |  |
| 3 | Activation | Glute Bridge (Bodyweight) | hip_hinge | 7 |  | 2 x 12, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Goblet Squat | squat | 1 |  | 3 x 10, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Split Squat | lunge | 2 | yes | 3 x 8, per side, tempo 2-0-2, rest 60s |  |  |
| 6 | Strength | Dumbbell Romanian Deadlift | hip_hinge | 3 |  | 3 x 8, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Dumbbel calf raises | ankle | 4 |  | 3 x 15, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Bird Dog | anti_rotation | 5 |  | 3 x 10, tempo 3-1-3, rest 30s |  |  |
| 9 | Core | Plank | anti_extension | 6 |  | 2 x 30s, rest 30s | 40s hold |  |

#### Session B

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Arm swings | shoulder | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Slingshot into T-Spine rotation | thoracic_rotation | 8 | yes | 2 x 8, per side, rest 15s |  |  |
| 3 | Activation | Prone W to lifts | scapular | 7 |  | 2 x 10, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Single Arm Dumbbell Row | horizontal_pull | 1 | yes | 3 x 10, per side, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Dumbbell floor chest press | horizontal_push | 2 |  | 3 x 10, tempo 2-0-2, rest 60s |  |  |
| 6 | Strength | Dumbbell Shoulder Press | vertical_push | 3 |  | 3 x 10, tempo 2-0-2, rest 60s |  |  |
| 7 | Strength | Reverse Fly | horizontal_pull | 4 |  | 3 x 12, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Dead Bug | anti_extension | 5 |  | 3 x 8, tempo 3-1-3, rest 30s |  |  |
| 9 | Core | Ab Bridge Complex | anti_extension | 6 |  | 2 x 25s, rest 30s | 35s hold |  |

#### Session C

| # | block | exercise | pattern | rank | per side | prescription | week 3 | locked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Preparation | Child's pose | spinal | 9 |  | 1 x 60s, rest 15s |  |  |
| 2 | Mobility | Standing forward bend | hip_hinge | 8 |  | 2 x 30s, rest 15s |  |  |
| 3 | Activation | Fire Hydrant Circles | hip_rotation | 7 | yes | 2 x 10, per side, tempo 3-1-3, rest 30s |  |  |
| 4 | Strength | Dumbbell Sumo Squat | squat | 1 |  | 3 x 12, tempo 2-0-2, rest 75s | 4 sets | yes |
| 5 | Strength | Single Arm Dumbbell Row | horizontal_pull | 2 | yes | 3 x 10, per side, tempo 2-0-2, rest 60s |  | yes |
| 6 | Strength | Farmers walk | carry | 3 |  | 3 x 40s, rest 60s |  |  |
| 7 | Strength | Step-Ups (Bodyweight) | lunge | 4 | yes | 3 x 10, per side, tempo 2-0-2, rest 60s |  |  |
| 8 | Core | Arch Skydiver | anti_flexion | 5 |  | 3 x 10, tempo 3-1-3, rest 30s |  |  |
| 9 | Core | Reverse Plank | anti_flexion | 6 |  | 2 x 25s, rest 30s | 35s hold |  |

## Judgment calls and catalog gaps

Grouped by program so the coach can spot-check the ones he cares about without reading the rest. Nothing here changed the catalog, and nothing here touched a non-assignable exercise.

### Rules that were read one particular way, across the whole library

**"Single-arm rows = intermediate" was read as a rung on a ladder, not as a ban.** The reviewed and approved Home Dumbbell Foundation v2 uses `Single Arm Dumbbell Row`, marks it beginner, and describes it as beginner-appropriate; its intended population is "general beginner to intermediate adults". So a single-arm row in a beginner-to-intermediate program is already coach-approved. Where this library writes for a genuinely beginner-stage population, the row is dropped anyway: **Rebuild Your Foundation, Back-to-Exercise Reset, Active Aging and Balance and Return After Illness or Extended Break** pull with `Resistance Band Row` instead, and a test enforces that.

**"Double-arm bent rows = advanced only" removed every bent-over row from this run**, because none of these sixteen is an advanced program. `Bent Over Two-Dumbbell Row With Palms In`, `Dumbbell Row two arm bent over` and every `Bent Over Barbell Row` variant are excluded by name in both the migration and the test.

**"Stationary single-leg for beginner stages"** is satisfied by `Staggered squats`, `Bodyweight Split Squat`, `Split Squat` and the step-up family. `Dumbbell Rear Lunge` steps back on every rep and so appears in exactly one program, Busy Parent Three-Day Plan, which is written for an intermediate stage. No jumping, switching, walking or alternating lunge appears anywhere in the library.

**Strength as "the clear majority" was made checkable.** Every session has at least three strength movements, at most three opener movements, more strength than core, and at least five strength-and-core movements between them, which is what makes "ranks 1 to 5 are strength and core" a rule rather than a coincidence.

**Week 3 is the mid-program progression for all sixteen**, since all sixteen are four weeks. The main lift of every session gains a set; core holds get ten seconds longer, or five in the two most conservative programs, and the two chair-based programs progress the main lift alone.

### Catalog gaps, flagged rather than forced

| gap | where it bites | what was used instead |
| --- | --- | --- |
| **No anti-rotation press.** There is no Pallof press, no band anti-rotation hold and no bodyweight equivalent in the assignable catalog. The only woodchops are cable, so gym only. | Golf Mobility and Performance Foundation, which is exactly the program that most wants one | `Bird Dog`, `Dead Bug`, `Plank` and the loaded carry. Between them they cover anti-rotation and anti-extension, but a band Pallof press would be a better first slot in Session A and is worth adding to the catalog. |
| **No beginner two-arm supported dumbbell row.** Every dumbbell row in the catalog is either single-arm or bent-over-double. | The four beginner-stage programs | `Resistance Band Row`, which adds a light band to programs otherwise described as minimal equipment. Called out in each of their cautions. |
| **Very few seated or standing core options.** Chair-based core is `Chair Twists`, `Half Roll Backs` and `Alternating Side Reaches`, and that is the whole list. | Active Aging and Balance, Return After Illness or Extended Break | All three are used, one per session, and they are enough for the three-session shape. A fourth chair core movement would let Active Aging run two core slots a session like the rest of the library rather than one. |
| **`Slingshot into T-Spine rotation` is the only assignable thoracic-rotation drill.** | Desk Worker Movement Reset, Golf Mobility and Performance Foundation | Used in both, which is fine because they are different programs, but it means neither can vary its rotation opener across the week. |
| **The catalog stores 49 stretch pairs as two rows** (`Calf Stretch, Left Side` and `Calf Stretch, Right Side`), so a per-side stretch slot would have to be two slots or would silently work one side. | every program's opener | Every opener in this library uses a single-row exercise (`Hip flexor stretch`, `Psoas stretch`, `Standing forward bend`, `Child's pose`) and marks the slot per side. No side-split row is used anywhere. |
| **`Dead Bug` and `Dumbbell Shoulder Press` carry no difficulty in the catalog.** | everywhere they appear | Their slots record `beginner`, which is what migration 175 did for `Dumbbell Shoulder Press` and is the honest tier for both. The catalog rows were not edited. |

### Per program

**Rebuild Your Foundation.** No repeated exercise at all: at two sessions a week and this volume, repetition would have cost variety it cannot spare. `Wall Push Ups` rather than a floor push up, because the wall is the only push-up regression whose difficulty she can dial herself by moving her feet. Session B's `Staggered squats` is the first single-side work in the whole library and is deliberately not a split squat. The band is the only equipment; the cautions say so.

**Beginner Strength and Stability.** Session A is entirely bodyweight and Session B is the dumbbell day, so the program genuinely runs without dumbbells if she has none, which is what "dumbbells optional" has to mean to be true. `Single-Leg Step Balance` in Session C needs a step or a bottom stair, flagged in the cautions. `Single Arm Dumbbell Row` is the one repeat, in B and C.

**Back-to-Exercise Reset.** `Hip hinge` is used as the Session A mobility slot on purpose: it is a teaching slot rather than a warm-up, because the hinge is the pattern that comes back slowest after a long break. Session B's main movement is `Sumo squats` rather than a narrow squat, so a stiff ankle is not the limiting factor in week 1. No repeat. Delayed soreness is called out in the cautions because week 2 is where this population quits.

**Active Aging and Balance.** **Not one slot in this program requires getting down to or up from the floor.** That was treated as a hard constraint, and it is what shaped the core block: `Chair Twists`, `Half Roll Backs` and `Alternating Side Reaches` are one core movement per session rather than the two the rest of the library runs, because the chair-based core list is only three long. Sessions run 3 opener, 4 strength, 1 core, so ranks 1 to 5 still belong to strength and core. Light dumbbells appear in Session C including a carry, which is deliberate: a loaded carry is one of the best things this population can do and there is no reason to withhold it. The step in Session B is flagged as needing to be low and fixed.

**Gym Strength Foundation.** Machine and cable led, with no barbell anywhere. That is a judgment call: a barbell back squat is a better long-term lift than a leg press, but it is a worse *first* lift for somebody whose limiting factor is confidence and setup time. `Chest Supported Row Machine` is the one repeat, so the pull is practised twice, and the chest support is what keeps the low back out of it. The cautions ask the coach to write the seat and pad settings down with her, because otherwise week 2 is another setup session.

**Strong After 40.** The flagship, and deliberately the most conventional program in the library: five patterns, three days, real volume. `Split Squat` is the loaded stationary version rather than the bodyweight one, because this population is ready for it. `Dumbbell Step Ups` in Session C is the only stepping movement and it is loaded rather than balanced. The cautions ask for a check-in *before* week 3 rather than after it, because week 3 is where the volume actually lands.

**Menopause Strength Foundation.** The member-facing text claims nothing: no symptom, no hormone, no bone. It describes standing up, hinging, pushing, pulling and carrying, and stops there. The coach-facing cautions say in as many words that nothing here treats a symptom or a diagnosis and that anything medical belongs with her own clinician, and they ask the coach to check before following the week 3 progression, because sleep is frequently the limiting factor rather than capacity. Weight-bearing and standing work is favoured over floor work; there is no jumping and no impact anywhere. "Impact-appropriate loading" was read as **weight-bearing loading appropriate to the population**, which for a conservative program is loaded standing work and carries rather than any actual impact.

**Low-Impact Strength and Conditioning.** Zero impact was checked by hand against every one of its 27 slots: nothing jumps, hops, lands or runs. The conditioning is bought with rep range and rest instead, which is why its rep counts run higher and its rests run shorter than anything else in the collection. `Wall Sit` is used as a strength slot rather than as a filler: an isometric is the highest-effort thing available that cannot produce impact.

**Energy and Recovery Movement Plan.** Every strength slot runs a 3-1-3 tempo with ninety second rests. This is the lightest program in the library that is still a strength program, and the cautions say plainly that if she consistently finishes it feeling worse, the problem is upstream of training and this is not the fix.

**Bone, Balance and Strength Support.** The one to read most carefully. The program *name* is the coach's shelf label; **nothing a member reads mentions bone at all**, and the description says only that it is weight-bearing strength work and time on one leg. The cautions state that the program treats nothing and diagnoses nothing, that a density result or a diagnosis belongs with her own clinician, and that a fracture history or a recent fall means clinical clearance first and probably Active Aging and Balance instead. `Single-Leg Step Balance` is the locked balance slot and progresses from a 20 to a 30 second hold in week 3, which is the "balance holds get longer" the member description promises.

**Desk Worker Movement Reset.** Rowing appears in two of three sessions, which is the one repeat, because pull volume is the single biggest thing missing from this population. `Slingshot into T-Spine rotation` opens Session B. The coach-facing purpose states explicitly that this is **not** a corrective program and must not be assigned in place of one where an assessment has found something; the cautions repeat it.

**Busy Parent Three-Day Plan.** The only program with a two-movement opener and seven slots a session. That is the whole design: if the choice is between this being done three times and a better program being done once, this is the better program. Because two of its three sessions have no core hold, its week 3 progression is the main lift alone, and its member description says exactly that rather than claiming longer holds it does not have.

**Low-Stress Training Week.** Opens lying down rather than standing, in both sessions, so the session starts by settling rather than revving. Ninety second rests throughout. The cautions state that this manages training load and nothing else, and that it should never be offered as an answer to a mental health concern.

**Travel and Hotel Program.** Session A is entirely bodyweight and fits in a hotel room with no gym at all. Sessions B and C use dumbbells only: **no barbell, no cable, no machine and no bench anywhere**, so nothing depends on what a particular hotel gym happens to own. The cautions warn that hotel dumbbells jump in five pound steps and tell the coach to have her add reps rather than chase the number.

**Return After Illness or Extended Break.** The gentlest in the library and the only one whose repeat is not a row. `Narrow Squats with Chair` appears in both sessions on purpose: the sit-to-stand is the single most useful thing to rebuild first, so it is practised twice a week rather than once, and both slots say so. Ninety second rests on every strength slot. Only two slots leave the chair, `Dead Bug` and `Bird Dog`, and both are done lying down or on hands and knees rather than requiring her to get up off the floor from low. The cautions are the longest in the library and say that this program assumes clearance to exercise, that post-viral fatigue presents as a good session followed by two bad days, and that the load should be zero for the first fortnight in most cases.

**Golf Mobility and Performance Foundation.** The core blocks are anti-rotation and anti-extension throughout and there is not one twisting crunch in the program, which is the coaching point for a rotational athlete. The catalog gap above is the real limitation here. The cautions state that this is a general strength and mobility base and not swing coaching, and that low back pain in this population must be assessed before rotation work is loaded.

### What was deliberately not done

- **No catalog rows were edited, added, renamed or reclassified.** Where the catalog lacked a good option, the best safe available option was used and flagged above.
- **No engine, schema or flow change.** The migration adds rows to three existing tables and nothing else.
- **No display-only aliases.** Every slot's `exercise_name` is byte-identical to the catalog's `name`, asserted by a test, because an alias and a real name disagree on the next screen.
- **Undulating periodization is parked.** All sixteen declare `linear`.
- **No preset loads.** The coach sets the first weight with her in the room, and the load engine takes over from her own logs.
